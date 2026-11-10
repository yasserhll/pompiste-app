<?php

namespace App\Models;

use App\Models\Fuel\FuelRefuel;
use App\Models\Fuel\VehicleQrCode;
use Illuminate\Database\Eloquent\Model;

class Vehicle extends Model
{
    use \App\Models\Concerns\LocalDates;

    protected $fillable = [
        'site_id', 'code_parc', 'immatriculation', 'chassis', 'type_label', 'owner_company',
        'category', 'counter_unit', 'tank_capacity_l', 'status', 'status_note',
    ];

    protected $casts = ['tank_capacity_l' => 'decimal:2'];

    public function site()        { return $this->belongsTo(Site::class); }
    public function assignments() { return $this->hasMany(DriverAssignment::class); }
    public function qrCodes()     { return $this->hasMany(VehicleQrCode::class); }
    public function activeQrCode(){ return $this->hasOne(VehicleQrCode::class)->where('is_active', true)->latestOfMany(); }
    public function refuels()     { return $this->hasMany(FuelRefuel::class); }
    public function fuelTank()    { return $this->hasOne(\App\Models\Fuel\FuelTank::class)->where('is_active', true); }

    /** Catégorie et unité de compteur déduites du libellé de type du fichier d'affectation. */
    public static function classify(?string $typeLabel): array
    {
        $t = strtoupper(preg_replace('/\s+/', ' ', trim((string) $typeLabel)));
        $engin = ['PELLE', 'BULL', 'CHARGEUSE', 'NIVELEUSE', 'NIVLEUSE', 'COMPACTEUR', 'TRAX'];
        foreach ($engin as $k) {
            if (str_contains($t, $k)) return ['engin', 'h'];
        }
        // Camions SINOTRUK : compteur horaire (bons D222 « 3808 H », D265 « 834 H », historique mobile 1.xlsx)
        if (str_contains($t, 'SINOTRUK') || str_contains($t, 'SITRAK')) return ['camion', 'h'];
        if (str_contains($t, 'CITERNE')) return ['citerne', 'km'];
        if (in_array($t, ['VEHICULE', 'MINIBUS', 'MINI BUS', 'PICKUP'], true)) return ['vehicule_leger', 'km'];
        if ($t === '') return ['autre', 'km'];
        return ['camion', 'km'];
    }
}
