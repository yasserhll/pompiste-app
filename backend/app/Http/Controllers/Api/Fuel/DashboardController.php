<?php

namespace App\Http\Controllers\Api\Fuel;

use App\Models\Fuel\FuelAnomaly;
use App\Models\Fuel\FuelDelivery;
use App\Models\Fuel\FuelRefuel;
use App\Models\Fuel\FuelSetting;
use App\Models\Fuel\FuelStockMovement;
use App\Models\Fuel\FuelTank;
use App\Services\Fuel\Num;
use App\Services\Fuel\ReportPeriod;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

/** Indicateurs calculés uniquement à partir des bons validés et du journal de stock. */
class DashboardController extends FuelController
{
    public function summary(Request $r)
    {
        $this->requireModule($r);
        $u = $r->user();
        $tz = config('fuel.timezone');
        $now = CarbonImmutable::now($tz);
        $from = $r->query('from') ? CarbonImmutable::parse($r->query('from'), $tz)->startOfDay() : $now->subDays(29)->startOfDay();
        $to = $r->query('to') ? CarbonImmutable::parse($r->query('to'), $tz)->endOfDay() : $now->endOfDay();
        $month = ReportPeriod::fromRequest(['period' => 'mois', 'month' => $this->currentReportMonth($now)]);

        $base = function () use ($r, $u) {
            $q = FuelRefuel::valid();
            $this->access->scopeRefuels($q, $u);
            foreach (['fuel_tank_id', 'site_id', 'vehicle_id', 'driver_id', 'pump_attendant_id', 'work_shift_id', 'vehicle_category'] as $f) {
                if (($v = $r->query($f)) !== null && $v !== '') $q->where($f, $v);
            }
            return $q;
        };
        $sum = fn ($q) => Num::fmt((string) $q->sum('quantity_l'));

        $deliveries = FuelDelivery::where('status', 'valide')->whereBetween('delivered_at', [$from, $to]);
        $this->access->scopeTanks($deliveries, $u);
        if ($v = $r->query('fuel_tank_id')) $deliveries->where('fuel_tank_id', $v);

        $tanks = FuelTank::with('site:id,name')->where('is_active', true);
        $this->access->scopeTanks($tanks, $u, 'id');
        $seeStock = !$u->isPumpAttendant() || FuelSetting::get('pompiste_can_view_stock', true);

        $daily = $base()->whereBetween('refueled_at', [$from, $to])
            ->selectRaw('DATE(refueled_at) as day, SUM(quantity_l) as litres, COUNT(*) as bons')
            ->groupBy('day')->orderBy('day')->get();

        $monthly = $base()->where('refueled_at', '>=', $now->subMonths(11)->startOfMonth())
            ->selectRaw("DATE_FORMAT(refueled_at, '%Y-%m') as month, SUM(quantity_l) as litres")
            ->groupBy('month')->orderBy('month')->get();

        $bySite = $base()->whereBetween('refueled_at', [$from, $to])
            ->selectRaw('site_name, SUM(quantity_l) as litres, COUNT(*) as bons')->groupBy('site_name')->orderByDesc('litres')->get();

        $topVehicles = $base()->whereBetween('refueled_at', [$from, $to])
            ->selectRaw('vehicle_id, vehicle_code, vehicle_category, SUM(quantity_l) as litres, COUNT(*) as bons')
            ->groupBy('vehicle_id', 'vehicle_code', 'vehicle_category')->orderByDesc('litres')->limit(15)->get();

        $byCategory = $base()->whereBetween('refueled_at', [$from, $to])
            ->selectRaw('vehicle_category, SUM(quantity_l) as litres')->groupBy('vehicle_category')->get();

        $anomalies = FuelAnomaly::where('status', 'ouverte');
        $this->access->scopeTanks($anomalies, $u);

        return response()->json([
            'period' => ['from' => $from->format('Y-m-d'), 'to' => $to->format('Y-m-d'), 'report_month' => $month->label],
            'kpis' => [
                'today_l' => $sum($base()->whereBetween('refueled_at', [$now->startOfDay(), $now->endOfDay()])),
                'today_count' => $base()->whereBetween('refueled_at', [$now->startOfDay(), $now->endOfDay()])->count(),
                'month_l' => $sum($base()->whereBetween('refueled_at', [$month->from, $month->to])),
                'period_l' => $sum($base()->whereBetween('refueled_at', [$from, $to])),
                'period_count' => $base()->whereBetween('refueled_at', [$from, $to])->count(),
                'received_l' => Num::fmt((string) $deliveries->sum('quantity_l')),
                'open_anomalies' => $u->isPumpAttendant() ? null : $anomalies->count(),
            ],
            'tanks' => $seeStock ? $tanks->get()->map(fn ($t) => [
                'id' => $t->id, 'code' => $t->code, 'name' => $t->name, 'site' => $t->site?->name,
                'stock_l' => Num::fmt((string) $t->current_stock_l), 'capacity_l' => $t->capacity_l, 'is_low' => $t->isLow(),
                'fill_pct' => (float) $t->capacity_l > 0 ? round((float) $t->current_stock_l * 100 / (float) $t->capacity_l, 1) : null,
            ]) : [],
            'daily' => $daily,
            'monthly' => $monthly,
            'by_site' => $bySite,
            'by_category' => $byCategory,
            'top_vehicles' => $topVehicles,
        ]);
    }

    // GET /dashboard/stock-history?fuel_tank_id= — solde en fin de journée
    public function stockHistory(Request $r)
    {
        $this->requireModule($r);
        $tank = $this->tankFor($r, (int) $r->query('fuel_tank_id'), 'view');
        if (!$this->access->canSeeStock($r->user(), $tank)) abort(403);
        $tz = config('fuel.timezone');
        $from = CarbonImmutable::parse($r->query('from', CarbonImmutable::now($tz)->subDays(29)->format('Y-m-d')), $tz)->startOfDay();
        $to = CarbonImmutable::parse($r->query('to', CarbonImmutable::now($tz)->format('Y-m-d')), $tz)->endOfDay();

        $balance = Num::fmt((string) FuelStockMovement::where('fuel_tank_id', $tank->id)->where('occurred_at', '<', $from)->sum('quantity_l'));
        $perDay = FuelStockMovement::where('fuel_tank_id', $tank->id)->whereBetween('occurred_at', [$from, $to])
            ->selectRaw('DATE(occurred_at) as day, SUM(quantity_l) as delta')->groupBy('day')->pluck('delta', 'day');

        $out = [];
        for ($d = $from; $d->lte($to); $d = $d->addDay()) {
            $key = $d->format('Y-m-d');
            $balance = Num::add($balance, Num::fmt((string) ($perDay[$key] ?? '0')));
            $out[] = ['day' => $key, 'stock_l' => $balance];
        }
        return response()->json(['tank' => $tank->only(['id', 'code', 'capacity_l']), 'series' => $out]);
    }

    private function currentReportMonth(CarbonImmutable $now): string
    {
        $start = (int) FuelSetting::get('report_month_start_day', 27);
        return ($start > 1 && $now->day >= $start) ? $now->addMonthNoOverflow()->format('Y-m') : $now->format('Y-m');
    }
}
