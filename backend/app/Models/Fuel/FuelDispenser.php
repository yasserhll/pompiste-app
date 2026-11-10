<?php

namespace App\Models\Fuel;

use Illuminate\Database\Eloquent\Model;

class FuelDispenser extends Model
{
    use \App\Models\Concerns\LocalDates;

    // current_index ne change que par RefuelService / reset audité.
    protected $fillable = ['fuel_tank_id', 'code', 'name', 'is_active'];

    protected $casts = ['current_index' => 'decimal:2', 'is_active' => 'boolean'];

    public function tank()   { return $this->belongsTo(FuelTank::class, 'fuel_tank_id'); }
    public function resets() { return $this->hasMany(FuelDispenserReset::class); }
}
