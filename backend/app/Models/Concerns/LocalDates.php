<?php

namespace App\Models\Concerns;

use DateTimeInterface;

/** Dates JSON en heure locale (Africa/Casablanca) avec décalage : 2026-11-07T10:40:00+01:00 */
trait LocalDates
{
    protected function serializeDate(DateTimeInterface $date): string
    {
        return \Carbon\CarbonImmutable::instance($date)->setTimezone(config('fuel.timezone'))->format('Y-m-d\TH:i:sP');
    }
}
