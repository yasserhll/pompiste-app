<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DriverAssignment extends Model
{
    use \App\Models\Concerns\LocalDates;

    protected $fillable = [
        'vehicle_id', 'driver_id', 'team_slot', 'site_id', 'starts_on', 'ends_on',
        'is_replacement', 'source', 'legacy_affectation_id', 'created_by',
    ];

    protected $casts = [
        'starts_on' => 'date:Y-m-d',
        'ends_on' => 'date:Y-m-d',
        'is_replacement' => 'boolean',
        'team_slot' => 'integer',
    ];

    public function vehicle() { return $this->belongsTo(Vehicle::class); }
    public function driver()  { return $this->belongsTo(Driver::class); }
    public function site()    { return $this->belongsTo(Site::class); }

    /** Affectations en vigueur à une date (Y-m-d). */
    public function scopeActiveOn($q, string $date)
    {
        return $q->where('starts_on', '<=', $date)
            ->where(fn ($w) => $w->whereNull('ends_on')->orWhere('ends_on', '>=', $date));
    }
}
