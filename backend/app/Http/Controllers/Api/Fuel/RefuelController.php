<?php

namespace App\Http\Controllers\Api\Fuel;

use App\Models\Fuel\FuelRefuel;
use App\Services\Fuel\AuditLogger;
use App\Services\Fuel\FuelAccess;
use App\Services\Fuel\QrCodeService;
use App\Services\Fuel\RefuelService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;

class RefuelController extends FuelController
{
    public function __construct(FuelAccess $access, AuditLogger $audit, private RefuelService $refuels, private QrCodeService $qr)
    {
        parent::__construct($access, $audit);
    }

    // GET /fuel/refuels — historique filtrable (périmètre appliqué côté serveur)
    public function index(Request $r)
    {
        $this->requireModule($r);
        $q = FuelRefuel::query()->with(['tank:id,code', 'attachments:id,attachable_id,attachable_type'])
            ->withCount('anomalies');
        $this->access->scopeRefuels($q, $r->user());

        if ($v = $r->query('from')) $q->where('refueled_at', '>=', $v . ' 00:00:00');
        if ($v = $r->query('to')) $q->where('refueled_at', '<=', $v . ' 23:59:59');
        foreach (['fuel_tank_id', 'site_id', 'vehicle_id', 'driver_id', 'pump_attendant_id', 'work_shift_id', 'status'] as $f) {
            if (($v = $r->query($f)) !== null && $v !== '') $q->where($f, $v);
        }
        if ($v = $r->query('vehicle_category')) $q->where('vehicle_category', $v);
        if ($r->boolean('anomalies_only')) $q->where('has_anomaly', true);
        if ($s = trim((string) $r->query('search'))) {
            $q->where(fn ($w) => $w->where('voucher_number', 'like', "%$s%")->orWhere('paper_voucher_number', 'like', "%$s%")
                ->orWhere('vehicle_code', 'like', "%$s%")->orWhere('vehicle_immatriculation', 'like', "%$s%")
                ->orWhere('driver_name', 'like', "%$s%"));
        }

        return $q->orderByDesc('refueled_at')->orderByDesc('id')->paginate($this->perPage($r));
    }

    // GET /fuel/refuels/{id} — détail complet d'un bon
    public function show(Request $r, int $id)
    {
        $this->requireModule($r);
        $refuel = $this->visible($r, $id);
        $refuel->load(['tank.site', 'dispenser', 'attachments', 'anomalies', 'corrections.requester:id,name', 'corrections.reviewer:id,name',
            'corrects:id,voucher_number', 'auditLogs.user:id,name']);
        $replacedBy = FuelRefuel::where('corrects_refuel_id', $refuel->id)->first(['id', 'voucher_number']);
        return response()->json(['refuel' => $refuel, 'replaced_by' => $replacedBy]);
    }

    // POST /fuel/scan — contenu du QR (ou vehicle_id pour la recherche manuelle) + citerne → fiche
    public function scan(Request $r)
    {
        $this->requireModule($r);
        $data = $r->validate([
            'fuel_tank_id' => 'required|integer',
            'qr' => 'required_without:vehicle_id|nullable|string|max:255',
            'vehicle_id' => 'required_without:qr|nullable|integer',
        ]);
        $tank = $this->tankFor($r, $data['fuel_tank_id'], 'refuel');
        $vehicle = !empty($data['qr']) ? $this->qr->resolve($data['qr']) : \App\Models\Vehicle::with('site')->findOrFail($data['vehicle_id']);

        // Aperçu sans séries : affectation, shift, dernier compteur, série attendue
        $e = $this->refuels->evaluate($r->user(), [
            'fuel_tank_id' => $tank->id, 'vehicle_id' => $vehicle->id,
            'fuel_dispenser_id' => $r->input('fuel_dispenser_id'),
            'index_start' => '0', 'index_end' => '0',
        ], $tank);
        $out = $this->refuels->presentEvaluation($e, $r->user());
        // Les contrôles liés aux séries saisies n'ont pas de sens avant la saisie
        $out['warnings'] = array_values(array_filter($out['warnings'], fn ($w) => !in_array($w['code'],
            ['quantite_nulle', 'serie_incoherente', 'compteur_absent', 'serie_fin_inferieure'], true)));
        $out['identified_by'] = !empty($data['qr']) ? 'qr' : 'manuel';
        unset($out['index_start'], $out['index_end'], $out['quantity_l'], $out['can_submit']);
        return response()->json($out);
    }

    // POST /fuel/refuels/preview — contrôle complet avant validation, sans écriture
    public function preview(Request $r)
    {
        $this->requireModule($r);
        return response()->json($this->refuels->preview($r->user(), $this->validated($r, false)));
    }

    // POST /fuel/refuels — validation (idempotent sur client_uuid)
    public function store(Request $r)
    {
        $this->requireModule($r);
        $in = $this->validated($r, true);
        ['refuel' => $refuel, 'replayed' => $replayed] = $this->refuels->create($r->user(), $in);
        $refuel->load(['tank:id,code,name', 'attachments']);
        return response()->json(['refuel' => $refuel, 'replayed' => $replayed], $replayed ? 200 : 201);
    }

    // POST /fuel/refuels/{id}/cancel — annulation directe par l'administrateur
    public function cancel(Request $r, int $id)
    {
        $this->requireModule($r);
        $this->requireAdmin($r);
        $data = $r->validate(['reason' => 'required|string|min:5|max:500']);
        return response()->json($this->refuels->cancel($r->user(), FuelRefuel::findOrFail($id), $data['reason']));
    }

    // GET /fuel/refuels/{id}/voucher.pdf — bon numérique imprimable
    public function voucherPdf(Request $r, int $id)
    {
        $this->requireModule($r);
        $refuel = $this->visible($r, $id)->load('tank.site', 'attachments');
        $pdf = Pdf::loadView('fuel.voucher', ['f' => $refuel])->setPaper('a5');
        return $pdf->download("bon-{$refuel->voucher_number}.pdf");
    }

    private function visible(Request $r, int $id): FuelRefuel
    {
        $q = FuelRefuel::whereKey($id);
        $this->access->scopeRefuels($q, $r->user());
        return $q->firstOrFail();
    }

    private function validated(Request $r, bool $forStore): array
    {
        $rules = [
            'fuel_tank_id' => 'required|integer',
            'fuel_dispenser_id' => 'nullable|integer',
            'vehicle_id' => 'required|integer',
            'identified_by' => 'nullable|in:qr,manuel',
            'driver_id' => 'nullable|integer',
            'driver_reason' => 'nullable|string|max:255',
            'index_start' => 'required',
            'index_end' => 'required',
            'declared_quantity_l' => 'nullable',
            'counter_value' => 'nullable',
            'paper_voucher_number' => 'nullable|string|max:50',
            'remark' => 'nullable|string|max:500',
            'attachment_ids' => 'nullable|array|max:10',
            'attachment_ids.*' => 'integer',
            'confirmed_warnings' => 'nullable|array',
            'confirmed_warnings.*' => 'string|max:50',
        ];
        if ($forStore) $rules['client_uuid'] = 'required|uuid';
        $in = $r->validate($rules);
        // Les nombres sont toujours traités comme du texte (normalisation + bcmath)
        foreach (['index_start', 'index_end', 'declared_quantity_l', 'counter_value'] as $k) {
            if (isset($in[$k]) && !is_string($in[$k])) $in[$k] = is_float($in[$k]) ? rtrim(rtrim(sprintf('%.2f', $in[$k]), '0'), '.') : (string) $in[$k];
        }
        return $in;
    }
}
