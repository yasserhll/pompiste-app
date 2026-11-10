<?php

namespace App\Models\Fuel;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class FuelInventory extends Model
{
    use \App\Models\Concerns\LocalDates;

    protected $guarded = ['id'];

    protected $casts = [
        'measured_at' => 'datetime', 'reviewed_at' => 'datetime',
        'measured_quantity_l' => 'decimal:2', 'theoretical_quantity_l' => 'decimal:2', 'difference_l' => 'decimal:2',
    ];

    public function tank()        { return $this->belongsTo(FuelTank::class, 'fuel_tank_id'); }
    public function user()        { return $this->belongsTo(User::class); }
    public function adjustment()  { return $this->hasOne(FuelAdjustment::class); }
    public function attachments() { return $this->morphMany(FuelAttachment::class, 'attachable'); }
}
