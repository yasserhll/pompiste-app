<?php

namespace Tests\Feature\Fuel;

use App\Models\Fuel\FuelRefuel;
use App\Models\Fuel\FuelTank;
use App\Models\Vehicle;
use App\Services\Fuel\ReportPeriod;
use App\Services\Fuel\StockOperations;
use App\Services\Fuel\TankReportExporter;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Storage;

/**
 * Fichiers « Citerne LOUTA 1 » : la citerne fixe ravitaille le camion-citerne 85751A55
 * (« REMIS A LA CITERNE ») → la sortie de LOUTA 1 est une entrée de la citerne mobile.
 * Bons papier : société cochée (TRANSWIN / LAHLAL / LEL / AUTRES) et CIN si « autres ».
 */
class TransferAndProofTest extends FuelTestCase
{
    private FuelTank $fixed;
    private Vehicle $truck85751;

    protected function setUp(): void
    {
        parent::setUp();
        // Le camion-citerne 85751A55 porte la citerne mobile du jeu d'essai
        $this->truck85751 = Vehicle::create(['site_id' => $this->louta->id, 'code_parc' => '85751', 'immatriculation' => '85751A55',
            'type_label' => 'CITERNE MOBILE', 'category' => 'citerne', 'counter_unit' => 'km']);
        $this->tank->update(['vehicle_id' => $this->truck85751->id]);
        $this->fixed = app(StockOperations::class)->createTank($this->admin, ['site_id' => $this->louta->id, 'code' => 'LOUTA1',
            'name' => 'Citerne fixe LOUTA 1', 'kind' => 'fixe', 'capacity_l' => '40000', 'initial_stock_l' => '30000']);
        $this->fixed->dispensers()->first()->forceFill(['current_index' => '462'])->save();
        $this->pompiste->fuelTanks()->attach($this->fixed->id);
    }

    private function fill85751(string $start, string $end, array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->pompiste)->postJson('/api/refuels', array_merge(
            $this->refuelPayload($this->truck85751, $start, $end, ['fuel_tank_id' => $this->fixed->id, 'counter_value' => '13608',
                'confirmed_warnings' => ['vehicule_sans_affectation']]), $extra));
    }

    public function test_large_fill_of_tank_truck_is_a_transfer(): void
    {
        $scan = $this->actingAs($this->pompiste)->postJson('/api/refuels/preview',
            $this->refuelPayload($this->truck85751, '462', '1368', ['fuel_tank_id' => $this->fixed->id]))->assertOk();
        $scan->assertJsonPath('transfer.tank.code', '85751A55')->assertJsonPath('transfer.purpose', 'transfert');

        $r = $this->fill85751('462', '1368')->assertCreated()->json('refuel'); // 906 L, comme le bon 20204
        $this->assertSame('transfert', $r['purpose']);
        $this->assertSame($this->tank->id, $r['transfer_to_tank_id']);
        $this->assertSame('29094.00', (string) FuelTank::find($this->fixed->id)->current_stock_l);
        $this->assertSame('3906.00', (string) FuelTank::find($this->tank->id)->current_stock_l); // 3000 + 906
        $this->assertDatabaseHas('fuel_stock_movements', ['fuel_tank_id' => $this->tank->id, 'type' => 'transfert_entree', 'quantity_l' => '906.00']);
        $this->assertSame(0, Artisan::call('fuel:verify-stock'));

        // Annulation : les deux citernes reviennent à leur stock
        $this->actingAs($this->admin)->postJson("/api/refuels/{$r['id']}/cancel", ['reason' => 'Erreur de citerne'])->assertOk();
        $this->assertSame('30000.00', (string) FuelTank::find($this->fixed->id)->current_stock_l);
        $this->assertSame('3000.00', (string) FuelTank::find($this->tank->id)->current_stock_l);
        $this->assertSame(0, Artisan::call('fuel:verify-stock'));
    }

    public function test_small_fill_of_tank_truck_is_its_own_engine(): void
    {
        $r = $this->fill85751('462', '511')->assertCreated()->json('refuel'); // 49 L : plein moteur
        $this->assertSame('consommation', $r['purpose']);
        $this->assertNull($r['transfer_to_tank_id']);
        $this->assertSame('3000.00', (string) FuelTank::find($this->tank->id)->current_stock_l);

        // Le pompiste peut forcer « remis à la citerne » (ex. 131 L, bon 20203 — 2 h plus tard)
        $this->at('2026-11-07 12:30:00');
        $r2 = $this->fill85751('511', '642', ['purpose' => 'transfert'])->assertCreated()->json('refuel');
        $this->assertSame('transfert', $r2['purpose']);
        $this->assertSame('3131.00', (string) FuelTank::find($this->tank->id)->current_stock_l);
    }

    public function test_company_and_external_driver_cin(): void
    {
        $p = $this->refuelPayload($this->d265, '664344', '664508', ['counter_value' => '834', 'company' => 'Société X',
            'external_driver_name' => 'Conducteur externe', 'confirmed_warnings' => ['vehicule_sans_affectation']]);
        $res = $this->actingAs($this->pompiste)->postJson('/api/refuels', $p)->assertStatus(409);
        $this->assertContains('cin_absent', array_column($res->json('warnings'), 'code'));

        $p['external_driver_cin'] = 'ab 123456';
        $r = $this->actingAs($this->pompiste)->postJson('/api/refuels', $p)->assertCreated()->json('refuel');
        $this->assertSame('SOCIÉTÉ X', $r['company']);
        $this->assertSame('AB123456', $r['external_driver_cin']);

        // Société connue : pas de CIN demandé
        $this->at('2026-11-07 11:30:00');
        $this->actingAs($this->pompiste)->postJson('/api/refuels', $this->refuelPayload($this->d222, '664508', '664735', [
            'counter_value' => '3808', 'company' => 'transwin']))->assertCreated()->assertJsonPath('refuel.company', 'TRANSWIN');
    }

    public function test_tank_ledger_shows_proofs_next_to_each_exit(): void
    {
        Storage::fake('local');
        $photo = $this->actingAs($this->pompiste)->post('/api/attachments', ['file' => UploadedFile::fake()->image('bon 2.jpeg', 1600, 900), 'kind' => 'bon_papier'],
            ['Accept' => 'application/json'])->assertCreated()->json();
        $this->assertTrue($photo['has_thumb']);
        $this->actingAs($this->pompiste)->get("/api/attachments/{$photo['id']}?thumb=1")->assertOk()->assertHeader('content-type', 'image/jpeg');

        $this->at('2026-11-07 04:29:00');
        $this->actingAs($this->pompiste)->postJson('/api/refuels', $this->refuelPayload($this->d265, '66 4344', '66 4508', [
            'counter_value' => '834', 'paper_voucher_number' => '0075951', 'company' => 'TRANSWIN',
            'confirmed_warnings' => ['vehicule_sans_affectation']]))->assertCreated();
        $this->at('2026-11-07 04:35:00');
        $d222 = $this->actingAs($this->pompiste)->postJson('/api/refuels', $this->refuelPayload($this->d222, '66 4508', '66 4735', [
            'counter_value' => '3808', 'paper_voucher_number' => '0075952', 'company' => 'TRANSWIN', 'attachment_ids' => [$photo['id']],
            'confirmed_warnings' => ['vehicule_inactif']]))->assertCreated()->json('refuel');
        // 04:35 → shift de nuit de la journée du 06/11
        $this->assertSame('YOUSSEF TEST', $d222['driver_name']);
        $this->assertSame('2026-11-06', substr($d222['work_date'], 0, 10));

        $l = $this->actingAs($this->admin)->getJson("/api/tanks/{$this->tank->id}/ledger?period=periode&from=2026-11-07&to=2026-11-07")->assertOk();
        $l->assertJsonPath('opening_l', '3000.00')->assertJsonPath('closing_l', '2609.00')
            ->assertJsonPath('totals.vouchers', 2)->assertJsonPath('totals.with_proof', 1);
        $rows = $l->json('rows');
        $this->assertSame(['D265', 'D222'], array_column($rows, 'vehicle_code'));
        $this->assertSame([], $rows[0]['attachments']);
        $this->assertSame($photo['id'], $rows[1]['attachments'][0]['id']);
        $this->assertSame('664508.00', $rows[1]['index_start']);
        $this->assertStringContainsString('Bon papier 0075952', $rows[1]['remark']);

        // Excel : colonne N « JUSTIFICATIFS » avec lien vers le bon
        $book = app(TankReportExporter::class)->tanksWorkbook(FuelTank::whereKey($this->tank->id)->with('site')->get(),
            ReportPeriod::fromRequest(['period' => 'jour', 'date' => '2026-11-07']), 'J');
        $ws = $book->getSheetByName('85751A55');
        $this->assertSame('JUSTIFICATIFS', $ws->getCell('N5')->getValue());
        $this->assertSame('Aucune — voir le bon', $ws->getCell('N8')->getValue());
        $this->assertSame('1 photo(s) — voir', $ws->getCell('N9')->getValue());
        $this->assertStringEndsWith('/bons/' . $d222['id'], $ws->getCell('N9')->getHyperlink()->getUrl());
    }

    public function test_transfer_appears_as_entry_in_destination_report(): void
    {
        $this->fill85751('462', '1368')->assertCreated();
        $p = ReportPeriod::fromRequest(['period' => 'jour', 'date' => '2026-11-07']);
        $book = app(TankReportExporter::class)->tanksWorkbook(FuelTank::whereIn('id', [$this->tank->id, $this->fixed->id])->with('site')->orderBy('code')->get(), $p, 'Global');
        $this->assertSame(['Synthèse', '85751A55', 'LOUTA1', 'Consommation', 'Sorties par jour', 'Anomalies'], $book->getSheetNames());

        $dest = $book->getSheetByName('85751A55');
        $this->assertSame('TRANSFERT LOUTA1', $dest->getCell('C8')->getValue());
        $this->assertEquals(906, $dest->getCell('B8')->getValue());
        $src = $book->getSheetByName('LOUTA1');
        $this->assertSame('STOCK INITIAL', $src->getCell('C8')->getValue()); // LOUTA1 créée le jour même
        $this->assertStringContainsString('REMIS A LA CITERNE 85751A55', $src->getCell('J9')->getValue());
        $this->assertEquals(906, $src->getCell('I9')->getValue());

        $daily = $book->getSheetByName('Sorties par jour');
        $this->assertSame('Citerne LOUTA1', $daily->getCell('D3')->getValue());
        $this->assertEquals(906, $daily->getCell('E5')->getValue());
        // Un transfert n'est pas une consommation de véhicule
        $this->assertNull($book->getSheetByName('Consommation')->getCell('C2')->getValue());
    }
}
