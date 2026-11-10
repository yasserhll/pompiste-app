<?php

namespace App\Http\Controllers\Api\Fuel;

use App\Models\Fuel\FuelAdjustment;
use App\Models\Fuel\FuelDelivery;
use App\Models\Fuel\FuelInventory;
use App\Services\Fuel\AuditLogger;
use App\Services\Fuel\FuelAccess;
use App\Services\Fuel\StockOperations;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/** Entrées de gasoil, inventaires physiques et ajustements de stock. */
class StockEntryController extends FuelController
{
    public function __construct(FuelAccess $access, AuditLogger $audit, private StockOperations $ops)
    {
        parent::__construct($access, $audit);
    }

    // ── Livraisons ───────────────────────────────────────────────
    public function deliveries(Request $r)
    {
        $this->requireModule($r);
        $q = FuelDelivery::with(['tank:id,code,name', 'user:id,name'])->withCount('attachments');
        $this->access->scopeTanks($q, $r->user());
        if ($v = $r->query('fuel_tank_id')) $q->where('fuel_tank_id', $v);
        if ($v = $r->query('from')) $q->where('delivered_at', '>=', $v . ' 00:00:00');
        if ($v = $r->query('to')) $q->where('delivered_at', '<=', $v . ' 23:59:59');
        return $q->orderByDesc('delivered_at')->paginate($this->perPage($r));
    }

    public function storeDelivery(Request $r)
    {
        $this->requireModule($r);
        $d = $r->validate([
            'client_uuid' => 'required|uuid',
            'fuel_tank_id' => 'required|integer',
            'delivered_at' => 'nullable|date',
            'quantity_l' => 'required',
            'supplier' => 'required|string|max:255',
            'delivery_note_number' => 'required|string|max:100',
            'delivery_reference' => 'nullable|string|max:100',
            'remark' => 'nullable|string|max:500',
            'attachment_ids' => 'nullable|array|max:10',
            'attachment_ids.*' => 'integer',
            'confirm_over_capacity' => 'boolean',
        ]);
        $this->tankFor($r, $d['fuel_tank_id'], 'deliver');
        $d['quantity_l'] = (string) $d['quantity_l'];
        ['delivery' => $delivery, 'replayed' => $replayed] = $this->ops->createDelivery($r->user(), $d);
        return response()->json(['delivery' => $delivery, 'replayed' => $replayed], $replayed ? 200 : 201);
    }

    public function cancelDelivery(Request $r, int $id)
    {
        $this->requireModule($r);
        $this->requireAdmin($r);
        $d = $r->validate(['reason' => 'required|string|min:5|max:500']);
        return response()->json($this->ops->cancelDelivery($r->user(), FuelDelivery::findOrFail($id), $d['reason']));
    }

    // ── Inventaires ──────────────────────────────────────────────
    public function inventories(Request $r)
    {
        $this->requireModule($r);
        $q = FuelInventory::with(['tank:id,code,name', 'user:id,name', 'adjustment'])->withCount('attachments');
        $this->access->scopeTanks($q, $r->user());
        if ($v = $r->query('fuel_tank_id')) $q->where('fuel_tank_id', $v);
        if ($v = $r->query('status')) $q->where('status', $v);
        return $q->orderByDesc('measured_at')->paginate($this->perPage($r));
    }

    public function storeInventory(Request $r)
    {
        $this->requireModule($r);
        $d = $r->validate([
            'client_uuid' => 'required|uuid',
            'fuel_tank_id' => 'required|integer',
            'measured_at' => 'nullable|date',
            'measured_quantity_l' => 'required',
            'method' => 'nullable|string|max:50',
            'note' => 'nullable|string|max:500',
            'attachment_ids' => 'nullable|array|max:10',
            'attachment_ids.*' => 'integer',
        ]);
        $this->tankFor($r, $d['fuel_tank_id'], 'inventory');
        $d['measured_quantity_l'] = (string) $d['measured_quantity_l'];
        return response()->json($this->ops->createInventory($r->user(), $d), 201);
    }

    public function reviewInventory(Request $r, int $id)
    {
        $this->requireModule($r);
        $this->requireAdmin($r);
        $d = $r->validate(['approve' => 'required|boolean', 'note' => 'nullable|string|max:500', 'create_adjustment' => 'boolean']);
        return response()->json($this->ops->reviewInventory($r->user(), FuelInventory::findOrFail($id), $d['approve'], $d['note'] ?? null,
            (bool) ($d['create_adjustment'] ?? false)));
    }

    // ── Ajustements ──────────────────────────────────────────────
    public function adjustments(Request $r)
    {
        $this->requireModule($r);
        $q = FuelAdjustment::with(['tank:id,code,name', 'requester:id,name', 'inventory'])->withCount('attachments');
        $this->access->scopeTanks($q, $r->user());
        if ($v = $r->query('fuel_tank_id')) $q->where('fuel_tank_id', $v);
        if ($v = $r->query('status')) $q->where('status', $v);
        return $q->orderByDesc('created_at')->paginate($this->perPage($r));
    }

    public function storeAdjustment(Request $r)
    {
        $this->requireModule($r);
        $d = $r->validate([
            'fuel_tank_id' => 'required|integer',
            'quantity_l' => 'required',
            'reason' => 'required|string|min:5|max:500',
            'attachment_ids' => 'nullable|array|max:10',
            'attachment_ids.*' => 'integer',
        ]);
        $tank = $this->tankFor($r, $d['fuel_tank_id'], 'inventory');
        return response()->json($this->ops->requestAdjustment($r->user(), $tank, (string) $d['quantity_l'], $d['reason'], $d['attachment_ids'] ?? []), 201);
    }

    public function reviewAdjustment(Request $r, int $id)
    {
        $this->requireModule($r);
        $this->requireAdmin($r);
        $d = $r->validate(['approve' => 'required|boolean', 'note' => 'nullable|string|max:500', 'allow_negative' => 'boolean']);
        if (!empty($d['allow_negative']) && empty($d['note'])) {
            throw ValidationException::withMessages(['note' => ['Un stock négatif exceptionnel exige une justification.']]);
        }
        return response()->json($this->ops->reviewAdjustment($r->user(), FuelAdjustment::findOrFail($id), $d['approve'], $d['note'] ?? null,
            (bool) ($d['allow_negative'] ?? false)));
    }
}
