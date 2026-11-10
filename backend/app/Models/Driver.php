<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Driver extends Model
{
    use \App\Models\Concerns\LocalDates;

    protected $fillable = ['name', 'name_key', 'matricule', 'phone', 'is_active'];

    protected $casts = ['is_active' => 'boolean'];

    public static function keyFor(string $name): string
    {
        return mb_strtoupper(preg_replace('/\s+/u', ' ', trim($name)));
    }

    public static function findOrCreateByName(string $name): self
    {
        $clean = preg_replace('/\s+/u', ' ', trim($name));
        return static::firstOrCreate(['name_key' => static::keyFor($clean)], ['name' => $clean]);
    }

    public function assignments() { return $this->hasMany(DriverAssignment::class); }
}
