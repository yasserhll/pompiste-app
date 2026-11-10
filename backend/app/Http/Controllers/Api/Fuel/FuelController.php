<?php

namespace App\Http\Controllers\Api\Fuel;

use App\Http\Controllers\Controller;
use App\Models\Fuel\FuelTank;
use App\Services\Fuel\AuditLogger;
use App\Services\Fuel\FuelAccess;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;

abstract class FuelController extends Controller
{
    public function __construct(protected FuelAccess $access, protected AuditLogger $audit) {}

    protected function requireModule(Request $r): void
    {
        if (!$this->access->hasModuleAccess($r->user())) {
            throw new AuthorizationException("Votre compte n'a pas accès au module gasoil.");
        }
    }

    protected function requireAdmin(Request $r): void
    {
        if (!$r->user()->isAdmin()) throw new AuthorizationException('Réservé à l\'administrateur.');
    }

    protected function tankFor(Request $r, int $id, string $ability): FuelTank
    {
        $tank = FuelTank::with('site')->findOrFail($id);
        $this->access->authorize($r->user(), $ability, $tank);
        return $tank;
    }

    protected function perPage(Request $r): int
    {
        return min(200, max(10, (int) $r->query('per_page', 50)));
    }
}
