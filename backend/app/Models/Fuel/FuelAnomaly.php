<?php

namespace App\Models\Fuel;

use App\Models\Site;
use App\Models\Vehicle;
use Illuminate\Database\Eloquent\Model;

class FuelAnomaly extends Model
{
    use \App\Models\Concerns\LocalDates;

    protected $guarded = ['id'];

    protected $casts = ['data' => 'array', 'resolved_at' => 'datetime'];

    public function tank()    { return $this->belongsTo(FuelTank::class, 'fuel_tank_id'); }
    public function site()    { return $this->belongsTo(Site::class); }
    public function refuel()  { return $this->belongsTo(FuelRefuel::class, 'fuel_refuel_id'); }
    public function vehicle() { return $this->belongsTo(Vehicle::class); }
}
