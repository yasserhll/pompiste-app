<?php

namespace App\Http\Controllers\Api\Fuel;

use App\Models\Driver;
use App\Models\DriverAssignment;
use App\Models\Site;
use App\Models\Vehicle;
use App\Models\WorkShift;
use App\Services\Fuel\AssignmentResolver;
use App\Services\Fuel\AuditLogger;
use App\Services\Fuel\FuelAccess;
use App\Services\Fuel\VehiclePresenter;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Référentiel : sites, véhicules, conducteurs, shifts, affectations. */
class ReferenceController extends FuelController
{
    public function __construct(FuelAccess $access, AuditLogger $audit, private AssignmentResolver $resolver)
    {
        parent::__construct($access, $audit);
    }

    // ── Sites ──
    public function sites(Request $r)
    {
        $this->requireModule($r);
        $ids = $this->access->siteIds($r->user());
        return Site::when($ids !== null, fn ($q) => $q->whereIn('id', $ids))->orderBy('name')->get();
    }

    public function storeSite(Request $r)
    {
        $this->requireAdmin($r);
        $d = $r->validate(['code' => 'required|string|max:50|unique:sites,code', 'name' => 'required|string|max:255']);
        $site = Site::create($d);
        $this->audit->log($r->user(), 'site.cree', $site, null, $d);
        return response()->json($site, 201);
    }

    public function updateSite(Request $r, int $id)
    {
        $this->requireAdmin($r);
        $site = Site::findOrFail($id);
        $d = $r->validate(['name' => 'sometimes|string|max:255', 'is_active' => 'sometimes|boolean']);
        $old = $site->only(array_keys($d));
        $site->update($d);
        $this->audit->log($r->user(), 'site.modifie', $site, $old, $d);
        return response()->json($site);
    }

    // ── Véhicules ──
    // GET /vehicles?search=D22 — recherche manuelle par code de parc / immatriculation
    public function vehicles(Request $r)
    {
        $this->requireModule($r);
        $q = Vehicle::with('site:id,code,name')->withExists(['qrCodes as has_active_qr' => fn ($w) => $w->where('is_active', true)]);
        if ($s = trim((string) $r->query('search'))) {
            $q->where(fn ($w) => $w->where('code_parc', 'like', "$s%")->orWhere('immatriculation', 'like', "%$s%")->orWhere('chassis', 'like', "%$s%"));
        }
        foreach (['site_id', 'category', 'status'] as $f) if ($v = $r->query($f)) $q->where($f, $v);
        if ($r->user()->isSiteManager()) $q->whereIn('site_id', $this->access->siteIds($r->user()));
        return $q->orderBy('code_parc')->paginate($this->perPage($r));
    }

    public function showVehicle(Request $r, int $id)
    {
        $this->requireModule($r);
        $v = Vehicle::with('site')->findOrFail($id);
        $now = CarbonImmutable::now(config('fuel.timezone'));
        return response()->json(VehiclePresenter::card($v) + [
            'assignments' => DriverAssignment::with('driver:id,name')->where('vehicle_id', $v->id)
                ->orderByDesc('starts_on')->limit(50)->get(),
            'current' => collect($this->resolver->resolve($v, $v->site_id, $now))->except(['candidates'])
                ->map(fn ($x) => $x instanceof \Illuminate\Database\Eloquent\Model ? $x->toArray() : $x),
        ]);
    }

    public function storeVehicle(Request $r)
    {
        $this->requireAdmin($r);
        $d = $r->validate($this->vehicleRules());
        [$cat, $unit] = Vehicle::classify($d['type_label'] ?? null);
        $v = Vehicle::create($d + ['category' => $cat, 'counter_unit' => $unit]);
        $this->audit->log($r->user(), 'vehicule.cree', $v, null, $v->toArray());
        return response()->json($v, 201);
    }

    public function updateVehicle(Request $r, int $id)
    {
        $this->requireAdmin($r);
        $v = Vehicle::findOrFail($id);
        $d = $r->validate($this->vehicleRules($v));
        $old = $v->only(array_keys($d));
        $v->update($d);
        $this->audit->log($r->user(), 'vehicule.modifie', $v, $old, $d);
        return response()->json($v->fresh('site'));
    }

    private function vehicleRules(?Vehicle $v = null): array
    {
        $req = $v ? 'sometimes' : 'required';
        return [
            'site_id' => 'nullable|exists:sites,id',
            'code_parc' => "$req|string|max:50",
            'immatriculation' => [$req, 'string', 'max:50', Rule::unique('vehicles', 'immatriculation')->ignore($v?->id)],
            'chassis' => 'nullable|string|max:50',
            'type_label' => 'nullable|string|max:100',
            'category' => 'sometimes|in:camion,engin,vehicule_leger,citerne,autre',
            'counter_unit' => 'sometimes|in:km,h',
            'tank_capacity_l' => 'nullable|numeric|min:1|max:5000',
            'status' => 'sometimes|in:actif,en_panne,inactif',
            'status_note' => 'nullable|string|max:255',
        ];
    }

    // ── Conducteurs ──
    public function drivers(Request $r)
    {
        $this->requireModule($r);
        $q = Driver::query()->where('is_active', true);
        if ($s = trim((string) $r->query('search'))) $q->where('name', 'like', "%$s%");
        return $q->orderBy('name')->limit(200)->get(['id', 'name', 'matricule', 'phone']);
    }

    public function storeDriver(Request $r)
    {
        $this->requireAdmin($r);
        $d = $r->validate(['name' => 'required|string|max:255', 'matricule' => 'nullable|string|max:50', 'phone' => 'nullable|string|max:30']);
        $key = Driver::keyFor($d['name']);
        if (Driver::where('name_key', $key)->exists()) throw ValidationException::withMessages(['name' => ['Ce conducteur existe déjà.']]);
        $driver = Driver::create($d + ['name_key' => $key]);
        $this->audit->log($r->user(), 'conducteur.cree', $driver, null, $d);
        return response()->json($driver, 201);
    }

    public function updateDriver(Request $r, int $id)
    {
        $this->requireAdmin($r);
        $driver = Driver::findOrFail($id);
        $d = $r->validate(['name' => 'sometimes|string|max:255', 'matricule' => 'nullable|string|max:50', 'phone' => 'nullable|string|max:30', 'is_active' => 'sometimes|boolean']);
        if (isset($d['name'])) $d['name_key'] = Driver::keyFor($d['name']);
        $old = $driver->only(array_keys($d));
        $driver->update($d);
        $this->audit->log($r->user(), 'conducteur.modifie', $driver, $old, $d);
        return response()->json($driver);
    }

    // ── Shifts (horaires configurables) ──
    public function shifts(Request $r)
    {
        $this->requireModule($r);
        return WorkShift::with('site:id,name')->orderBy('site_id')->orderBy('team_slot')->get();
    }

    public function saveShift(Request $r, ?int $id = null)
    {
        $this->requireAdmin($r);
        $shift = $id ? WorkShift::findOrFail($id) : new WorkShift();
        $d = $r->validate([
            'site_id' => 'nullable|exists:sites,id',
            'code' => [$id ? 'sometimes' : 'required', 'string', 'max:20',
                Rule::unique('work_shifts')->where('site_id', $r->input('site_id', $shift->site_id))->ignore($shift->id)],
            'name' => ($id ? 'sometimes' : 'required') . '|string|max:255',
            'team_slot' => ($id ? 'sometimes' : 'required') . '|integer|in:1,2,3',
            'start_time' => ($id ? 'sometimes' : 'required') . '|date_format:H:i',
            'end_time' => ($id ? 'sometimes' : 'required') . '|date_format:H:i',
            'is_active' => 'sometimes|boolean',
        ]);
        $old = $shift->exists ? $shift->toArray() : null;
        $shift->fill($d)->save();
        $this->audit->log($r->user(), $old ? 'shift.modifie' : 'shift.cree', $shift, $old, $d);
        return response()->json($shift, $old ? 200 : 201);
    }

    // ── Affectations conducteurs ──
    public function assignments(Request $r)
    {
        $this->requireModule($r);
        $q = DriverAssignment::with(['vehicle:id,code_parc,immatriculation', 'driver:id,name', 'site:id,name']);
        if ($v = $r->query('vehicle_id')) $q->where('vehicle_id', $v);
        if ($v = $r->query('driver_id')) $q->where('driver_id', $v);
        if ($v = $r->query('active_on')) $q->activeOn($v);
        return $q->orderByDesc('starts_on')->paginate($this->perPage($r));
    }

    public function storeAssignment(Request $r)
    {
        $this->requireAdmin($r);
        $d = $r->validate([
            'vehicle_id' => 'required|exists:vehicles,id',
            'driver_id' => 'required|exists:drivers,id',
            'team_slot' => 'required|integer|in:1,2,3',
            'site_id' => 'nullable|exists:sites,id',
            'starts_on' => 'required|date',
            'ends_on' => 'nullable|date|after_or_equal:starts_on',
            'is_replacement' => 'boolean',
            'close_previous' => 'boolean',
        ]);
        // Changement de titulaire : clôt l'affectation précédente du même créneau la veille
        if (!empty($d['close_previous']) && empty($d['is_replacement'])) {
            DriverAssignment::where('vehicle_id', $d['vehicle_id'])->where('team_slot', $d['team_slot'])
                ->where('is_replacement', false)->whereNull('ends_on')->where('starts_on', '<', $d['starts_on'])
                ->update(['ends_on' => CarbonImmutable::parse($d['starts_on'])->subDay()->format('Y-m-d')]);
        }
        unset($d['close_previous']);
        $a = DriverAssignment::create($d + ['created_by' => $r->user()->id, 'source' => 'manuel']);
        $this->audit->log($r->user(), 'affectation.creee', $a, null, $d);
        return response()->json($a->load('driver:id,name', 'vehicle:id,code_parc'), 201);
    }

    // Les affectations ne sont jamais supprimées : on les clôt (les bons gardent leur instantané)
    public function endAssignment(Request $r, int $id)
    {
        $this->requireAdmin($r);
        $a = DriverAssignment::findOrFail($id);
        $d = $r->validate(['ends_on' => 'required|date|after_or_equal:' . $a->starts_on->format('Y-m-d')]);
        $old = ['ends_on' => $a->ends_on?->format('Y-m-d')];
        $a->update($d);
        $this->audit->log($r->user(), 'affectation.close', $a, $old, $d);
        return response()->json($a);
    }
}
