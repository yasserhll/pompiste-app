<?php

namespace App\Http\Controllers\Api\Fuel;

use App\Models\Fuel\VehicleQrCode;
use App\Models\Vehicle;
use App\Services\Fuel\AuditLogger;
use App\Services\Fuel\FuelAccess;
use App\Services\Fuel\QrCodeService;
use Illuminate\Http\Request;

/** Gestion et impression des QR codes (administrateur). */
class QrCodeController extends FuelController
{
    public function __construct(FuelAccess $access, AuditLogger $audit, private QrCodeService $qr)
    {
        parent::__construct($access, $audit);
    }

    // POST /qr-codes/generate — génération en masse (véhicules sans QR actif)
    public function generate(Request $r)
    {
        $this->requireAdmin($r);
        $d = $r->validate(['vehicle_ids' => 'nullable|array', 'vehicle_ids.*' => 'integer']);
        return response()->json(['generated' => $this->qr->generateMissing($r->user(), $d['vehicle_ids'] ?? null)]);
    }

    public function regenerate(Request $r, int $vehicleId)
    {
        $this->requireAdmin($r);
        $d = $r->validate(['reason' => 'required|string|min:3|max:255']);
        $qr = $this->qr->regenerate($r->user(), Vehicle::findOrFail($vehicleId), $d['reason']);
        return response()->json(['id' => $qr->id, 'vehicle_id' => $qr->vehicle_id, 'created_at' => $qr->created_at], 201);
    }

    public function revoke(Request $r, int $vehicleId)
    {
        $this->requireAdmin($r);
        $d = $r->validate(['reason' => 'required|string|min:3|max:255']);
        return response()->json(['revoked' => $this->qr->revokeActive($r->user(), Vehicle::findOrFail($vehicleId), $d['reason'])]);
    }

    // GET /qr-codes/{vehicleId}.png
    public function png(Request $r, int $vehicleId)
    {
        $this->requireAdmin($r);
        $qr = VehicleQrCode::where('vehicle_id', $vehicleId)->where('is_active', true)->latest('id')->firstOrFail();
        $code = $qr->vehicle->code_parc;
        return response($this->qr->png($qr), 200, [
            'Content-Type' => 'image/png',
            'Content-Disposition' => 'inline; filename="qr-' . preg_replace('/[^A-Za-z0-9_-]/', '_', $code) . '.png"',
        ]);
    }

    // POST /qr-codes/labels.pdf — étiquettes à imprimer (sélection, site ou tout le parc)
    public function labels(Request $r)
    {
        $this->requireAdmin($r);
        $d = $r->validate(['vehicle_ids' => 'nullable|array', 'vehicle_ids.*' => 'integer', 'site_id' => 'nullable|integer']);
        $q = Vehicle::with(['site:id,name', 'activeQrCode'])->whereHas('qrCodes', fn ($w) => $w->where('is_active', true));
        if (!empty($d['vehicle_ids'])) $q->whereIn('id', $d['vehicle_ids']);
        if (!empty($d['site_id'])) $q->where('site_id', $d['site_id']);
        $vehicles = $q->orderBy('site_id')->orderBy('code_parc')->get();
        if ($vehicles->isEmpty()) abort(422, 'Aucun véhicule avec QR actif dans la sélection.');
        $this->audit->log($r->user(), 'qr.impression', null, null, ['count' => $vehicles->count()]);
        return response($this->qr->labelsPdf($vehicles), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="etiquettes-qr.pdf"',
        ]);
    }
}
