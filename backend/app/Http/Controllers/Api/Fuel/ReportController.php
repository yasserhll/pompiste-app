<?php

namespace App\Http\Controllers\Api\Fuel;

use App\Models\Fuel\FuelTank;
use App\Models\Site;
use App\Models\Vehicle;
use App\Services\Fuel\AuditLogger;
use App\Services\Fuel\FuelAccess;
use App\Services\Fuel\ReportPeriod;
use App\Services\Fuel\TankReportExporter;
use Illuminate\Http\Request;

/**
 * GET /reports/export?scope=citerne|site|global|vehicule&period=jour|semaine|mois|periode…
 * Le classeur est toujours régénéré depuis la base (source officielle), jamais modifié à la main.
 */
class ReportController extends FuelController
{
    public function __construct(FuelAccess $access, AuditLogger $audit, private TankReportExporter $exporter)
    {
        parent::__construct($access, $audit);
    }

    public function export(Request $r)
    {
        $this->requireModule($r);
        $u = $r->user();
        if ($u->isPumpAttendant()) abort(403, 'Les rapports sont réservés aux responsables et administrateurs.');

        $d = $r->validate([
            'scope' => 'required|in:citerne,site,global,vehicule',
            'fuel_tank_id' => 'required_if:scope,citerne|nullable|integer',
            'site_id' => 'required_if:scope,site|nullable|integer',
            'vehicle_id' => 'required_if:scope,vehicule|nullable|integer',
            'period' => 'required|in:jour,semaine,mois,periode',
            'date' => 'nullable|date', 'month' => 'nullable|date_format:Y-m',
            'from' => 'nullable|date', 'to' => 'nullable|date', 'month_start_day' => 'nullable|integer',
        ]);
        $p = ReportPeriod::fromRequest($d);
        $allowed = $this->access->tankIds($u);

        if ($d['scope'] === 'vehicule') {
            $vehicle = Vehicle::findOrFail($d['vehicle_id']);
            $book = $this->exporter->vehicleWorkbook($vehicle, $p, $allowed);
            $name = "rapport-{$vehicle->code_parc}";
        } else {
            $q = FuelTank::with('site')->orderBy('code');
            if ($allowed !== null) $q->whereIn('id', $allowed);
            $title = 'Rapport global des citernes';
            $name = 'rapport-global';
            if ($d['scope'] === 'citerne') {
                $tank = $this->tankFor($r, $d['fuel_tank_id'], 'view');
                $q->whereKey($tank->id);
                $title = "Rapport citerne {$tank->code}";
                $name = "rapport-citerne-{$tank->code}";
            } elseif ($d['scope'] === 'site') {
                $site = Site::findOrFail($d['site_id']);
                $siteIds = $this->access->siteIds($u);
                if ($siteIds !== null && !in_array($site->id, $siteIds, true)) abort(403, 'Site hors de votre périmètre.');
                $q->where('site_id', $site->id);
                $title = "Rapport site {$site->name}";
                $name = "rapport-site-{$site->code}";
            }
            $tanks = $q->get();
            if ($tanks->isEmpty()) abort(422, 'Aucune citerne dans ce périmètre.');
            $book = $this->exporter->tanksWorkbook($tanks, $p, $title);
        }

        $file = tempnam(sys_get_temp_dir(), 'rpt') . '.xlsx';
        $this->exporter->save($book, $file);
        $this->audit->log($u, 'rapport.exporte', null, null, $d);
        $suffix = $p->from->format('Ymd') . '-' . $p->to->format('Ymd');
        return response()->download($file, preg_replace('/[^A-Za-z0-9_-]/', '_', "{$name}-{$suffix}") . '.xlsx')->deleteFileAfterSend();
    }
}
