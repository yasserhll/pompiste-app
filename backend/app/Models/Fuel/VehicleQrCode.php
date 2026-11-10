<?php

namespace App\Models\Fuel;

use App\Models\Vehicle;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class VehicleQrCode extends Model
{
    use \App\Models\Concerns\LocalDates;

    protected $fillable = ['vehicle_id', 'token', 'is_active', 'revoked_at', 'revoked_by', 'revoke_reason', 'created_by'];

    protected $casts = ['is_active' => 'boolean', 'revoked_at' => 'datetime'];

    protected $hidden = ['token'];

    public function vehicle() { return $this->belongsTo(Vehicle::class); }

    /** Jeton aléatoire (~238 bits), sans aucune donnée du véhicule. */
    public static function newToken(): string
    {
        return Str::random(40);
    }

    /** Contenu encodé dans le QR : URL de l'application + jeton. */
    public function payload(): string
    {
        return rtrim((string) config('fuel.qr_base_url'), '/') . '/' . $this->token;
    }

    /** Extrait le jeton d'un contenu scanné (URL complète ou jeton seul). */
    public static function tokenFromPayload(string $scanned): string
    {
        $s = trim($scanned);
        if (preg_match('~/([A-Za-z0-9]{40})/?$~', $s, $m)) return $m[1];
        return $s;
    }
}
