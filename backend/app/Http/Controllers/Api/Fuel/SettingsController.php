<?php

namespace App\Http\Controllers\Api\Fuel;

use App\Models\Fuel\FuelAuditLog;
use App\Models\Fuel\FuelSetting;
use Illuminate\Http\Request;

/** Paramètres du module (règles de contrôle, période des rapports…) et journal d'audit. */
class SettingsController extends FuelController
{
    public const RULES = [
        'report_month_start_day' => 'integer|min:1|max:28',
        'transfer_min_litres' => 'numeric|min:0|max:100000',
        'companies' => 'array|max:20',
        'low_stock_threshold_l' => 'numeric|min:0',
        'declared_quantity_tolerance_l' => 'numeric|min:0|max:100',
        'max_refuel_l' => 'numeric|min:1|max:10000',
        'tank_capacity_margin_pct' => 'numeric|min:0|max:50',
        'duplicate_window_minutes' => 'integer|min:0|max:1440',
        'max_counter_jump_h' => 'numeric|min:1',
        'max_counter_jump_km' => 'numeric|min:1',
        'require_photo' => 'boolean',
        'pompiste_can_view_stock' => 'boolean',
        'pompiste_can_record_delivery' => 'boolean',
    ];

    public function index(Request $r)
    {
        $this->requireModule($r);
        $out = [];
        foreach (array_keys(self::RULES) as $k) {
            $out[$k] = FuelSetting::get($k, match ($k) {
                'require_photo', 'pompiste_can_record_delivery' => false,
                'pompiste_can_view_stock' => true,
                default => null,
            });
        }
        return response()->json($out);
    }

    public function update(Request $r)
    {
        $this->requireAdmin($r);
        $rules = array_map(fn ($rule) => "sometimes|$rule", self::RULES);
        $d = $r->validate($rules);
        foreach ($d as $k => $v) {
            $old = FuelSetting::get($k);
            FuelSetting::updateOrCreate(['key' => $k], ['value' => $v]);
            $this->audit->log($r->user(), 'parametre.modifie', null, [$k => $old], [$k => $v]);
        }
        return $this->index($r);
    }

    public function audit(Request $r)
    {
        $this->requireAdmin($r);
        $q = FuelAuditLog::with('user:id,name');
        if ($v = $r->query('action')) $q->where('action', 'like', "$v%");
        if ($v = $r->query('user_id')) $q->where('user_id', $v);
        return $q->orderByDesc('id')->paginate($this->perPage($r));
    }
}
