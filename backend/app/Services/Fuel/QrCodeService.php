<?php

namespace App\Services\Fuel;

use App\Models\Fuel\VehicleQrCode;
use App\Models\User;
use App\Models\Vehicle;
use Barryvdh\DomPDF\Facade\Pdf;
use Endroid\QrCode\Builder\Builder;
use Endroid\QrCode\ErrorCorrectionLevel;
use Endroid\QrCode\Writer\PngWriter;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * QR codes permanents : un jeton aléatoire par véhicule. Le QR ne contient que l'URL
 * de scan + jeton ; le backend fait le lien avec le véhicule. Un QR perdu ou copié
 * se désactive (revoke) et un nouveau jeton est émis (regenerate).
 */
class QrCodeService
{
    public function __construct(private AuditLogger $audit) {}

    /** Crée le QR des véhicules qui n'en ont pas encore. Ne touche pas aux QR existants. */
    public function generateMissing(User $user, ?array $vehicleIds = null): int
    {
        $q = Vehicle::whereDoesntHave('qrCodes', fn ($w) => $w->where('is_active', true));
        if ($vehicleIds !== null) $q->whereIn('id', $vehicleIds);

        $count = 0;
        $q->chunkById(200, function ($vehicles) use ($user, &$count) {
            foreach ($vehicles as $v) {
                VehicleQrCode::create(['vehicle_id' => $v->id, 'token' => VehicleQrCode::newToken(), 'created_by' => $user->id]);
                $count++;
            }
        });
        if ($count) $this->audit->log($user, 'qr.generation_masse', null, null, ['count' => $count]);
        return $count;
    }

    public function regenerate(User $user, Vehicle $vehicle, string $reason): VehicleQrCode
    {
        return DB::transaction(function () use ($user, $vehicle, $reason) {
            $this->revokeActive($user, $vehicle, $reason);
            $qr = VehicleQrCode::create(['vehicle_id' => $vehicle->id, 'token' => VehicleQrCode::newToken(), 'created_by' => $user->id]);
            $this->audit->log($user, 'qr.regenere', $vehicle, null, ['reason' => $reason]);
            return $qr;
        });
    }

    public function revokeActive(User $user, Vehicle $vehicle, string $reason): int
    {
        $n = VehicleQrCode::where('vehicle_id', $vehicle->id)->where('is_active', true)->update([
            'is_active' => false, 'revoked_at' => now(), 'revoked_by' => $user->id, 'revoke_reason' => $reason,
        ]);
        if ($n) $this->audit->log($user, 'qr.desactive', $vehicle, null, ['reason' => $reason]);
        return $n;
    }

    /** Véhicule correspondant à un contenu scanné. @throws ValidationException */
    public function resolve(string $scanned): Vehicle
    {
        $token = VehicleQrCode::tokenFromPayload($scanned);
        $qr = VehicleQrCode::with('vehicle.site')->where('token', $token)->first();
        if (!$qr) {
            throw ValidationException::withMessages(['qr' => ['QR code inconnu : utiliser la recherche par code de parc.']]);
        }
        if (!$qr->is_active) {
            throw ValidationException::withMessages(['qr' => [
                "Ce QR code a été désactivé ({$qr->revoke_reason}). Utiliser la recherche manuelle et signaler l'étiquette.",
            ]]);
        }
        return $qr->vehicle;
    }

    public function png(VehicleQrCode $qr, int $size = 400): string
    {
        return (new Builder(
            writer: new PngWriter(),
            data: $qr->payload(),
            errorCorrectionLevel: ErrorCorrectionLevel::Medium,
            size: $size,
            margin: 12,
        ))->build()->getString();
    }

    /** PDF d'étiquettes (3 × 4 par page A4), code de parc sous chaque QR. */
    public function labelsPdf(Collection $vehicles): string
    {
        $labels = $vehicles->map(function (Vehicle $v) {
            $qr = $v->activeQrCode;
            return $qr ? [
                'code' => $v->code_parc,
                'immatriculation' => $v->immatriculation,
                'site' => $v->site?->name,
                'img' => 'data:image/png;base64,' . base64_encode($this->png($qr, 320)),
            ] : null;
        })->filter()->values();

        return Pdf::loadView('fuel.qr-labels', ['labels' => $labels])->setPaper('a4')->output();
    }
}
