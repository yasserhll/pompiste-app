<?php

namespace Tests\Feature\Fuel;

use App\Models\Driver;
use App\Models\DriverAssignment;
use App\Models\Fuel\FuelTank;
use App\Models\Fuel\VehicleQrCode;
use App\Models\Site;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\WorkShift;
use App\Services\Fuel\StockOperations;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Jeu d'essai reprenant les bons terrain du 07/11/2026 :
 *   bon 0075952 — D222 — 3808 H — 227 L — séries 66 4508 → 66 4735 (séries à confirmer sur la photo)
 *   bon 0075951 — D265 —  834 H — 164 L — séries non lisibles : 66 4344 → 66 4508 supposées
 *                                         (bon précédent, sa série fin = série départ de D222)
 * Les noms de conducteurs sont des données de test.
 */
abstract class FuelTestCase extends TestCase
{
    use RefreshDatabase;

    protected Site $louta;
    protected Site $mzinda;
    protected FuelTank $tank;      // citerne mobile 85751A55 (Louta)
    protected FuelTank $otherTank; // citerne 84246A55 (MZINDA)
    protected User $admin;
    protected User $pompiste;
    protected User $pompiste2;
    protected Vehicle $d222;
    protected Vehicle $d265;
    protected Driver $ahmed;
    protected Driver $youssef;

    protected function setUp(): void
    {
        parent::setUp();
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-07 10:15:00', 'Africa/Casablanca'));
        \Illuminate\Support\Carbon::setTestNow(CarbonImmutable::now());

        WorkShift::create(['site_id' => null, 'code' => 'matin', 'name' => 'Matin', 'team_slot' => 1, 'start_time' => '07:00', 'end_time' => '19:00']);
        WorkShift::create(['site_id' => null, 'code' => 'soir', 'name' => 'Soir', 'team_slot' => 2, 'start_time' => '19:00', 'end_time' => '07:00']);

        $this->louta = Site::create(['code' => 'LOUTA', 'name' => 'Louta']);
        $this->mzinda = Site::create(['code' => 'MZINDA', 'name' => 'MZINDA']);

        $this->admin = User::factory()->create(['role' => 'admin', 'name' => 'Admin']);
        $this->pompiste = User::factory()->create(['role' => 'pompiste', 'name' => 'Pompiste Louta']);
        $this->pompiste2 = User::factory()->create(['role' => 'pompiste', 'name' => 'Pompiste Louta 2']);

        $this->d222 = Vehicle::create(['site_id' => $this->louta->id, 'code_parc' => 'D222', 'immatriculation' => 'CF9SB099805EH1731',
            'type_label' => 'SINOTRUK', 'category' => 'camion', 'counter_unit' => 'h']);
        $this->d265 = Vehicle::create(['site_id' => $this->louta->id, 'code_parc' => 'D265', 'immatriculation' => 'CF9SB099793EH1744',
            'type_label' => 'SINOTRUK', 'category' => 'camion', 'counter_unit' => 'h']);

        $ops = app(StockOperations::class);
        $this->tank = $ops->createTank($this->admin, ['site_id' => $this->louta->id, 'code' => '85751A55', 'name' => 'Citerne mobile 85751A55',
            'kind' => 'mobile', 'capacity_l' => '5000', 'initial_stock_l' => '3000', 'initial_stock_at' => '2026-11-01 06:00:00',
            'last_voucher_seq' => 1911]);
        $this->otherTank = $ops->createTank($this->admin, ['site_id' => $this->mzinda->id, 'code' => '84246A55', 'name' => 'Citerne MZINDA',
            'kind' => 'mobile', 'capacity_l' => '5000', 'initial_stock_l' => '2000']);
        $this->tank->dispensers()->first()->forceFill(['current_index' => '664344.00'])->save();

        $this->pompiste->fuelTanks()->attach($this->tank->id);
        $this->pompiste2->fuelTanks()->attach($this->tank->id);

        $this->ahmed = Driver::findOrCreateByName('AHMED TEST');
        $this->youssef = Driver::findOrCreateByName('YOUSSEF TEST');
        foreach ([[$this->d222, $this->ahmed, 1], [$this->d222, $this->youssef, 2]] as [$v, $d, $slot]) {
            DriverAssignment::create(['vehicle_id' => $v->id, 'driver_id' => $d->id, 'team_slot' => $slot,
                'site_id' => $this->louta->id, 'starts_on' => '2026-10-26']);
        }
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        \Illuminate\Support\Carbon::setTestNow();
        parent::tearDown();
    }

    protected function at(string $datetime): void
    {
        CarbonImmutable::setTestNow(CarbonImmutable::parse($datetime, 'Africa/Casablanca'));
        \Illuminate\Support\Carbon::setTestNow(CarbonImmutable::now());
    }

    protected function qrFor(Vehicle $v): VehicleQrCode
    {
        return VehicleQrCode::create(['vehicle_id' => $v->id, 'token' => VehicleQrCode::newToken(), 'created_by' => $this->admin->id]);
    }

    protected function refuelPayload(Vehicle $v, string $start, string $end, array $extra = []): array
    {
        return array_merge([
            'client_uuid' => (string) Str::uuid(),
            'fuel_tank_id' => $this->tank->id,
            'vehicle_id' => $v->id,
            'identified_by' => 'qr',
            'index_start' => $start,
            'index_end' => $end,
            'counter_value' => null,
        ], $extra);
    }

    /** Bon D265 (0075951) puis D222 (0075952) — dans l'ordre des numéros de bons papier. */
    protected function recordFieldVouchers(): array
    {
        $this->at('2026-11-07 10:15:00');
        $d265 = $this->actingAs($this->pompiste)->postJson('/api/refuels', $this->refuelPayload($this->d265, '66 4344', '66 4508', [
            'counter_value' => '834', 'paper_voucher_number' => '0075951', 'declared_quantity_l' => '164',
            'confirmed_warnings' => ['vehicule_sans_affectation'],
        ]))->assertCreated()->json('refuel');

        $this->at('2026-11-07 10:40:00');
        $d222 = $this->actingAs($this->pompiste)->postJson('/api/refuels', $this->refuelPayload($this->d222, '66 4508', '66 4735', [
            'counter_value' => '3 808', 'paper_voucher_number' => '0075952', 'declared_quantity_l' => '227',
        ]))->assertCreated()->json('refuel');

        return [$d265, $d222];
    }
}
