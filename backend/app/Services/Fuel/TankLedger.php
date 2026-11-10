<?php

namespace App\Services\Fuel;

use App\Models\Fuel\FuelAdjustment;
use App\Models\Fuel\FuelAttachment;
use App\Models\Fuel\FuelDelivery;
use App\Models\Fuel\FuelRefuel;
use App\Models\Fuel\FuelStockMovement;
use App\Models\Fuel\FuelTank;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * Fiche d'une citerne sur une période, ligne par ligne comme le fichier terrain :
 * ENTRÉE (date, qté, fournisseur) | SORTIES (n° bon, heure, code, immatriculation, compteur, qté, remarque)
 * | SÉRIE DÉPART | SÉRIE FIN | STOCK — plus les justificatifs de chaque ligne.
 */
class TankLedger
{
    public function __construct(private StockService $stock) {}

    public function build(FuelTank $tank, CarbonInterface $from, CarbonInterface $to): array
    {
        $opening = $this->stock->balanceAt($tank, $from);
        $moves = FuelStockMovement::where('fuel_tank_id', $tank->id)->whereBetween('occurred_at', [$from, $to])
            ->orderBy('occurred_at')->orderBy('id')->get();

        $sources = $this->loadSources($moves);
        $attachments = $this->loadAttachments($sources);

        $balance = $opening;
        $rows = [];
        $totals = ['entries_l' => '0.00', 'exits_l' => '0.00', 'adjustments_l' => '0.00', 'vouchers' => 0, 'with_proof' => 0];
        foreach ($moves as $m) {
            $q = Num::fmt((string) $m->quantity_l);
            $balance = Num::add($balance, $q);
            $src = $m->source_type ? ($sources[$m->source_type][$m->source_id] ?? null) : null;
            $row = [
                'id' => $m->id,
                'type' => $m->type,
                // heure locale Africa/Casablanca avec décalage (comme le reste de l'API)
                'occurred_at' => $m->occurred_at->copy()->setTimezone(config('fuel.timezone'))->format('Y-m-d\TH:i:sP'),
                'entry_l' => in_array($m->type, ['stock_initial', 'entree', 'transfert_entree', 'annulation_entree', 'ajustement'], true) ? $q : null,
                'exit_l' => in_array($m->type, ['sortie', 'annulation_sortie'], true) ? Num::neg($q) : null,
                'balance_l' => $balance,
                'supplier' => null, 'voucher_seq' => null, 'voucher_number' => null, 'paper_voucher_number' => null,
                'refuel_id' => null, 'vehicle_code' => null, 'vehicle_label' => null, 'counter_value' => null, 'counter_unit' => null,
                'index_start' => null, 'index_end' => null, 'driver_name' => null, 'company' => null, 'remark' => $m->note,
                'status' => null, 'has_anomaly' => false, 'attachments' => [],
            ];

            if ($src instanceof FuelRefuel) {
                $row = array_merge($row, [
                    'refuel_id' => $src->id,
                    'voucher_seq' => $src->voucher_seq,
                    'voucher_number' => $src->voucher_number,
                    'paper_voucher_number' => $src->paper_voucher_number,
                    'vehicle_code' => $src->vehicle_code,
                    'vehicle_label' => $src->vehicle_immatriculation,
                    'counter_value' => $src->counter_value,
                    'counter_unit' => $src->counter_unit,
                    'driver_name' => $src->driver_name ?? $src->external_driver_name,
                    'company' => $src->company,
                    'status' => $src->status,
                    'has_anomaly' => $src->has_anomaly,
                    'remark' => $this->refuelRemark($m, $src),
                    'attachments' => $attachments[$src->getMorphClass()][$src->id] ?? [],
                ]);
                if ($m->type === 'sortie') {
                    $row['index_start'] = $src->index_start;
                    $row['index_end'] = $src->index_end;
                }
                if ($m->type === 'transfert_entree') {
                    $row['supplier'] = 'TRANSFERT ' . ($src->tank?->code ?? '');
                }
            } elseif ($src instanceof FuelDelivery) {
                $row['supplier'] = $m->type === 'entree' ? $src->supplier : 'ANNULATION LIVRAISON';
                $row['remark'] = trim(implode(' — ', array_filter([$src->delivery_note_number ? "BL {$src->delivery_note_number}" : null, $src->delivery_reference, $src->remark])));
                $row['attachments'] = $attachments[$src->getMorphClass()][$src->id] ?? [];
            } elseif ($src instanceof FuelAdjustment) {
                $row['supplier'] = 'AJUSTEMENT';
                $row['remark'] = $src->reason;
                $row['attachments'] = $attachments[$src->getMorphClass()][$src->id] ?? [];
            } elseif ($m->type === 'stock_initial') {
                $row['supplier'] = 'STOCK INITIAL';
            }

            match ($m->type) {
                'sortie', 'annulation_sortie' => $totals['exits_l'] = Num::sub($totals['exits_l'], $q),
                'ajustement' => $totals['adjustments_l'] = Num::add($totals['adjustments_l'], $q),
                default => $totals['entries_l'] = Num::add($totals['entries_l'], $q),
            };
            if ($m->type === 'sortie') {
                $totals['vouchers']++;
                if ($row['attachments']) $totals['with_proof']++;
            }
            $rows[] = $row;
        }

        return [
            'tank' => $tank->only(['id', 'code', 'name', 'kind', 'capacity_l']),
            'from' => $from->format('Y-m-d'),
            'to' => $to->format('Y-m-d'),
            'opening_l' => $opening,
            'closing_l' => $balance,
            'totals' => $totals,
            'rows' => $rows,
        ];
    }

    private function refuelRemark(FuelStockMovement $m, FuelRefuel $r): string
    {
        $parts = [];
        if ($m->type === 'transfert_entree') $parts[] = "Bon {$r->voucher_number}";
        if ($r->purpose === 'transfert' && $m->type === 'sortie') $parts[] = 'Remis à la citerne ' . ($r->transferTank?->code ?? '');
        if ($r->paper_voucher_number) $parts[] = "Bon papier {$r->paper_voucher_number}";
        if ($r->company) $parts[] = $r->company;
        if ($r->remark) $parts[] = $r->remark;
        if ($m->type === 'annulation_sortie' || ($m->type === 'annulation_entree')) $parts[] = 'ANNULATION : ' . ($r->cancel_reason ?? '');
        elseif ($r->status === 'annule') $parts[] = 'BON ANNULÉ';
        if ($r->corrects_refuel_id) $parts[] = 'Correction';
        return implode(' — ', $parts);
    }

    /** @return array<string, Collection> sources indexées par type puis id */
    private function loadSources(Collection $moves): array
    {
        $by = $moves->groupBy('source_type');
        $out = [];
        $classes = [FuelRefuel::class, FuelDelivery::class, FuelAdjustment::class];
        foreach ($classes as $cls) {
            $morph = (new $cls)->getMorphClass();
            $ids = ($by[$morph] ?? collect())->pluck('source_id')->unique();
            if ($ids->isEmpty()) continue;
            $q = $cls::whereIn('id', $ids);
            if ($cls === FuelRefuel::class) $q->with(['tank:id,code', 'transferTank:id,code']);
            $out[$morph] = $q->get()->keyBy('id');
        }
        return $out;
    }

    /** Justificatifs (sans chemin de fichier) par source. */
    private function loadAttachments(array $sources): array
    {
        $out = [];
        foreach ($sources as $morph => $items) {
            FuelAttachment::where('attachable_type', $morph)->whereIn('attachable_id', $items->keys())
                ->orderBy('id')->get(['id', 'attachable_id', 'kind', 'mime', 'original_name', 'thumb_path'])
                ->each(function ($a) use (&$out, $morph) {
                    $out[$morph][$a->attachable_id][] = ['id' => $a->id, 'kind' => $a->kind, 'mime' => $a->mime, 'has_thumb' => $a->thumb_path !== null];
                });
        }
        return $out;
    }
}
