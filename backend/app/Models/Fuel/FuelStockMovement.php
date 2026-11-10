<?php

namespace App\Models\Fuel;

use Illuminate\Database\Eloquent\Model;

class FuelStockMovement extends Model
{
    use \App\Models\Concerns\LocalDates;

    protected $guarded = ['id'];

    protected $casts = ['quantity_l' => 'decimal:2', 'balance_after_l' => 'decimal:2', 'occurred_at' => 'datetime'];

    public function tank()   { return $this->belongsTo(FuelTank::class, 'fuel_tank_id'); }
    public function source() { return $this->morphTo(); }
}
