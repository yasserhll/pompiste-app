<?php

namespace App\Console\Commands;

use App\Models\Fuel\FuelRefuel;
use App\Models\Fuel\FuelStockMovement;
use App\Models\Fuel\FuelTank;
use App\Services\Fuel\Num;
use App\Services\Fuel\StockService;
use Illuminate\Console\Command;

/**
 * Concordance stock / journal / bons :
 *   - stock en cache de la citerne = somme des mouvements ;
 *   - chaque bon validé a exactement une sortie de même quantité ;
 *   - chaque bon annulé a sa sortie ET son mouvement compensatoire.
 */
class VerifyStockCommand extends Command
{
    protected $signature = 'fuel:verify-stock';

    protected $description = 'Vérifie la cohérence des stocks de toutes les citernes';

    public function handle(StockService $stock): int
    {
        $ok = true;
        $morph = (new FuelRefuel)->getMorphClass();
        $rows = [];
        foreach (FuelTank::orderBy('code')->get() as $tank) {
            $v = $stock->verify($tank);
            $errors = [];
            if (!$v['ok']) $errors[] = "cache {$v['cached_l']} ≠ journal {$v['journal_l']}";

            $refuels = FuelRefuel::where('fuel_tank_id', $tank->id)->get(['id', 'quantity_l', 'status', 'voucher_number']);
            $moves = FuelStockMovement::where('fuel_tank_id', $tank->id)->where('source_type', $morph)
                ->get(['source_id', 'type', 'quantity_l'])->groupBy('source_id');
            foreach ($refuels as $f) {
                $m = $moves[$f->id] ?? collect();
                $out = $m->where('type', 'sortie');
                if ($out->count() !== 1 || Num::cmp(Num::neg(Num::fmt((string) $out->first()?->quantity_l)), Num::fmt((string) $f->quantity_l)) !== 0) {
                    $errors[] = "bon {$f->voucher_number} : sortie absente ou incorrecte";
                }
                $back = $m->where('type', 'annulation_sortie')->count();
                if (($f->status === 'annule') !== ($back === 1)) $errors[] = "bon {$f->voucher_number} : annulation incohérente";
            }
            $ok = $ok && !$errors;
            $rows[] = [$tank->code, $v['cached_l'], $v['journal_l'], $refuels->count(), $errors ? implode(' ; ', $errors) : 'OK'];
        }
        $this->table(['Citerne', 'Stock (cache)', 'Stock (journal)', 'Bons', 'Résultat'], $rows);
        return $ok ? self::SUCCESS : self::FAILURE;
    }
}
