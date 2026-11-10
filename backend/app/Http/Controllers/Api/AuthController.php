<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Fuel\FuelAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(private FuelAccess $access) {}

    // POST /login
    public function login(Request $r)
    {
        $d = $r->validate(['email' => 'required|email', 'password' => 'required|string']);
        $key = 'login:' . strtolower($d['email']) . '|' . $r->ip();
        if (RateLimiter::tooManyAttempts($key, 5)) {
            throw ValidationException::withMessages(['email' => ['Trop de tentatives. Réessayer dans ' . RateLimiter::availableIn($key) . ' s.']]);
        }

        $user = User::where('email', $d['email'])->first();
        if (!$user || !Hash::check($d['password'], $user->password)) {
            RateLimiter::hit($key, 300);
            throw ValidationException::withMessages(['email' => ['Email ou mot de passe incorrect.']]);
        }
        if (!$user->is_active) {
            throw ValidationException::withMessages(['email' => ['Compte désactivé. Contacter l\'administrateur.']]);
        }
        RateLimiter::clear($key);

        return response()->json([
            'token' => $user->createToken('pompiste-app', ['*'], now()->addDays(30))->plainTextToken,
            'user' => $this->profile($user),
        ]);
    }

    public function logout(Request $r)
    {
        $r->user()->currentAccessToken()->delete();
        return response()->json(['ok' => true]);
    }

    // GET /me — profil + périmètre (sites, citernes) pour l'interface
    public function me(Request $r)
    {
        return response()->json($this->profile($r->user()));
    }

    private function profile(User $u): array
    {
        $tankIds = $this->access->tankIds($u);
        $tanks = \App\Models\Fuel\FuelTank::with('site:id,code,name')->where('is_active', true)
            ->when($tankIds !== null, fn ($q) => $q->whereIn('id', $tankIds))->orderBy('code')
            ->get(['id', 'code', 'name', 'kind', 'site_id']);
        return [
            'id' => $u->id, 'name' => $u->name, 'email' => $u->email, 'role' => $u->role, 'is_active' => $u->is_active,
            'tanks' => $tanks,
            'site_ids' => $this->access->siteIds($u),
            'permissions' => collect(FuelAccess::ABILITIES)->mapWithKeys(fn ($a) => [$a => $this->access->can($u, $a)]),
        ];
    }
}
