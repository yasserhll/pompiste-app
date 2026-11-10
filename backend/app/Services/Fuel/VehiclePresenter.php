<?php

namespace App\Services\Fuel;

use App\Models\Vehicle;
use Illuminate\Support\Collection;

final class VehiclePresenter
{
    public static function card(Vehicle $v): array
    {
        return [
            'id' => $v->id,
            'code_parc' => $v->code_parc,
            'immatriculation' => $v->immatriculation,
            'chassis' => $v->chassis,
            'type_label' => $v->type_label,
            'category' => $v->category,
            'counter_unit' => $v->counter_unit,
            'tank_capacity_l' => $v->tank_capacity_l,
            'status' => $v->status,
            'status_note' => $v->status_note,
            'site' => $v->site?->only(['id', 'code', 'name']),
        ];
    }

    public static function candidates(Collection $assignments): array
    {
        return $assignments->map(fn ($a) => [
            'assignment_id' => $a->id,
            'driver_id' => $a->driver_id,
            'driver_name' => $a->driver?->name,
            'team_slot' => $a->team_slot,
            'is_replacement' => $a->is_replacement,
            'starts_on' => $a->starts_on?->format('Y-m-d'),
            'ends_on' => $a->ends_on?->format('Y-m-d'),
        ])->values()->all();
    }
}
