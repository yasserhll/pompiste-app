<?php

namespace App\Services\Fuel;

use App\Models\Fuel\FuelStockMovement;
use App\Models\Fuel\FuelTank;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Seul point d'écriture du stock. Toujours appelé dans une transaction, avec la citerne
 * verrouillée (lockTank) : deux pompistes simultanés sont sérialisés sur la ligne de la citerne.
 *
 * Stock théorique = Σ mouvements = stock initial + entrées − sorties ± ajustements validés.
 */
class StockService
{
    public function lockTank(int $tankId): FuelTank
    {
        if (DB::transactionLevel() === 0) {
            throw new \LogicException('lockTank() doit être appelé dans une transaction.');
        }
        return FuelTank::whereKey($tankId)->lockForUpdate()->firstOrFail();
    }

    /**
     * @param string $quantity signé (+ entrée, − sortie)
     * @throws ValidationException stock négatif interdit
     */
    public function apply(
        FuelTank $lockedTank,
        string $quantity,
        string $type,
        ?Model $source,
        ?User $user,
        CarbonInterface $at,
        ?string $note = null,
        bool $allowNegative = false,
    ): FuelStockMovement {
        $balance = Num::add((string) $lockedTank->current_stock_l, $quantity);

        if (Num::cmp($balance, '0') < 0 && !$lockedTank->allow_negative && !$allowNegative) {
            throw ValidationException::withMessages(['quantity_l' => [sprintf(
                'Stock insuffisant dans la citerne %s : disponible %s L, demandé %s L.',
                $lockedTank->code,
                Num::fmt((string) $lockedTank->current_stock_l),
                Num::abs($quantity),
            )]])->status(422);
        }

        $movement = FuelStockMovement::create([
            'fuel_tank_id' => $lockedTank->id,
            'type' => $type,
            'quantity_l' => $quantity,
            'balance_after_l' => $balance,
            'occurred_at' => $at,
            'source_type' => $source?->getMorphClass(),
            'source_id' => $source?->getKey(),
            'user_id' => $user?->id,
            'note' => $note,
        ]);

        // Mise à jour directe (current_stock_l n'est pas assignable en masse)
        FuelTank::whereKey($lockedTank->id)->update(['current_stock_l' => $balance]);
        $lockedTank->current_stock_l = $balance;

        return $movement;
    }

    /** Totaux recalculés depuis le journal, pour une citerne et une période optionnelle. */
    public function totals(FuelTank $tank, ?CarbonInterface $from = null, ?CarbonInterface $to = null): array
    {
        $q = FuelStockMovement::where('fuel_tank_id', $tank->id);
        if ($from) $q->where('occurred_at', '>=', $from);
        if ($to) $q->where('occurred_at', '<=', $to);

        $rows = $q->selectRaw('type, SUM(quantity_l) as total')->groupBy('type')->pluck('total', 'type');
        $t = fn (string $k) => Num::fmt((string) ($rows[$k] ?? '0'));

        $initial = $t('stock_initial');
        $entries = Num::add($t('entree'), $t('annulation_entree'));     // annulation d'entrée : négatif
        $exits = Num::neg(Num::add($t('sortie'), $t('annulation_sortie'))); // sorties nettes, positif
        $adjust = $t('ajustement');

        return [
            'initial_l' => $initial,
            'entries_l' => $entries,
            'exits_l' => $exits,
            'adjustments_l' => $adjust,
            'theoretical_l' => Num::sub(Num::add(Num::add($initial, $entries), $adjust), $exits),
        ];
    }

    /** Stock théorique à une date (somme des mouvements jusqu'à cet instant, exclu). */
    public function balanceAt(FuelTank $tank, CarbonInterface $at): string
    {
        return Num::fmt((string) FuelStockMovement::where('fuel_tank_id', $tank->id)
            ->where('occurred_at', '<', $at)->sum('quantity_l'));
    }

    /** Contrôle de cohérence : cache de la citerne = somme du journal. */
    public function verify(FuelTank $tank): array
    {
        $tank->refresh();
        $journal = $this->totals($tank)['theoretical_l'];
        return [
            'tank' => $tank->code,
            'cached_l' => Num::fmt((string) $tank->current_stock_l),
            'journal_l' => $journal,
            'ok' => Num::cmp($journal, (string) $tank->current_stock_l) === 0,
        ];
    }
}
