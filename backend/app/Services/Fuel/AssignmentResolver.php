<?php

namespace App\Services\Fuel;

use App\Models\DriverAssignment;
use App\Models\Vehicle;
use App\Models\WorkShift;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * Détermine le shift et le conducteur affecté à un véhicule à un instant donné.
 *
 * - Les horaires viennent de work_shifts (spécifiques au site, sinon horaires globaux).
 * - Un shift qui traverse minuit (22:00 → 06:00) rattache 02:00 à la journée de la veille.
 * - Parmi les affectations en vigueur pour le créneau (équipe 1/2) : un remplaçant prime,
 *   puis l'affectation la plus récente. Deux conducteurs différents au même niveau = ambigu.
 */
class AssignmentResolver
{
    /** @return array{shift: ?WorkShift, work_date: string, warnings: array} */
    public function resolveShift(?int $siteId, CarbonInterface $at): array
    {
        $shifts = WorkShift::where('is_active', true)->where('site_id', $siteId)->get();
        if ($shifts->isEmpty()) {
            $shifts = WorkShift::where('is_active', true)->whereNull('site_id')->get();
        }

        $time = $at->format('H:i:s');
        $date = CarbonImmutable::parse($at->format('Y-m-d'));
        $matches = [];

        foreach ($shifts as $s) {
            $start = $this->normTime($s->start_time);
            $end = $this->normTime($s->end_time);
            if ($start < $end) {
                if ($time >= $start && $time < $end) $matches[] = [$s, $date];
            } else { // traverse minuit
                if ($time >= $start) $matches[] = [$s, $date];
                elseif ($time < $end) $matches[] = [$s, $date->subDay()];
            }
        }

        $warnings = [];
        if (!$matches) {
            if ($shifts->isNotEmpty()) {
                $warnings[] = Warning::alert('hors_shift', "Aucun shift configuré ne couvre {$at->format('H:i')}.");
            } else {
                $warnings[] = Warning::alert('shifts_non_configures', 'Les horaires des shifts ne sont pas configurés.');
            }
            return ['shift' => null, 'work_date' => $date->format('Y-m-d'), 'warnings' => $warnings];
        }
        if (count($matches) > 1) {
            $warnings[] = Warning::alert('shifts_chevauchants', 'Plusieurs shifts couvrent cette heure : vérifier le paramétrage.');
        }

        [$shift, $workDate] = $matches[0];
        return ['shift' => $shift, 'work_date' => $workDate->format('Y-m-d'), 'warnings' => $warnings];
    }

    /**
     * @return array{
     *   status: 'ok'|'aucune'|'ambigu', shift: ?WorkShift, work_date: string,
     *   proposed: ?DriverAssignment, candidates: \Illuminate\Support\Collection, warnings: array
     * }
     */
    public function resolve(Vehicle $vehicle, ?int $tankSiteId, CarbonInterface $at): array
    {
        $shiftInfo = $this->resolveShift($tankSiteId, $at);
        $warnings = $shiftInfo['warnings'];
        $shift = $shiftInfo['shift'];
        $workDate = $shiftInfo['work_date'];

        // Toutes les affectations en vigueur du véhicule ce jour-là (tous créneaux) : options de sélection
        $all = DriverAssignment::with('driver')
            ->where('vehicle_id', $vehicle->id)
            ->activeOn($workDate)
            ->get();

        $slot = $shift?->team_slot;
        $forSlot = $slot ? $all->where('team_slot', $slot) : collect();

        $proposed = null;
        $status = 'aucune';
        if ($forSlot->isNotEmpty()) {
            $sorted = $forSlot->sortByDesc(fn ($a) => [(int) $a->is_replacement, $a->starts_on->format('Y-m-d'), $a->id])->values();
            $top = $sorted->first();
            $sameLevel = $sorted->filter(fn ($a) => $a->is_replacement === $top->is_replacement
                && $a->starts_on->equalTo($top->starts_on));
            if ($sameLevel->pluck('driver_id')->unique()->count() > 1) {
                $status = 'ambigu';
                $warnings[] = Warning::alert('affectations_contradictoires',
                    "Plusieurs conducteurs sont affectés à {$vehicle->code_parc} pour ce shift : sélection obligatoire.");
            } else {
                $status = 'ok';
                $proposed = $top;
                if ($sorted->pluck('driver_id')->unique()->count() > 1) {
                    $warnings[] = Warning::info('affectations_chevauchantes',
                        'Des affectations se chevauchent : la plus récente (ou le remplaçant) est proposée.');
                }
            }
        }

        if ($status === 'aucune') {
            $warnings[] = Warning::alert('vehicule_sans_affectation',
                "Aucun conducteur affecté à {$vehicle->code_parc}" . ($shift ? " pour le shift {$shift->name}" : '') . '.');
        }
        if ($vehicle->status !== 'actif') {
            $label = ['en_panne' => 'en panne', 'inactif' => 'inactif'][$vehicle->status] ?? $vehicle->status;
            $note = $vehicle->status_note && mb_strtolower($vehicle->status_note) !== $label ? " ({$vehicle->status_note})" : '';
            $warnings[] = Warning::alert('vehicule_inactif', "Le véhicule {$vehicle->code_parc} est déclaré {$label}{$note}.");
        }
        if ($tankSiteId && $vehicle->site_id && $vehicle->site_id !== $tankSiteId) {
            $warnings[] = Warning::alert('vehicule_autre_site',
                "{$vehicle->code_parc} est enregistré sur le site " . ($vehicle->site?->name ?? '?') . ', pas sur celui de la citerne.');
        }
        if ($proposed && $tankSiteId && $proposed->site_id && $proposed->site_id !== $tankSiteId) {
            $warnings[] = Warning::info('affectation_autre_site', "L'affectation du conducteur concerne un autre site.");
        }

        return [
            'status' => $status,
            'shift' => $shift,
            'work_date' => $workDate,
            'proposed' => $proposed,
            'candidates' => $all,
            'warnings' => $warnings,
        ];
    }

    private function normTime(string $t): string
    {
        return strlen($t) === 5 ? "$t:00" : $t;
    }
}
