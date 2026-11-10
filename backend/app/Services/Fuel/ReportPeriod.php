<?php

namespace App\Services\Fuel;

use App\Models\Fuel\FuelSetting;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

/** Bornes [from, to] d'un rapport, en Africa/Casablanca. */
final class ReportPeriod
{
    public function __construct(public readonly CarbonImmutable $from, public readonly CarbonImmutable $to, public readonly string $label) {}

    /**
     * period = jour (date) | semaine (date) | mois (month=YYYY-MM) | periode (from, to).
     * Mois : du jour J (paramètre, 27 par défaut) du mois précédent au jour J−1 du mois choisi ;
     * avec J = 1 c'est le mois calendaire.
     */
    public static function fromRequest(array $in): self
    {
        $tz = config('fuel.timezone');
        $period = $in['period'] ?? 'mois';

        switch ($period) {
            case 'jour':
                $d = CarbonImmutable::parse($in['date'] ?? 'today', $tz)->startOfDay();
                return new self($d, $d->endOfDay(), 'Journée du ' . $d->format('d/m/Y'));
            case 'semaine':
                $d = CarbonImmutable::parse($in['date'] ?? 'today', $tz)->startOfWeek(CarbonImmutable::MONDAY);
                return new self($d, $d->addDays(6)->endOfDay(), 'Semaine du ' . $d->format('d/m/Y'));
            case 'mois':
                $startDay = (int) ($in['month_start_day'] ?? FuelSetting::get('report_month_start_day', 27));
                if ($startDay < 1 || $startDay > 28) {
                    throw ValidationException::withMessages(['month_start_day' => ['Jour de début entre 1 et 28.']]);
                }
                $m = CarbonImmutable::createFromFormat('Y-m-d', ($in['month'] ?? now($tz)->format('Y-m')) . '-01', $tz)->startOfDay();
                if ($startDay === 1) {
                    return new self($m, $m->endOfMonth()->endOfDay(), 'Mois ' . $m->format('m/Y'));
                }
                $from = $m->subMonthNoOverflow()->setDay($startDay);
                $to = $m->setDay($startDay - 1)->endOfDay();
                return new self($from, $to, sprintf('Mois %s (%s → %s)', $m->format('m/Y'), $from->format('d/m/Y'), $to->format('d/m/Y')));
            case 'periode':
                if (empty($in['from']) || empty($in['to'])) {
                    throw ValidationException::withMessages(['from' => ['Dates de début et de fin obligatoires.']]);
                }
                $from = CarbonImmutable::parse($in['from'], $tz)->startOfDay();
                $to = CarbonImmutable::parse($in['to'], $tz)->endOfDay();
                if ($to->lt($from)) throw ValidationException::withMessages(['to' => ['La date de fin précède la date de début.']]);
                if ($from->diffInDays($to) > 400) throw ValidationException::withMessages(['to' => ['Période limitée à 400 jours.']]);
                return new self($from, $to, 'Du ' . $from->format('d/m/Y') . ' au ' . $to->format('d/m/Y'));
        }
        throw ValidationException::withMessages(['period' => ['Période inconnue.']]);
    }
}
