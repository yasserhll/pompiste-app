<?php

namespace App\Models;

use App\Models\Fuel\FuelTank;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

/**
 * Rôles : admin | responsable_site | pompiste.
 * Périmètre : sites (site_user) pour le responsable, citernes (fuel_tank_user) pour le pompiste.
 */
class User extends Authenticatable
{
    use \App\Models\Concerns\LocalDates;

    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = ['name', 'email', 'password', 'role', 'is_active'];

    protected $hidden = ['password', 'remember_token'];

    // Mêmes valeurs par défaut que la base, disponibles avant rechargement du modèle
    protected $attributes = ['role' => 'pompiste', 'is_active' => true];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
        ];
    }

    public function isAdmin(): bool { return $this->role === 'admin'; }
    public function isSiteManager(): bool { return $this->role === 'responsable_site'; }
    public function isPumpAttendant(): bool { return $this->role === 'pompiste'; }

    public function sites()     { return $this->belongsToMany(Site::class); }
    public function fuelTanks() { return $this->belongsToMany(FuelTank::class); }
}
