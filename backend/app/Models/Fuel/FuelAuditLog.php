<?php

namespace App\Models\Fuel;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class FuelAuditLog extends Model
{
    use \App\Models\Concerns\LocalDates;

    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected $casts = ['old_values' => 'array', 'new_values' => 'array', 'created_at' => 'datetime'];

    public function user()      { return $this->belongsTo(User::class); }
    public function auditable() { return $this->morphTo(); }
}
