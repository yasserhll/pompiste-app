<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Fuel\FuelController;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Gestion des comptes (admin) : rôle, activation, sites et citernes autorisés. */
class UserController extends FuelController
{
    public function index(Request $r)
    {
        $this->requireAdmin($r);
        return User::with(['sites:id,code,name', 'fuelTanks:id,code,name'])->orderBy('name')
            ->get(['id', 'name', 'email', 'role', 'is_active', 'created_at']);
    }

    public function store(Request $r)
    {
        $this->requireAdmin($r);
        $d = $r->validate($this->rules());
        $user = User::create($d);
        $this->syncScope($user, $r);
        $this->audit->log($r->user(), 'utilisateur.cree', $user, null, $user->only(['name', 'email', 'role']));
        return response()->json($user->load('sites:id,code,name', 'fuelTanks:id,code,name'), 201);
    }

    public function update(Request $r, int $id)
    {
        $this->requireAdmin($r);
        $user = User::findOrFail($id);
        $d = $r->validate($this->rules($user));
        if (empty($d['password'])) unset($d['password']);
        if ($user->id === $r->user()->id && (($d['role'] ?? 'admin') !== 'admin' || ($d['is_active'] ?? true) === false)) {
            throw ValidationException::withMessages(['role' => ['Vous ne pouvez pas retirer vos propres droits administrateur.']]);
        }
        $old = $user->only(['name', 'email', 'role', 'is_active']);
        $user->update($d);
        $this->syncScope($user, $r);
        if (isset($d['password']) || ($d['is_active'] ?? true) === false) $user->tokens()->delete();
        $this->audit->log($r->user(), 'utilisateur.modifie', $user, $old, $user->only(['name', 'email', 'role', 'is_active']));
        return response()->json($user->load('sites:id,code,name', 'fuelTanks:id,code,name'));
    }

    private function rules(?User $u = null): array
    {
        return [
            'name' => [$u ? 'sometimes' : 'required', 'string', 'max:255'],
            'email' => [$u ? 'sometimes' : 'required', 'email', Rule::unique('users', 'email')->ignore($u?->id)],
            'password' => [$u ? 'nullable' : 'required', 'string', 'min:8'],
            'role' => [$u ? 'sometimes' : 'required', 'in:admin,responsable_site,pompiste'],
            'is_active' => ['sometimes', 'boolean'],
            'site_ids' => ['sometimes', 'array'], 'site_ids.*' => ['integer', 'exists:sites,id'],
            'tank_ids' => ['sometimes', 'array'], 'tank_ids.*' => ['integer', 'exists:fuel_tanks,id'],
        ];
    }

    private function syncScope(User $user, Request $r): void
    {
        if ($r->has('site_ids')) $user->sites()->sync($r->input('site_ids', []));
        if ($r->has('tank_ids')) $user->fuelTanks()->sync($r->input('tank_ids', []));
    }
}
