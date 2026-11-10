<?php

namespace App\Models;

use App\Models\Fuel\FuelTank;
use Illuminate\Database\Eloquent\Model;

class Site extends Model
{
    use \App\Models\Concerns\LocalDates;

    protected $fillable = ['code', 'name', 'is_active'];

    protected $casts = ['is_active' => 'boolean'];

    public function vehicles()  { return $this->hasMany(Vehicle::class); }
    public function tanks()     { return $this->hasMany(FuelTank::class); }
    public function shifts()    { return $this->hasMany(WorkShift::class); }
    public function users()     { return $this->belongsToMany(User::class); }
}
