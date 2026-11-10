<?php

namespace App\Models\Fuel;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class FuelAdjustment extends Model
{
    use \App\Models\Concerns\LocalDates;

    protected $guarded = ['id'];

    protected $casts = ['quantity_l' => 'decimal:2', 'effective_at' => 'datetime', 'reviewed_at' => 'datetime'];

    public function tank()        { return $this->belongsTo(FuelTank::class, 'fuel_tank_id'); }
    public function inventory()   { return $this->belongsTo(FuelInventory::class, 'fuel_inventory_id'); }
    public function requester()   { return $this->belongsTo(User::class, 'requested_by'); }
    public function attachments() { return $this->morphMany(FuelAttachment::class, 'attachable'); }
}
