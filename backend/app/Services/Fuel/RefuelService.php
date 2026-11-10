<?php

namespace App\Services\Fuel;

use App\Models\Driver;
use App\Models\DriverAssignment;
use App\Models\Fuel\FuelAnomaly;
use App\Models\Fuel\FuelAttachment;
use App\Models\Fuel\FuelDispenser;
use App\Models\Fuel\FuelRefuel;
use App\Models\Fuel\FuelSetting;
use App\Models\Fuel\FuelTank;
use App\Models\User;
use App\Models\Vehicle;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Cycle de vie d'un bon de ravitaillement.
 *
 * preview() : calcule la quantité, résout l'affectation et liste les contrôles, sans rien écrire.
 * create()  : idempotent (client_uuid). Verrouille citerne puis compteur, refait TOUS les contrôles
 *             au moment exact de la validation, puis écrit bon + mouvement de stock + anomalies.
 *             Une alerte apparue entre l'aperçu et la validation (autre pompiste sur le même
 *             compteur, stock modifié…) renvoie 409 : le pompiste doit la voir et la confirmer.
 */
class RefuelService
{
    public function __construct(
        private StockService $stock,
        private AssignmentResolver $resolver,
        private AuditLogger $audit,
        private FuelAccess $access,
    ) {}

    public function now(): CarbonImmutable
    {
        return CarbonImmutable::now(config('fuel.timezone'));
    }

    /** Données de saisie normalisées + contrôles. Sans écriture. */
    public function evaluate(User $user, array $in, ?FuelTank $tank = null, ?FuelDispenser $dispenser = null, ?CarbonImmutable $at = null): array
    {
        $at ??= $this->now();
        $tank ??= FuelTank::with('site')->findOrFail($in['fuel_tank_id']);
        $this->access->authorize($user, 'refuel', $tank);

        $warnings = [];
        if (!$tank->is_active) $warnings[] = Warning::block('citerne_inactive', "La citerne {$tank->code} est inactive.");

        // Compteur de distribution
        if (!$dispenser) {
            $dispenser = $this->pickDispenser($tank, $in['fuel_dispenser_id'] ?? null, false);
        }
        if (!$dispenser->is_active) $warnings[] = Warning::block('compteur_inactif', 'Ce compteur de distribution est inactif.');

        $vehicle = Vehicle::with('site')->findOrFail($in['vehicle_id']);

        // Séries et quantité
        $start = Num::parse($in['index_start'] ?? null, 'index_start');
        $end = Num::parse($in['index_end'] ?? null, 'index_end');
        $qty = Num::sub($end, $start);
        $declared = Num::parse($in['declared_quantity_l'] ?? null, 'declared_quantity_l', true);
        $expected = Num::fmt((string) $dispenser->current_index);
        $hasHistory = FuelRefuel::where('fuel_dispenser_id', $dispenser->id)->exists()
            || $dispenser->resets()->exists() || !Num::isZero($expected);

        if (Num::cmp($end, $start) < 0) {
            $warnings[] = Warning::block('serie_fin_inferieure',
                "Série fin ({$end}) inférieure à la série départ ({$start}). En cas de remise à zéro ou de changement de compteur, l'administrateur doit d'abord l'enregistrer.");
        } elseif (Num::isZero($qty)) {
            $warnings[] = Warning::block('quantite_nulle', 'La quantité calculée est nulle.');
        }
        if ($hasHistory && Num::cmp($start, $expected) !== 0) {
            $warnings[] = Warning::alert('serie_incoherente',
                "Série départ {$start} ≠ dernière série fin validée {$expected} (écart " . Num::sub($start, $expected) . ' L).',
                ['expected' => $expected, 'entered' => $start]);
        }
        if ($declared !== null) {
            $tol = Num::fmt((string) FuelSetting::get('declared_quantity_tolerance_l', 2));
            if (Num::cmp(Num::abs(Num::sub($declared, $qty)), $tol) > 0) {
                $warnings[] = Warning::alert('ecart_quantite_annoncee',
                    "Quantité annoncée {$declared} L ≠ quantité calculée {$qty} L.", ['declared' => $declared, 'computed' => $qty]);
            }
        }

        // Stock (re-vérifié sous verrou dans create())
        $available = Num::fmt((string) $tank->current_stock_l);
        if (Num::cmp($qty, '0') > 0 && Num::cmp($qty, $available) > 0 && !$tank->allow_negative) {
            $warnings[] = Warning::block('stock_insuffisant', "Stock insuffisant : disponible {$available} L, demandé {$qty} L.");
        }

        // Quantité anormale
        $margin = Num::fmt((string) FuelSetting::get('tank_capacity_margin_pct', 5));
        if ($vehicle->tank_capacity_l !== null) {
            $max = bcmul((string) $vehicle->tank_capacity_l, bcadd('1', bcdiv($margin, '100', 4), 4), 2);
            if (Num::cmp($qty, $max) > 0) {
                $warnings[] = Warning::alert('depasse_reservoir',
                    "{$qty} L dépasse la capacité du réservoir de {$vehicle->code_parc} ({$vehicle->tank_capacity_l} L).");
            }
        } elseif (Num::cmp($qty, Num::fmt((string) FuelSetting::get('max_refuel_l', 1000))) > 0) {
            $warnings[] = Warning::alert('quantite_elevee', "Quantité inhabituellement élevée ({$qty} L).");
        }

        // Compteur véhicule
        $counter = Num::parse($in['counter_value'] ?? null, 'counter_value', true);
        $prev = FuelRefuel::valid()->where('vehicle_id', $vehicle->id)->whereNotNull('counter_value')
            ->orderByDesc('refueled_at')->orderByDesc('id')->first();
        $prevCounter = $prev ? Num::fmt((string) $prev->counter_value) : null;
        $unit = $vehicle->counter_unit;
        if ($counter === null) {
            $warnings[] = Warning::alert('compteur_absent', 'Compteur du véhicule non saisi.');
        } elseif ($prevCounter !== null) {
            if (Num::cmp($counter, $prevCounter) < 0) {
                $warnings[] = Warning::alert('compteur_en_baisse',
                    "Compteur {$counter} {$unit} inférieur au dernier relevé ({$prevCounter} {$unit}).",
                    ['previous' => $prevCounter, 'entered' => $counter]);
            } else {
                $jumpMax = Num::fmt((string) FuelSetting::get($unit === 'h' ? 'max_counter_jump_h' : 'max_counter_jump_km', $unit === 'h' ? 200 : 3000));
                $jump = Num::sub($counter, $prevCounter);
                if (Num::cmp($jump, $jumpMax) > 0) {
                    $warnings[] = Warning::alert('compteur_saut', "Saut de compteur de {$jump} {$unit} depuis le dernier plein.");
                }
            }
        }

        // Doublon probable (même véhicule récemment)
        $window = (int) FuelSetting::get('duplicate_window_minutes', 30);
        $recent = FuelRefuel::valid()->where('vehicle_id', $vehicle->id)
            ->where('refueled_at', '>=', $at->subMinutes($window))->first();
        if ($recent) {
            $warnings[] = Warning::alert('doublon_probable',
                "{$vehicle->code_parc} a déjà été ravitaillé à {$recent->refueled_at->format('H:i')} (bon {$recent->voucher_number}).");
        }
        $paper = isset($in['paper_voucher_number']) ? trim((string) $in['paper_voucher_number']) : '';
        if ($paper !== '' && FuelRefuel::valid()->where('paper_voucher_number', $paper)->exists()) {
            $warnings[] = Warning::alert('bon_papier_deja_utilise', "Le bon papier n° {$paper} est déjà enregistré.");
        }

        // Affectation
        $res = $this->resolver->resolve($vehicle, $tank->site_id, $at);
        $warnings = array_merge($warnings, $res['warnings']);

        [$driver, $assignment, $driverWarnings] = $this->chooseDriver($in, $res);
        $warnings = array_merge($warnings, $driverWarnings);

        if (empty($in['attachment_ids']) && FuelSetting::get('require_photo', false)) {
            $warnings[] = Warning::block('photo_obligatoire', 'Au moins une photo du bon est obligatoire.');
        }

        return compact('tank', 'dispenser', 'vehicle', 'start', 'end', 'qty', 'declared', 'expected',
            'counter', 'prevCounter', 'unit', 'res', 'driver', 'assignment', 'warnings', 'at', 'paper', 'available');
    }

    /** Compteur indiqué, ou le compteur actif unique de la citerne. */
    private function pickDispenser(FuelTank $tank, mixed $id, bool $lock): FuelDispenser
    {
        $q = FuelDispenser::where('fuel_tank_id', $tank->id);
        if ($lock) $q->lockForUpdate();
        if (!empty($id)) {
            $d = $q->whereKey($id)->first();
            if (!$d) throw ValidationException::withMessages(['fuel_dispenser_id' => ["Ce compteur n'appartient pas à la citerne {$tank->code}."]]);
            return $d;
        }
        $active = $q->where('is_active', true)->get();
        if ($active->count() === 1) return $active->first();
        throw ValidationException::withMessages(['fuel_dispenser_id' => [$active->isEmpty()
            ? "Aucun compteur de distribution actif sur la citerne {$tank->code}."
            : 'Plusieurs compteurs sur cette citerne : sélectionner le compteur utilisé.']]);
    }

    /** Conducteur retenu : choix explicite (parmi les affectations, ou autre avec motif) ou proposition. */
    private function chooseDriver(array $in, array $res): array
    {
        $warnings = [];
        $candidates = $res['candidates'];

        if (array_key_exists('driver_id', $in) && $in['driver_id'] !== null && $in['driver_id'] !== '') {
            $driver = Driver::findOrFail($in['driver_id']);
            $assignment = $candidates->firstWhere('driver_id', $driver->id);
            if (!$assignment) {
                if (empty($in['driver_reason'])) {
                    $warnings[] = Warning::block('motif_conducteur_requis',
                        "{$driver->name} n'est pas affecté à ce véhicule : indiquer un motif (remplaçant…).");
                } else {
                    $warnings[] = Warning::alert('conducteur_non_affecte',
                        "Conducteur {$driver->name} non affecté à ce véhicule — motif : {$in['driver_reason']}.");
                }
            } elseif ($res['proposed'] && $assignment->id !== $res['proposed']->id) {
                $warnings[] = Warning::info('conducteur_modifie', 'Conducteur différent de la proposition automatique.');
            }
            return [$driver, $assignment, $warnings];
        }

        if ($res['status'] === 'ambigu') {
            $warnings[] = Warning::block('selection_conducteur', 'Sélectionner le conducteur parmi les affectations proposées.');
            return [null, null, $warnings];
        }

        return [$res['proposed']?->driver, $res['proposed'], $warnings];
    }

    public function preview(User $user, array $in): array
    {
        $e = $this->evaluate($user, $in);
        return $this->presentEvaluation($e, $user);
    }

    public function presentEvaluation(array $e, User $user): array
    {
        return [
            'at' => $e['at']->format('Y-m-d H:i:s'),
            'timezone' => config('fuel.timezone'),
            'work_date' => $e['res']['work_date'],
            'tank' => ['id' => $e['tank']->id, 'code' => $e['tank']->code, 'name' => $e['tank']->name,
                'stock_l' => $this->access->canSeeStock($user, $e['tank']) ? $e['available'] : null],
            'dispenser' => ['id' => $e['dispenser']->id, 'code' => $e['dispenser']->code, 'expected_index_start' => $e['expected']],
            'vehicle' => VehiclePresenter::card($e['vehicle']),
            'shift' => $e['res']['shift']?->only(['id', 'code', 'name', 'start_time', 'end_time']),
            'assignment_status' => $e['res']['status'],
            'driver' => $e['driver']?->only(['id', 'name']),
            'candidates' => VehiclePresenter::candidates($e['res']['candidates']),
            'index_start' => $e['start'],
            'index_end' => $e['end'],
            'quantity_l' => $e['qty'],
            'declared_quantity_l' => $e['declared'],
            'counter_value' => $e['counter'],
            'counter_unit' => $e['unit'],
            'previous_counter_value' => $e['prevCounter'],
            'warnings' => $e['warnings'],
            'can_submit' => !collect($e['warnings'])->contains('level', 'bloquant'),
        ];
    }

    /**
     * @return array{refuel: FuelRefuel, replayed: bool}
     * @throws ValidationException|ConfirmationRequired
     */
    public function create(User $user, array $in): array
    {
        if ($existing = FuelRefuel::where('client_uuid', $in['client_uuid'])->first()) {
            return ['refuel' => $existing, 'replayed' => true];
        }

        try {
            $refuel = DB::transaction(function () use ($user, $in) {
                $tank = $this->stock->lockTank((int) $in['fuel_tank_id']);
                $tank->load('site');
                $dispenser = $this->pickDispenser($tank, $in['fuel_dispenser_id'] ?? null, true);

                // Doublon par client_uuid arrivé pendant l'attente du verrou
                if ($existing = FuelRefuel::where('client_uuid', $in['client_uuid'])->first()) {
                    return $existing;
                }

                $at = $this->now();
                $e = $this->evaluate($user, $in, $tank, $dispenser, $at);
                $this->guard($e['warnings'], $in['confirmed_warnings'] ?? []);

                $seq = $tank->last_voucher_seq + 1;
                FuelTank::whereKey($tank->id)->update(['last_voucher_seq' => $seq]);

                $refuel = FuelRefuel::create($this->attributes($user, $in, $e, $seq, $at));

                $this->stock->apply($tank, Num::neg($e['qty']), 'sortie', $refuel, $user, $at,
                    "Bon {$refuel->voucher_number} — {$refuel->vehicle_code}");
                $refuel->forceFill(['stock_after_l' => (string) $tank->current_stock_l])->save();

                FuelDispenser::whereKey($dispenser->id)->update(['current_index' => $e['end']]);

                $this->attachFiles($user, $refuel, $in['attachment_ids'] ?? []);
                $this->recordAnomalies($refuel, $e['warnings'], $tank, $e['vehicle']);
                $this->lowStockAnomaly($tank);
                $this->audit->log($user, 'ravitaillement.cree', $refuel, null, $refuel->only([
                    'voucher_number', 'vehicle_code', 'quantity_l', 'index_start', 'index_end', 'counter_value', 'driver_name',
                ]));

                return $refuel;
            }, 3);
        } catch (QueryException $ex) {
            // Course sur la contrainte unique client_uuid : renvoyer le bon déjà créé
            if ($existing = FuelRefuel::where('client_uuid', $in['client_uuid'])->first()) {
                return ['refuel' => $existing, 'replayed' => true];
            }
            throw $ex;
        }

        return ['refuel' => $refuel, 'replayed' => $refuel->wasRecentlyCreated === false];
    }

    /** Bloquants → 422 ; alertes non confirmées → 409 avec la liste à confirmer. */
    private function guard(array $warnings, array $confirmed): void
    {
        $blocking = array_values(array_filter($warnings, fn ($w) => $w['level'] === 'bloquant'));
        if ($blocking) {
            throw ValidationException::withMessages(['controle' => array_column($blocking, 'message')]);
        }
        $alerts = array_filter($warnings, fn ($w) => $w['level'] === 'alerte');
        $missing = array_values(array_filter($alerts, fn ($w) => !in_array($w['code'], $confirmed, true)));
        if ($missing) throw new ConfirmationRequired($missing);
    }

    private function attributes(User $user, array $in, array $e, int $seq, CarbonImmutable $at): array
    {
        $tank = $e['tank'];
        $vehicle = $e['vehicle'];
        $shift = $e['res']['shift'];
        $driver = $e['driver'];

        return [
            'client_uuid' => $in['client_uuid'],
            'voucher_seq' => $seq,
            'voucher_number' => $tank->code . '-' . str_pad((string) $seq, 6, '0', STR_PAD_LEFT),
            'paper_voucher_number' => $e['paper'] !== '' ? $e['paper'] : null,
            'fuel_tank_id' => $tank->id,
            'fuel_dispenser_id' => $e['dispenser']->id,
            'vehicle_id' => $vehicle->id,
            'driver_id' => $driver?->id,
            'driver_assignment_id' => $e['assignment']?->id,
            'work_shift_id' => $shift?->id,
            'site_id' => $tank->site_id,
            'pump_attendant_id' => $user->id,
            'refueled_at' => $at,
            'work_date' => $e['res']['work_date'],
            'vehicle_code' => $vehicle->code_parc,
            'vehicle_immatriculation' => $vehicle->immatriculation,
            'vehicle_type' => $vehicle->type_label,
            'vehicle_category' => $vehicle->category,
            'driver_name' => $driver?->name,
            'shift_name' => $shift?->name,
            'site_name' => $tank->site->name,
            'pump_attendant_name' => $user->name,
            'snapshot' => [
                'vehicle' => $vehicle->only(['id', 'code_parc', 'immatriculation', 'chassis', 'type_label', 'category', 'counter_unit', 'status', 'site_id']),
                'vehicle_site' => $vehicle->site?->only(['id', 'code', 'name']),
                'tank' => $tank->only(['id', 'code', 'name', 'kind', 'site_id']),
                'site' => $tank->site->only(['id', 'code', 'name']),
                'dispenser' => $e['dispenser']->only(['id', 'code', 'name']),
                'shift' => $shift?->only(['id', 'code', 'name', 'team_slot', 'start_time', 'end_time']),
                'assignment' => $e['assignment']?->only(['id', 'driver_id', 'team_slot', 'site_id', 'starts_on', 'ends_on', 'is_replacement']),
                'assignment_status' => $e['res']['status'],
                'driver' => $driver?->only(['id', 'name', 'matricule']),
                'driver_reason' => $in['driver_reason'] ?? null,
                'identified_by' => $in['identified_by'] ?? 'manuel',
                'pump_attendant' => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email],
                'warnings' => $e['warnings'],
            ],
            'index_start' => $e['start'],
            'index_end' => $e['end'],
            'quantity_l' => $e['qty'],
            'declared_quantity_l' => $e['declared'],
            'expected_index_start' => $e['expected'],
            'counter_value' => $e['counter'],
            'counter_unit' => $e['unit'],
            'previous_counter_value' => $e['prevCounter'],
            'stock_before_l' => (string) $tank->current_stock_l,
            'stock_after_l' => (string) $tank->current_stock_l, // complété après le mouvement
            'remark' => $in['remark'] ?? null,
            'has_anomaly' => collect($e['warnings'])->contains('level', 'alerte'),
            'corrects_refuel_id' => $in['corrects_refuel_id'] ?? null,
        ];
    }

    private function attachFiles(User $user, FuelRefuel $refuel, array $ids): void
    {
        if (!$ids) return;
        $files = FuelAttachment::whereIn('id', $ids)->whereNull('attachable_id')->where('uploaded_by', $user->id)->get();
        if ($files->count() !== count(array_unique($ids))) {
            throw ValidationException::withMessages(['attachment_ids' => ['Photo introuvable ou déjà rattachée à un autre bon.']]);
        }
        FuelAttachment::whereIn('id', $files->pluck('id'))->update([
            'attachable_type' => $refuel->getMorphClass(),
            'attachable_id' => $refuel->id,
        ]);
    }

    private function recordAnomalies(FuelRefuel $refuel, array $warnings, FuelTank $tank, Vehicle $vehicle): void
    {
        foreach ($warnings as $w) {
            if ($w['level'] !== 'alerte') continue;
            FuelAnomaly::create([
                'type' => $w['code'],
                'severity' => in_array($w['code'], ['serie_incoherente', 'compteur_en_baisse', 'doublon_probable', 'bon_papier_deja_utilise'], true) ? 'critique' : 'alerte',
                'fuel_tank_id' => $tank->id,
                'site_id' => $tank->site_id,
                'fuel_refuel_id' => $refuel->id,
                'vehicle_id' => $vehicle->id,
                'message' => $w['message'],
                'data' => $w['data'] ?: null,
            ]);
        }
    }

    public function lowStockAnomaly(FuelTank $tank): void
    {
        $threshold = $tank->low_stock_threshold_l ?? FuelSetting::get('low_stock_threshold_l');
        if ($threshold === null || Num::cmp((string) $tank->current_stock_l, Num::fmt((string) $threshold)) > 0) return;
        $open = FuelAnomaly::where('type', 'stock_faible')->where('fuel_tank_id', $tank->id)->where('status', 'ouverte')->exists();
        if ($open) return;
        FuelAnomaly::create([
            'type' => 'stock_faible', 'severity' => 'alerte', 'fuel_tank_id' => $tank->id, 'site_id' => $tank->site_id,
            'message' => "Stock faible dans {$tank->code} : {$tank->current_stock_l} L (seuil {$threshold} L).",
        ]);
    }

    /**
     * Annulation : le bon passe en « annulé », un mouvement compensatoire réintègre la quantité.
     * L'index du compteur n'est pas modifié (le volucompteur a réellement tourné).
     */
    public function cancel(User $approver, FuelRefuel $refuel, string $reason): FuelRefuel
    {
        return DB::transaction(function () use ($approver, $refuel, $reason) {
            $tank = $this->stock->lockTank($refuel->fuel_tank_id);
            $refuel = FuelRefuel::whereKey($refuel->id)->lockForUpdate()->firstOrFail();
            if ($refuel->status === 'annule') {
                throw ValidationException::withMessages(['refuel' => ['Ce bon est déjà annulé.']]);
            }
            $old = $refuel->only(['status']);
            $this->stock->apply($tank, Num::fmt((string) $refuel->quantity_l), 'annulation_sortie', $refuel, $approver,
                $this->now(), "Annulation du bon {$refuel->voucher_number} : {$reason}", true);

            $refuel->forceFill([
                'status' => 'annule', 'cancelled_at' => $this->now(), 'cancelled_by' => $approver->id, 'cancel_reason' => $reason,
            ])->save();

            $this->audit->log($approver, 'ravitaillement.annule', $refuel, $old, ['status' => 'annule', 'reason' => $reason]);
            return $refuel;
        });
    }

    /**
     * Correction : annulation + nouveau bon qui référence l'original (corrects_refuel_id).
     * Les champs non corrigés sont repris de l'original ; date/heure d'origine conservées.
     * Le nouveau bon ne déplace pas l'index courant du compteur.
     */
    public function correct(User $approver, FuelRefuel $original, array $changes, string $reason): FuelRefuel
    {
        return DB::transaction(function () use ($approver, $original, $changes, $reason) {
            $this->cancel($approver, $original, "Correction : {$reason}");
            $original->refresh();

            $tank = $this->stock->lockTank($original->fuel_tank_id);
            $tank->load('site');

            $start = Num::parse($changes['index_start'] ?? (string) $original->index_start, 'index_start');
            $end = Num::parse($changes['index_end'] ?? (string) $original->index_end, 'index_end');
            if (Num::cmp($end, $start) <= 0) {
                throw ValidationException::withMessages(['index_end' => ['La série fin doit être supérieure à la série départ.']]);
            }
            $qty = Num::sub($end, $start);
            $counter = array_key_exists('counter_value', $changes)
                ? Num::parse($changes['counter_value'], 'counter_value', true)
                : ($original->counter_value !== null ? Num::fmt((string) $original->counter_value) : null);

            $vehicle = isset($changes['vehicle_id']) ? Vehicle::findOrFail($changes['vehicle_id']) : $original->vehicle;
            $driver = array_key_exists('driver_id', $changes)
                ? ($changes['driver_id'] ? Driver::findOrFail($changes['driver_id']) : null)
                : $original->driver;

            $seq = $tank->last_voucher_seq + 1;
            FuelTank::whereKey($tank->id)->update(['last_voucher_seq' => $seq]);

            $attrs = $original->replicate(['client_uuid', 'voucher_number', 'voucher_seq', 'status', 'cancelled_at',
                'cancelled_by', 'cancel_reason', 'created_at', 'updated_at'])->getAttributes();

            $snapshot = $original->snapshot;
            $snapshot['correction'] = ['of' => $original->voucher_number, 'reason' => $reason, 'by' => $approver->name];
            if ($vehicle->id !== $original->vehicle_id) {
                $snapshot['vehicle'] = $vehicle->only(['id', 'code_parc', 'immatriculation', 'chassis', 'type_label', 'category', 'counter_unit', 'status', 'site_id']);
            }
            if ($driver?->id !== $original->driver_id) {
                $snapshot['driver'] = $driver?->only(['id', 'name', 'matricule']);
            }

            $new = FuelRefuel::create(array_merge($attrs, [
                'client_uuid' => (string) \Illuminate\Support\Str::uuid(),
                'voucher_seq' => $seq,
                'voucher_number' => $tank->code . '-' . str_pad((string) $seq, 6, '0', STR_PAD_LEFT),
                'vehicle_id' => $vehicle->id,
                'vehicle_code' => $vehicle->code_parc,
                'vehicle_immatriculation' => $vehicle->immatriculation,
                'vehicle_type' => $vehicle->type_label,
                'vehicle_category' => $vehicle->category,
                'counter_unit' => $vehicle->counter_unit,
                'driver_id' => $driver?->id,
                'driver_name' => $driver?->name,
                'index_start' => $start,
                'index_end' => $end,
                'quantity_l' => $qty,
                'counter_value' => $counter,
                'paper_voucher_number' => $changes['paper_voucher_number'] ?? $original->paper_voucher_number,
                'remark' => $changes['remark'] ?? $original->remark,
                'snapshot' => $snapshot,
                'stock_before_l' => (string) $tank->current_stock_l,
                'stock_after_l' => (string) $tank->current_stock_l,
                'corrects_refuel_id' => $original->id,
                'status' => 'valide',
                'has_anomaly' => false,
            ]));

            // Sortie datée à l'heure d'origine pour garder la chronologie du rapport
            $this->stock->apply($tank, Num::neg($qty), 'sortie', $new, $approver, $original->refueled_at->toImmutable(),
                "Bon {$new->voucher_number} (correction de {$original->voucher_number})");
            $new->forceFill(['stock_after_l' => (string) $tank->current_stock_l])->save();

            // Les justificatifs restent rattachés à l'original ET sont visibles depuis le nouveau
            foreach ($original->attachments as $a) {
                $copy = $a->replicate();
                $copy->attachable_id = $new->id;
                $copy->save();
            }

            $this->audit->log($approver, 'ravitaillement.corrige', $new, $original->only(['voucher_number', 'quantity_l', 'index_start', 'index_end', 'counter_value', 'vehicle_code', 'driver_name']),
                $new->only(['voucher_number', 'quantity_l', 'index_start', 'index_end', 'counter_value', 'vehicle_code', 'driver_name']) + ['reason' => $reason]);

            return $new;
        });
    }
}
