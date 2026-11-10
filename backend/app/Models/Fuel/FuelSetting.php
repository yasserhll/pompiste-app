<?php

namespace App\Models\Fuel;

use Illuminate\Database\Eloquent\Model;

class FuelSetting extends Model
{
    use \App\Models\Concerns\LocalDates;

    protected $primaryKey = 'key';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = ['key', 'value'];
    protected $casts = ['value' => 'json'];

    /** Valeur paramétrée, sinon défaut de config/fuel.php. */
    public static function get(string $key, mixed $default = null): mixed
    {
        $row = static::find($key);
        return $row ? $row->value : config("fuel.defaults.$key", $default);
    }
}
