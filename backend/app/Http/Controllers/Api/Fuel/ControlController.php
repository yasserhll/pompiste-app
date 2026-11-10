<?php

namespace App\Http\Controllers\Api\Fuel;

use App\Models\Fuel\FuelAnomaly;
use App\Models\Fuel\FuelAttachment;
use App\Models\Fuel\FuelCorrectionRequest;
use App\Models\Fuel\FuelRefuel;
use App\Models\Fuel\FuelTank;
use App\Services\Fuel\AuditLogger;
use App\Services\Fuel\FuelAccess;
use App\Services\Fuel\RefuelService;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/** Justificatifs, anomalies et demandes de correction / annulation. */
class ControlController extends FuelController
{
    public function __construct(FuelAccess $access, AuditLogger $audit, private RefuelService $refuels)
    {
        parent::__construct($access, $audit);
    }

    // ── Justificatifs ─────────────────────────────────────────────
    // POST /attachments — upload avant validation (rattaché ensuite par attachment_ids)
    public function upload(Request $r)
    {
        $this->requireModule($r);
        $d = $r->validate([
            'file' => 'required|file|mimes:jpg,jpeg,png,webp,heic,heif,pdf|max:' . config('fuel.attachment_max_kb'),
            'kind' => 'nullable|in:bon_papier,photo,bon_livraison,autre',
        ]);
        $file = $d['file'];
        $disk = config('fuel.attachments_disk');
        $path = $file->store('fuel/' . now()->format('Y/m'), $disk);
        $att = FuelAttachment::create([
            'kind' => $d['kind'] ?? 'photo', 'disk' => $disk, 'path' => $path,
            'original_name' => mb_substr($file->getClientOriginalName(), 0, 255), 'mime' => $file->getMimeType(),
            'size' => $file->getSize(), 'sha256' => hash_file('sha256', $file->getRealPath()), 'uploaded_by' => $r->user()->id,
        ]);
        return response()->json($att, 201);
    }

    // GET /attachments/{id} — flux du fichier, contrôlé par le périmètre de l'objet rattaché
    public function download(Request $r, int $id)
    {
        $this->requireModule($r);
        $att = FuelAttachment::findOrFail($id);
        $u = $r->user();
        if ($att->attachable_id === null) {
            if ($att->uploaded_by !== $u->id && !$u->isAdmin()) abort(403);
        } else {
            $owner = $att->attachable;
            $tank = $owner ? FuelTank::find($owner->fuel_tank_id) : null;
            if (!$tank || !$this->access->can($u, 'view', $tank)) abort(403);
            if ($owner instanceof FuelRefuel && $u->isPumpAttendant() && $owner->pump_attendant_id !== $u->id) abort(403);
        }
        return Storage::disk($att->disk)->response($att->path, $att->original_name, [
            'Content-Type' => $att->mime, 'Cache-Control' => 'private, max-age=600',
        ]);
    }

    // ── Anomalies ────────────────────────────────────────────────
    public function anomalies(Request $r)
    {
        $this->requireModule($r);
        if ($r->user()->isPumpAttendant()) abort(403, 'Réservé aux responsables et administrateurs.');
        $q = FuelAnomaly::with(['tank:id,code', 'refuel:id,voucher_number,vehicle_code,quantity_l,refueled_at', 'vehicle:id,code_parc']);
        $this->access->scopeTanks($q, $r->user());
        foreach (['status', 'type', 'severity', 'fuel_tank_id', 'site_id'] as $f) {
            if ($v = $r->query($f)) $q->where($f, $v);
        }
        if ($v = $r->query('from')) $q->where('created_at', '>=', $v . ' 00:00:00');
        if ($v = $r->query('to')) $q->where('created_at', '<=', $v . ' 23:59:59');
        return $q->orderByDesc('created_at')->paginate($this->perPage($r));
    }

    public function updateAnomaly(Request $r, int $id)
    {
        $this->requireModule($r);
        if ($r->user()->isPumpAttendant()) abort(403);
        $a = FuelAnomaly::findOrFail($id);
        if ($a->fuel_tank_id) $this->tankFor($r, $a->fuel_tank_id, 'view');
        $d = $r->validate(['status' => 'required|in:ouverte,traitee,ignoree', 'resolution_note' => 'required_unless:status,ouverte|nullable|string|max:500']);
        $old = $a->only(['status', 'resolution_note']);
        $a->forceFill($d + ['resolved_by' => $d['status'] === 'ouverte' ? null : $r->user()->id,
            'resolved_at' => $d['status'] === 'ouverte' ? null : now()])->save();
        $this->audit->log($r->user(), 'anomalie.traitee', $a, $old, $d);
        return response()->json($a);
    }

    // ── Corrections / annulations ────────────────────────────────
    public function corrections(Request $r)
    {
        $this->requireModule($r);
        $q = FuelCorrectionRequest::with(['refuel:id,voucher_number,vehicle_code,quantity_l,fuel_tank_id,status', 'requester:id,name', 'reviewer:id,name']);
        $q->whereHas('refuel', fn ($w) => $this->access->scopeRefuels($w, $r->user()));
        if ($v = $r->query('status')) $q->where('status', $v);
        return $q->orderByDesc('created_at')->paginate($this->perPage($r));
    }

    public function requestCorrection(Request $r, int $refuelId)
    {
        $this->requireModule($r);
        $q = FuelRefuel::whereKey($refuelId);
        $this->access->scopeRefuels($q, $r->user());
        $refuel = $q->firstOrFail();
        $this->access->authorize($r->user(), 'request_correction', $refuel->tank);
        if ($refuel->status !== 'valide') throw ValidationException::withMessages(['refuel' => ['Ce bon est déjà annulé.']]);

        $d = $r->validate([
            'kind' => 'required|in:annulation,correction',
            'reason' => 'required|string|min:5|max:500',
            'changes' => 'required_if:kind,correction|nullable|array',
            'changes.index_start' => 'nullable', 'changes.index_end' => 'nullable', 'changes.counter_value' => 'nullable',
            'changes.vehicle_id' => 'nullable|integer|exists:vehicles,id', 'changes.driver_id' => 'nullable|integer|exists:drivers,id',
            'changes.paper_voucher_number' => 'nullable|string|max:50', 'changes.remark' => 'nullable|string|max:500',
        ]);
        if (FuelCorrectionRequest::where('fuel_refuel_id', $refuel->id)->where('status', 'en_attente')->exists()) {
            throw ValidationException::withMessages(['refuel' => ['Une demande est déjà en attente pour ce bon.']]);
        }
        $req = FuelCorrectionRequest::create([
            'fuel_refuel_id' => $refuel->id, 'kind' => $d['kind'], 'reason' => $d['reason'],
            'proposed_changes' => $d['kind'] === 'correction' ? array_map(fn ($v) => is_numeric($v) ? (string) $v : $v, $d['changes'] ?? []) : null,
            'requested_by' => $r->user()->id,
        ]);
        $this->audit->log($r->user(), 'correction.demandee', $refuel, null, $req->toArray());
        return response()->json($req, 201);
    }

    public function reviewCorrection(Request $r, int $id)
    {
        $this->requireModule($r);
        $this->requireAdmin($r);
        $d = $r->validate(['approve' => 'required|boolean', 'note' => 'nullable|string|max:500']);

        return DB::transaction(function () use ($r, $id, $d) {
            $req = FuelCorrectionRequest::whereKey($id)->lockForUpdate()->firstOrFail();
            if ($req->status !== 'en_attente') throw ValidationException::withMessages(['status' => ['Demande déjà traitée.']]);
            $replacement = null;
            if ($d['approve']) {
                $refuel = $req->refuel;
                if ($req->kind === 'annulation') {
                    $this->refuels->cancel($r->user(), $refuel, $req->reason);
                } else {
                    $replacement = $this->refuels->correct($r->user(), $refuel, $req->proposed_changes ?? [], $req->reason);
                }
            }
            $req->forceFill([
                'status' => $d['approve'] ? 'approuve' : 'rejete', 'reviewed_by' => $r->user()->id,
                'reviewed_at' => CarbonImmutable::now(), 'review_note' => $d['note'] ?? null,
                'replacement_refuel_id' => $replacement?->id,
            ])->save();
            $this->audit->log($r->user(), $d['approve'] ? 'correction.approuvee' : 'correction.rejetee', $req, null, $d);
            return response()->json($req->fresh(['refuel', 'replacement']));
        });
    }
}
