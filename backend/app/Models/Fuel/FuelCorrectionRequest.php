<?php

namespace App\Models\Fuel;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class FuelCorrectionRequest extends Model
{
    use \App\Models\Concerns\LocalDates;

    protected $guarded = ['id'];

    protected $casts = ['proposed_changes' => 'array', 'reviewed_at' => 'datetime'];

    public function refuel()      { return $this->belongsTo(FuelRefuel::class, 'fuel_refuel_id'); }
    public function requester()   { return $this->belongsTo(User::class, 'requested_by'); }
    public function reviewer()    { return $this->belongsTo(User::class, 'reviewed_by'); }
    public function replacement() { return $this->belongsTo(FuelRefuel::class, 'replacement_refuel_id'); }
}
