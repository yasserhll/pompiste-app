<?php

namespace App\Models\Fuel;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class FuelAttachment extends Model
{
    use \App\Models\Concerns\LocalDates;

    protected $guarded = ['id'];

    protected $hidden = ['disk', 'path', 'thumb_path', 'attachable_type'];

    protected $appends = ['has_thumb'];

    public function getHasThumbAttribute(): bool { return $this->thumb_path !== null; }

    public function attachable() { return $this->morphTo(); }
    public function uploader()   { return $this->belongsTo(User::class, 'uploaded_by'); }
}
