<?php

namespace App\Http\Controllers\Api\Fuel;

use App\Models\Fuel\FuelDispenser;
use App\Models\Fuel\FuelInventory;
use App\Models\Fuel\FuelStockMovement;
use App\Models\Fuel\FuelTank;
use App\Services\Fuel\AuditLogger;
use App\Services\Fuel\FuelAccess;
use App\Services\Fuel\Num;
use App\Services\Fuel\StockOperations;
use App\Services\Fuel\StockService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TankController extends FuelController
{
    public function __construct(FuelAccess $access, AuditLogger $audit, private StockService $stock, private StockOperations $ops)
    {
        parent::__construct($access, $audit);
    }

    // GET /tanks — citernes du périmètre avec stock théorique / mesuré / écart
    public function index(Request $r)
    {
        $this->requireModule($r);
        $q = FuelTank::with(['site:id,code,name', 'dispensers'])->orderBy('site_id')->orderBy('code');
        $this->access->scopeTanks($q, $r->user(), 'id');
        if (!$r->boolean('include_inactive')) $q->where('is_active', true);

        return $q->get()->map(fn (FuelTank $t) => $this->present($r, $t));
    }

    public function show(Request $r, int $id)
    {
        $this->requireModule($r);
        $tank = $this->tankFor($r, $id, 'view');
        $tank->load('dispensers.resets.user:id,name', 'users:id,name,role');
        return response()->json($this->present($r, $tank) + [
            'dispensers_detail' => $tank->dispensers,
            'users' => $r->user()->isAdmin() ? $tank->users : [],
        ]);
    }

    // GET /tanks/{id}/movements — journal de stock
    public function movements(Request $r, int $id)
    {
        $this->requireModule($r);
        $tank = $this->tankFor($r, $id, 'view');
        if (!$this->access->canSeeStock($r->user(), $tank)) abort(403, 'Stock non visible pour votre rôle.');
        $q = FuelStockMovement::where('fuel_tank_id', $tank->id);
        if ($v = $r->query('from')) $q->where('occurred_at', '>=', $v . ' 00:00:00');
        if ($v = $r->query('to')) $q->where('occurred_at', '<=', $v . ' 23:59:59');
        return $q->orderByDesc('occurred_at')->orderByDesc('id')->paginate($this->perPage($r));
    }

    // GET /tanks/{id}/ledger?from=&to= — fiche citerne (format du fichier terrain) avec justificatifs
    public function ledger(Request $r, int $id)
    {
        $this->requireModule($r);
        $tank = $this->tankFor($r, $id, 'view');
        if (!$this->access->canSeeStock($r->user(), $tank)) abort(403, 'Stock non visible pour votre rôle.');
        $p = \App\Services\Fuel\ReportPeriod::fromRequest($r->only(['period', 'date', 'month', 'from', 'to', 'month_start_day']) + ['period' => 'mois']);
        $data = app(\App\Services\Fuel\TankLedger::class)->build($tank, $p->from, $p->to);
        // Un pompiste ne voit le détail (bons, photos) que de ses propres ravitaillements
        if ($r->user()->isPumpAttendant()) {
            $mine = \App\Models\Fuel\FuelRefuel::whereIn('id', collect($data['rows'])->pluck('refuel_id')->filter())
                ->where('pump_attendant_id', $r->user()->id)->pluck('id')->all();
            foreach ($data['rows'] as &$row) {
                if ($row['refuel_id'] && !in_array($row['refuel_id'], $mine, true)) $row['attachments'] = [];
            }
        }
        return response()->json($data + ['label' => $p->label]);
    }

    public function store(Request $r)
    {
        $this->requireModule($r);
        $this->requireAdmin($r);
        $d = $r->validate([
            'site_id' => 'required|exists:sites,id',
            'vehicle_id' => 'nullable|exists:vehicles,id',
            'code' => 'required|string|max:50|unique:fuel_tanks,code',
            'name' => 'required|string|max:255',
            'kind' => 'required|in:fixe,mobile',
            'capacity_l' => 'required',
            'initial_stock_l' => 'nullable',
            'initial_stock_at' => 'nullable|date',
            'low_stock_threshold_l' => 'nullable|numeric|min:0',
            'allow_negative' => 'boolean',
            'last_voucher_seq' => 'nullable|integer|min:0',
        ]);
        foreach (['capacity_l', 'initial_stock_l'] as $k) if (isset($d[$k])) $d[$k] = (string) $d[$k];
        return response()->json($this->ops->createTank($r->user(), $d), 201);
    }

    // Le stock et la numérotation ne sont jamais modifiables ici (journal + ajustements uniquement)
    public function update(Request $r, int $id)
    {
        $this->requireModule($r);
        $this->requireAdmin($r);
        $tank = FuelTank::findOrFail($id);
        $d = $r->validate([
            'site_id' => 'sometimes|exists:sites,id',
            'vehicle_id' => 'nullable|exists:vehicles,id',
            'code' => ['sometimes', 'string', 'max:50', Rule::unique('fuel_tanks', 'code')->ignore($tank->id)],
            'name' => 'sometimes|string|max:255',
            'kind' => 'sometimes|in:fixe,mobile',
            'capacity_l' => 'sometimes|numeric|min:1',
            'low_stock_threshold_l' => 'nullable|numeric|min:0',
            'allow_negative' => 'sometimes|boolean',
            'is_active' => 'sometimes|boolean',
        ]);
        $old = $tank->only(array_keys($d));
        $tank->update($d);
        $this->audit->log($r->user(), 'citerne.modifiee', $tank, $old, $d);
        return response()->json($tank->fresh('site'));
    }

    // PUT /tanks/{id}/users — pompistes rattachés à la citerne
    public function syncUsers(Request $r, int $id)
    {
        $this->requireModule($r);
        $this->requireAdmin($r);
        $tank = FuelTank::findOrFail($id);
        $d = $r->validate(['user_ids' => 'present|array', 'user_ids.*' => 'integer|exists:users,id']);
        $old = $tank->users()->pluck('users.id')->all();
        $tank->users()->sync($d['user_ids']);
        $this->audit->log($r->user(), 'citerne.utilisateurs', $tank, ['user_ids' => $old], ['user_ids' => $d['user_ids']]);
        return response()->json($tank->users()->get(['users.id', 'name', 'role']));
    }

    public function storeDispenser(Request $r, int $id)
    {
        $this->requireModule($r);
        $this->requireAdmin($r);
        $tank = FuelTank::findOrFail($id);
        $d = $r->validate([
            'code' => ['required', 'string', 'max:50', Rule::unique('fuel_dispensers')->where('fuel_tank_id', $tank->id)],
            'name' => 'required|string|max:255',
            'initial_index' => 'required',
        ]);
        $disp = FuelDispenser::create(['fuel_tank_id' => $tank->id, 'code' => $d['code'], 'name' => $d['name']]);
        $disp->forceFill(['current_index' => Num::parse((string) $d['initial_index'], 'initial_index')])->save();
        $this->audit->log($r->user(), 'compteur.cree', $disp, null, $disp->toArray());
        return response()->json($disp, 201);
    }

    public function updateDispenser(Request $r, int $dispenserId)
    {
        $this->requireModule($r);
        $this->requireAdmin($r);
        $disp = FuelDispenser::findOrFail($dispenserId);
        $d = $r->validate(['name' => 'sometimes|string|max:255', 'is_active' => 'sometimes|boolean']);
        $old = $disp->only(array_keys($d));
        $disp->update($d);
        $this->audit->log($r->user(), 'compteur.modifie', $disp, $old, $d);
        return response()->json($disp);
    }

    // POST /dispensers/{id}/reset — remise à zéro, changement de compteur ou correction d'index
    public function resetDispenser(Request $r, int $dispenserId)
    {
        $this->requireModule($r);
        $this->requireAdmin($r);
        $d = $r->validate([
            'kind' => 'required|in:remise_a_zero,changement_compteur,correction_index',
            'new_index' => 'required',
            'reason' => 'required|string|min:5|max:500',
        ]);
        return response()->json($this->ops->resetDispenser($r->user(), FuelDispenser::findOrFail($dispenserId), $d['kind'], (string) $d['new_index'], $d['reason']), 201);
    }

    // GET /tanks/{id}/verify — cache du stock = somme du journal ?
    public function verify(Request $r, int $id)
    {
        $this->requireModule($r);
        $tank = $this->tankFor($r, $id, 'view');
        return response()->json($this->stock->verify($tank));
    }

    private function present(Request $r, FuelTank $t): array
    {
        $base = $t->only(['id', 'code', 'name', 'kind', 'capacity_l', 'is_active', 'allow_negative', 'low_stock_threshold_l', 'vehicle_id']);
        $base['site'] = $t->site?->only(['id', 'code', 'name']);
        $base['dispensers'] = $t->dispensers->map(fn ($d) => $d->only(['id', 'code', 'name', 'is_active', 'current_index']))->values();
        if (!$this->access->canSeeStock($r->user(), $t)) return $base + ['stock_visible' => false];

        $totals = $this->stock->totals($t);
        $inv = FuelInventory::where('fuel_tank_id', $t->id)->where('status', 'approuve')->orderByDesc('measured_at')->first();
        return $base + [
            'stock_visible' => true,
            'initial_stock_l' => $totals['initial_l'],
            'total_entries_l' => $totals['entries_l'],
            'total_exits_l' => $totals['exits_l'],
            'total_adjustments_l' => $totals['adjustments_l'],
            'theoretical_stock_l' => Num::fmt((string) $t->current_stock_l),
            'journal_ok' => Num::cmp($totals['theoretical_l'], (string) $t->current_stock_l) === 0,
            'fill_pct' => (float) $t->capacity_l > 0 ? round((float) $t->current_stock_l * 100 / (float) $t->capacity_l, 1) : null,
            'is_low' => $t->isLow(),
            'last_inventory' => $inv ? [
                'measured_at' => $inv->measured_at->format('Y-m-d H:i'), 'measured_l' => $inv->measured_quantity_l,
                'theoretical_l' => $inv->theoretical_quantity_l, 'difference_l' => $inv->difference_l,
            ] : null,
        ];
    }
}
