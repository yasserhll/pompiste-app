<?php

namespace App\Models\Fuel;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class FuelAttachment extends Model
{
    use \App\Models\Concerns\LocalDates;

    protected $guarded = ['id'];

    protected $hidden = ['disk', 'path', 'attachable_type'];

    public function attachable() { return $this->morphTo(); }
    public function uploader()   { return $this->belongsTo(User::class, 'uploaded_by'); }
}
