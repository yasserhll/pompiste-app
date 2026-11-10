<?php

namespace App\Models\Fuel;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class FuelDelivery extends Model
{
    use \App\Models\Concerns\LocalDates;

    protected $guarded = ['id'];

    protected $casts = ['delivered_at' => 'datetime', 'quantity_l' => 'decimal:2', 'cancelled_at' => 'datetime'];

    public function tank()        { return $this->belongsTo(FuelTank::class, 'fuel_tank_id'); }
    public function user()        { return $this->belongsTo(User::class); }
    public function attachments() { return $this->morphMany(FuelAttachment::class, 'attachable'); }
}
