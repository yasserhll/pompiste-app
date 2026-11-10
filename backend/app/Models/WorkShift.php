<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WorkShift extends Model
{
    use \App\Models\Concerns\LocalDates;

    protected $fillable = ['site_id', 'code', 'name', 'team_slot', 'start_time', 'end_time', 'is_active'];

    protected $casts = ['is_active' => 'boolean', 'team_slot' => 'integer'];

    public function site() { return $this->belongsTo(Site::class); }

    public function crossesMidnight(): bool
    {
        return $this->end_time <= $this->start_time;
    }
}
