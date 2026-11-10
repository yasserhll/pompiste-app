<?php

namespace App\Services\Fuel;

use App\Models\Fuel\FuelSetting;
use App\Models\Fuel\FuelTank;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Builder;

/**
 * Autorisations du module gasoil, toujours vérifiées côté serveur.
 *
 *   admin             : tout.
 *   responsable_site  : sites rattachés (site_user) et leurs citernes ; consultation, livraisons,
 *                       inventaires, demandes de correction ; pas d'approbation.
 *   pompiste          : citernes rattachées (fuel_tank_user) ; ravitaillements, inventaires,
 *                       ses propres opérations ; stock visible selon le paramètre.
 */
class FuelAccess
{
    public const ABILITIES = ['view', 'refuel', 'deliver', 'inventory', 'request_correction', 'approve', 'manage'];

    public function hasModuleAccess(User $u): bool
    {
        return $u->is_active && in_array($u->role, ['admin', 'responsable_site', 'pompiste'], true);
    }

    /** null = toutes les citernes. */
    public function tankIds(User $u): ?array
    {
        return match ($u->role) {
            'admin' => null,
            'responsable_site' => FuelTank::whereIn('site_id', $u->sites()->pluck('sites.id'))->pluck('id')->all(),
            'pompiste' => $u->fuelTanks()->pluck('fuel_tanks.id')->all(),
            default => [],
        };
    }

    /** null = tous les sites. */
    public function siteIds(User $u): ?array
    {
        return match ($u->role) {
            'admin' => null,
            'responsable_site' => $u->sites()->pluck('sites.id')->all(),
            'pompiste' => FuelTank::whereIn('id', $this->tankIds($u))->pluck('site_id')->unique()->values()->all(),
            default => [],
        };
    }

    public function can(User $u, string $ability, ?FuelTank $tank = null): bool
    {
        if (!$this->hasModuleAccess($u)) return false;
        if ($u->isAdmin()) return true;

        $allowed = match ($u->role) {
            'responsable_site' => in_array($ability, ['view', 'deliver', 'inventory', 'request_correction'], true),
            'pompiste' => match ($ability) {
                'view', 'refuel', 'inventory', 'request_correction' => true,
                'deliver' => (bool) FuelSetting::get('pompiste_can_record_delivery', false),
                default => false,
            },
            default => false,
        };
        if (!$allowed) return false;
        if ($tank === null) return true;

        return in_array($tank->id, $this->tankIds($u) ?? [], true);
    }

    /** @throws AuthorizationException */
    public function authorize(User $u, string $ability, ?FuelTank $tank = null): void
    {
        if (!$this->can($u, $ability, $tank)) {
            throw new AuthorizationException($tank
                ? "Accès refusé à la citerne {$tank->code}."
                : 'Action non autorisée pour votre rôle.');
        }
    }

    public function canSeeStock(User $u, FuelTank $tank): bool
    {
        if (!$this->can($u, 'view', $tank)) return false;
        return !$u->isPumpAttendant() || (bool) FuelSetting::get('pompiste_can_view_stock', true);
    }

    /** Restreint une requête par colonne fuel_tank_id (ou autre) au périmètre de l'utilisateur. */
    public function scopeTanks(Builder $q, User $u, string $column = 'fuel_tank_id'): Builder
    {
        $ids = $this->tankIds($u);
        return $ids === null ? $q : $q->whereIn($column, $ids);
    }

    /** Ravitaillements visibles : périmètre citernes + uniquement les siens pour un pompiste. */
    public function scopeRefuels(Builder $q, User $u): Builder
    {
        $this->scopeTanks($q, $u);
        if ($u->isPumpAttendant()) $q->where('pump_attendant_id', $u->id);
        return $q;
    }
}
