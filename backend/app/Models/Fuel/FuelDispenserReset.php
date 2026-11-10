<?php

namespace App\Models\Fuel;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class FuelDispenserReset extends Model
{
    use \App\Models\Concerns\LocalDates;

    protected $fillable = ['fuel_dispenser_id', 'kind', 'old_index', 'new_index', 'reason', 'user_id', 'occurred_at'];

    protected $casts = ['old_index' => 'decimal:2', 'new_index' => 'decimal:2', 'occurred_at' => 'datetime'];

    public function dispenser() { return $this->belongsTo(FuelDispenser::class, 'fuel_dispenser_id'); }
    public function user()      { return $this->belongsTo(User::class); }
}
