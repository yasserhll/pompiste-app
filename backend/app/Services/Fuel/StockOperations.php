<?php

namespace App\Services\Fuel;

use App\Models\Fuel\FuelAdjustment;
use App\Models\Fuel\FuelAnomaly;
use App\Models\Fuel\FuelAttachment;
use App\Models\Fuel\FuelDelivery;
use App\Models\Fuel\FuelDispenser;
use App\Models\Fuel\FuelDispenserReset;
use App\Models\Fuel\FuelInventory;
use App\Models\Fuel\FuelTank;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Entrées, inventaires, ajustements, citernes et compteurs. */
class StockOperations
{
    public function __construct(private StockService $stock, private AuditLogger $audit) {}

    private function now(): CarbonImmutable
    {
        return CarbonImmutable::now(config('fuel.timezone'));
    }

    public function createTank(User $user, array $d): FuelTank
    {
        return DB::transaction(function () use ($user, $d) {
            $initial = Num::parse($d['initial_stock_l'] ?? '0', 'initial_stock_l');
            $capacity = Num::parse($d['capacity_l'], 'capacity_l');
            if (Num::cmp($initial, $capacity) > 0) {
                throw ValidationException::withMessages(['initial_stock_l' => ['Le stock initial dépasse la capacité.']]);
            }
            $at = isset($d['initial_stock_at']) ? CarbonImmutable::parse($d['initial_stock_at'], config('fuel.timezone')) : $this->now();
            $tank = FuelTank::create(array_merge($d, [
                'capacity_l' => $capacity, 'initial_stock_l' => $initial, 'initial_stock_at' => $at,
            ]));
            $locked = $this->stock->lockTank($tank->id);
            if (!Num::isZero($initial)) {
                $this->stock->apply($locked, $initial, 'stock_initial', $tank, $user, $at, 'Stock initial');
            }
            FuelDispenser::create(['fuel_tank_id' => $tank->id, 'code' => 'P1', 'name' => 'Compteur principal']);
            if (isset($d['last_voucher_seq'])) {
                FuelTank::whereKey($tank->id)->update(['last_voucher_seq' => (int) $d['last_voucher_seq']]);
            }
            $this->audit->log($user, 'citerne.creee', $tank, null, $tank->fresh()->toArray());
            return $tank->fresh(['site', 'dispensers']);
        });
    }

    public function resetDispenser(User $user, FuelDispenser $dispenser, string $kind, string $newIndex, string $reason): FuelDispenserReset
    {
        return DB::transaction(function () use ($user, $dispenser, $kind, $newIndex, $reason) {
            $this->stock->lockTank($dispenser->fuel_tank_id);
            $d = FuelDispenser::whereKey($dispenser->id)->lockForUpdate()->firstOrFail();
            $new = Num::parse($newIndex, 'new_index');
            $reset = FuelDispenserReset::create([
                'fuel_dispenser_id' => $d->id, 'kind' => $kind, 'old_index' => (string) $d->current_index,
                'new_index' => $new, 'reason' => $reason, 'user_id' => $user->id, 'occurred_at' => $this->now(),
            ]);
            FuelDispenser::whereKey($d->id)->update(['current_index' => $new]);
            $this->audit->log($user, 'compteur.reinitialise', $d, ['current_index' => (string) $d->current_index], ['current_index' => $new, 'kind' => $kind, 'reason' => $reason]);
            return $reset;
        });
    }

    public function createDelivery(User $user, array $d): array
    {
        if ($existing = FuelDelivery::where('client_uuid', $d['client_uuid'])->first()) {
            return ['delivery' => $existing, 'replayed' => true];
        }
        try {
            $delivery = DB::transaction(function () use ($user, $d) {
                $tank = $this->stock->lockTank((int) $d['fuel_tank_id']);
                if ($existing = FuelDelivery::where('client_uuid', $d['client_uuid'])->first()) return $existing;
                if (!$tank->is_active) throw ValidationException::withMessages(['fuel_tank_id' => ['Citerne inactive.']]);

                $qty = Num::parse($d['quantity_l'], 'quantity_l');
                if (Num::cmp($qty, '0') <= 0) throw ValidationException::withMessages(['quantity_l' => ['La quantité doit être positive.']]);
                $after = Num::add((string) $tank->current_stock_l, $qty);
                $overCapacity = Num::cmp($after, (string) $tank->capacity_l) > 0;
                if ($overCapacity && empty($d['confirm_over_capacity'])) {
                    throw new ConfirmationRequired([Warning::alert('depasse_capacite_citerne',
                        "Après livraison le stock théorique ({$after} L) dépasserait la capacité de {$tank->code} ({$tank->capacity_l} L).")]);
                }

                $at = isset($d['delivered_at']) ? CarbonImmutable::parse($d['delivered_at'], config('fuel.timezone')) : $this->now();
                if ($at->gt($this->now()->addMinutes(5))) {
                    throw ValidationException::withMessages(['delivered_at' => ['Date de livraison dans le futur.']]);
                }
                $delivery = FuelDelivery::create([
                    'client_uuid' => $d['client_uuid'], 'fuel_tank_id' => $tank->id, 'delivered_at' => $at, 'quantity_l' => $qty,
                    'supplier' => $d['supplier'] ?? null, 'delivery_note_number' => $d['delivery_note_number'] ?? null,
                    'delivery_reference' => $d['delivery_reference'] ?? null, 'remark' => $d['remark'] ?? null, 'user_id' => $user->id,
                ]);
                $this->stock->apply($tank, $qty, 'entree', $delivery, $user, $at,
                    'Livraison' . ($delivery->delivery_note_number ? " BL {$delivery->delivery_note_number}" : ''));
                $this->attach($user, $delivery, $d['attachment_ids'] ?? []);
                if ($overCapacity) {
                    FuelAnomaly::create(['type' => 'depasse_capacite_citerne', 'severity' => 'alerte', 'fuel_tank_id' => $tank->id,
                        'site_id' => $tank->site_id, 'message' => "Livraison {$qty} L : stock théorique {$after} L > capacité {$tank->capacity_l} L."]);
                }
                $this->audit->log($user, 'livraison.creee', $delivery, null, $delivery->toArray());
                return $delivery;
            });
        } catch (QueryException $e) {
            if ($existing = FuelDelivery::where('client_uuid', $d['client_uuid'])->first()) return ['delivery' => $existing, 'replayed' => true];
            throw $e;
        }
        return ['delivery' => $delivery, 'replayed' => !$delivery->wasRecentlyCreated];
    }

    public function cancelDelivery(User $user, FuelDelivery $delivery, string $reason): FuelDelivery
    {
        return DB::transaction(function () use ($user, $delivery, $reason) {
            $tank = $this->stock->lockTank($delivery->fuel_tank_id);
            $delivery = FuelDelivery::whereKey($delivery->id)->lockForUpdate()->firstOrFail();
            if ($delivery->status === 'annule') throw ValidationException::withMessages(['delivery' => ['Livraison déjà annulée.']]);
            // Refuse si l'annulation rendrait le stock négatif (le gasoil a déjà été distribué)
            $this->stock->apply($tank, Num::neg((string) $delivery->quantity_l), 'annulation_entree', $delivery, $user, $this->now(),
                "Annulation livraison : {$reason}");
            $delivery->forceFill(['status' => 'annule', 'cancelled_at' => $this->now(), 'cancelled_by' => $user->id, 'cancel_reason' => $reason])->save();
            $this->audit->log($user, 'livraison.annulee', $delivery, ['status' => 'valide'], ['status' => 'annule', 'reason' => $reason]);
            return $delivery;
        });
    }

    /** Inventaire physique : enregistre la mesure et l'écart, sans toucher au stock. */
    public function createInventory(User $user, array $d): FuelInventory
    {
        if ($existing = FuelInventory::where('client_uuid', $d['client_uuid'])->first()) return $existing;
        return DB::transaction(function () use ($user, $d) {
            $tank = $this->stock->lockTank((int) $d['fuel_tank_id']);
            $measured = Num::parse($d['measured_quantity_l'], 'measured_quantity_l');
            if (Num::cmp($measured, '0') < 0) throw ValidationException::withMessages(['measured_quantity_l' => ['Mesure négative.']]);
            $at = isset($d['measured_at']) ? CarbonImmutable::parse($d['measured_at'], config('fuel.timezone')) : $this->now();
            $theoretical = $at->gte($this->now()->subMinute()) ? Num::fmt((string) $tank->current_stock_l) : $this->stock->balanceAt($tank, $at);
            $inv = FuelInventory::create([
                'client_uuid' => $d['client_uuid'], 'fuel_tank_id' => $tank->id, 'measured_at' => $at,
                'measured_quantity_l' => $measured, 'theoretical_quantity_l' => $theoretical,
                'difference_l' => Num::sub($measured, $theoretical), 'method' => $d['method'] ?? null,
                'note' => $d['note'] ?? null, 'user_id' => $user->id,
            ]);
            $this->attach($user, $inv, $d['attachment_ids'] ?? []);
            $this->audit->log($user, 'inventaire.cree', $inv, null, $inv->toArray());
            return $inv;
        });
    }

    /** Approbation : l'inventaire devient le « stock réel mesuré » ; avec ajustement, l'écart est passé en stock. */
    public function reviewInventory(User $admin, FuelInventory $inv, bool $approve, ?string $note, bool $adjust): FuelInventory
    {
        return DB::transaction(function () use ($admin, $inv, $approve, $note, $adjust) {
            $tank = $this->stock->lockTank($inv->fuel_tank_id);
            $inv = FuelInventory::whereKey($inv->id)->lockForUpdate()->firstOrFail();
            if ($inv->status !== 'en_attente') throw ValidationException::withMessages(['status' => ['Inventaire déjà traité.']]);
            $inv->forceFill(['status' => $approve ? 'approuve' : 'rejete', 'reviewed_by' => $admin->id,
                'reviewed_at' => $this->now(), 'review_note' => $note])->save();

            if ($approve && $adjust && !Num::isZero((string) $inv->difference_l)) {
                $adj = FuelAdjustment::create([
                    'fuel_tank_id' => $tank->id, 'fuel_inventory_id' => $inv->id, 'quantity_l' => (string) $inv->difference_l,
                    'reason' => 'Écart d\'inventaire du ' . $inv->measured_at->format('d/m/Y H:i') . ($note ? " — $note" : ''),
                    'effective_at' => $this->now(), 'status' => 'approuve', 'requested_by' => $inv->user_id,
                    'reviewed_by' => $admin->id, 'reviewed_at' => $this->now(),
                ]);
                $this->stock->apply($tank, (string) $adj->quantity_l, 'ajustement', $adj, $admin, $this->now(), $adj->reason, true);
            }
            $this->audit->log($admin, $approve ? 'inventaire.approuve' : 'inventaire.rejete', $inv, null, ['adjust' => $adjust, 'note' => $note]);
            return $inv->fresh('adjustment');
        });
    }

    public function requestAdjustment(User $user, FuelTank $tank, string $qty, string $reason, array $attachmentIds): FuelAdjustment
    {
        return DB::transaction(function () use ($user, $tank, $qty, $reason, $attachmentIds) {
            $q = Num::parse($qty, 'quantity_l');
            if (Num::isZero($q)) throw ValidationException::withMessages(['quantity_l' => ['Quantité nulle.']]);
            $adj = FuelAdjustment::create(['fuel_tank_id' => $tank->id, 'quantity_l' => $q, 'reason' => $reason,
                'effective_at' => $this->now(), 'requested_by' => $user->id]);
            $this->attach($user, $adj, $attachmentIds);
            $this->audit->log($user, 'ajustement.demande', $adj, null, $adj->toArray());
            return $adj;
        });
    }

    public function reviewAdjustment(User $admin, FuelAdjustment $adj, bool $approve, ?string $note, bool $allowNegative = false): FuelAdjustment
    {
        return DB::transaction(function () use ($admin, $adj, $approve, $note, $allowNegative) {
            $tank = $this->stock->lockTank($adj->fuel_tank_id);
            $adj = FuelAdjustment::whereKey($adj->id)->lockForUpdate()->firstOrFail();
            if ($adj->status !== 'en_attente') throw ValidationException::withMessages(['status' => ['Ajustement déjà traité.']]);
            $adj->forceFill(['status' => $approve ? 'approuve' : 'rejete', 'reviewed_by' => $admin->id,
                'reviewed_at' => $this->now(), 'review_note' => $note, 'effective_at' => $this->now()])->save();
            if ($approve) {
                $this->stock->apply($tank, (string) $adj->quantity_l, 'ajustement', $adj, $admin, $this->now(), $adj->reason, $allowNegative);
            }
            $this->audit->log($admin, $approve ? 'ajustement.approuve' : 'ajustement.rejete', $adj, null,
                ['note' => $note, 'allow_negative' => $allowNegative]);
            return $adj;
        });
    }

    public function attach(User $user, Model $target, array $ids): void
    {
        if (!$ids) return;
        $files = FuelAttachment::whereIn('id', $ids)->whereNull('attachable_id')->where('uploaded_by', $user->id)->pluck('id');
        if ($files->count() !== count(array_unique($ids))) {
            throw ValidationException::withMessages(['attachment_ids' => ['Pièce jointe introuvable ou déjà rattachée.']]);
        }
        FuelAttachment::whereIn('id', $files)->update(['attachable_type' => $target->getMorphClass(), 'attachable_id' => $target->getKey()]);
    }
}
