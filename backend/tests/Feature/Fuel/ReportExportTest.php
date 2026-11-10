<?php

namespace Tests\Feature\Fuel;

use App\Models\Fuel\FuelTank;
use App\Services\Fuel\ReportPeriod;
use App\Services\Fuel\TankReportExporter;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\Calculation\Calculation;

class ReportExportTest extends FuelTestCase
{
    // 9 & 18. Export conforme au modèle mobile 1.xlsx, soldes = journal de stock
    public function test_tank_report_matches_template_and_stock(): void
    {
        $this->at('2026-11-03 08:00:00');
        $this->actingAs($this->admin)->postJson('/api/deliveries', ['client_uuid' => (string) Str::uuid(), 'fuel_tank_id' => $this->tank->id,
            'quantity_l' => '1000', 'supplier' => 'Fournisseur test', 'delivery_note_number' => 'BL-77'])->assertCreated();
        [$d265, $d222] = $this->recordFieldVouchers();

        $p = ReportPeriod::fromRequest(['period' => 'mois', 'month' => '2026-11']); // 27/10 → 26/11
        $this->assertSame('2026-10-27', $p->from->format('Y-m-d'));
        $this->assertSame('2026-11-26', $p->to->format('Y-m-d'));

        $book = app(TankReportExporter::class)->tanksWorkbook(FuelTank::where('id', $this->tank->id)->with('site')->get(), $p, 'Test');
        $this->assertSame(['Synthèse', '85751A55', 'Anomalies'], $book->getSheetNames());
        $ws = $book->getSheetByName('85751A55');

        // En-têtes identiques au modèle
        $this->assertSame('ENTREE', $ws->getCell('B5')->getValue());
        $this->assertSame('SORTIES', $ws->getCell('D5')->getValue());
        $this->assertSame(['SERIE DEPART', 'SERIE FIN', 'STOCK REEL'], [$ws->getCell('K5')->getValue(), $ws->getCell('L5')->getValue(), $ws->getCell('M5')->getValue()]);
        $this->assertSame(['Date', 'Qte', 'Fournisseur', 'N° DE BON', 'Heure', 'Code', 'Immatriculation', 'Kilometrage', 'Qte', 'Remarque'],
            $ws->rangeToArray('A6:J6')[0]);
        $this->assertContains('D5:J5', array_keys($ws->getMergeCells()));
        $this->assertSame('A7', $ws->getFreezePane());

        // Ligne 7 : ouverture au 27/10 = 0 (stock initial posé le 01/11, dans la période) ;
        // puis stock initial, livraison, D265, D222
        $this->assertEquals(0, $ws->getCell('M7')->getValue());
        $this->assertSame('STOCK INITIAL', $ws->getCell('C8')->getValue());
        $this->assertEquals(3000, $ws->getCell('B8')->getValue());
        $this->assertSame('Fournisseur test', $ws->getCell('C9')->getValue());
        $this->assertEquals(1000, $ws->getCell('B9')->getValue());
        $this->assertSame(['D265', 'D222'], [$ws->getCell('F10')->getValue(), $ws->getCell('F11')->getValue()]);
        $this->assertEquals(1913, $ws->getCell('D11')->getValue());
        $this->assertSame('CF9SB099805EH1731', $ws->getCell('G11')->getValue());
        $this->assertEquals(3808, $ws->getCell('H11')->getValue());
        $this->assertEquals(227, $ws->getCell('I11')->getValue());
        $this->assertEquals(664508, $ws->getCell('K11')->getValue());
        $this->assertEquals(664735, $ws->getCell('L11')->getValue());
        $this->assertStringContainsString('Bon papier 0075952', $ws->getCell('J11')->getValue());
        $this->assertSame('=M10+B11-I11', $ws->getCell('M11')->getValue());

        // Formules recalculées = stock de la citerne (3000 + 1000 − 164 − 227)
        Calculation::getInstance($book)->clearCalculationCache();
        $this->assertEquals(3609, $ws->getCell('M11')->getCalculatedValue());
        $this->assertSame('3609.00', (string) FuelTank::find($this->tank->id)->current_stock_l);

        // Période démarrant après le stock initial : ouverture = solde à cette date
        $p2 = ReportPeriod::fromRequest(['period' => 'jour', 'date' => '2026-11-07']);
        $ws2 = app(TankReportExporter::class)->tanksWorkbook(FuelTank::where('id', $this->tank->id)->with('site')->get(), $p2, 'J')->getSheetByName('85751A55');
        $this->assertEquals(4000, $ws2->getCell('M7')->getValue());

        $sum = $book->getSheetByName('Synthèse');
        $this->assertEquals(3609, $sum->getCell('G5')->getValue());
        $this->assertEquals(2, $sum->getCell('H5')->getValue());

        $this->assertSame(0, Artisan::call('fuel:verify-stock'));
    }

    public function test_cancelled_voucher_appears_with_compensation(): void
    {
        [$d265] = $this->recordFieldVouchers();
        $this->at('2026-11-07 12:00:00');
        $this->actingAs($this->admin)->postJson("/api/refuels/{$d265['id']}/cancel", ['reason' => 'Doublon papier'])->assertOk();

        $p = ReportPeriod::fromRequest(['period' => 'jour', 'date' => '2026-11-07']);
        $book = app(TankReportExporter::class)->tanksWorkbook(FuelTank::where('id', $this->tank->id)->with('site')->get(), $p, 'Test');
        $ws = $book->getSheetByName('85751A55');
        $this->assertEquals(-164, $ws->getCell('I10')->getValue());
        $this->assertStringContainsString('ANNULATION', $ws->getCell('J10')->getValue());
        $this->assertEquals(2773, $ws->getCell('M10')->getCalculatedValue());
        $this->assertSame(0, Artisan::call('fuel:verify-stock'));
    }

    public function test_export_endpoint_downloads_xlsx(): void
    {
        $this->recordFieldVouchers();
        $res = $this->actingAs($this->admin)->get("/api/reports/export?scope=citerne&fuel_tank_id={$this->tank->id}&period=periode&from=2026-11-01&to=2026-11-07");
        $res->assertOk();
        $this->assertStringContainsString('rapport-citerne-85751A55-20261101-20261107.xlsx', $res->headers->get('content-disposition'));
        $this->actingAs($this->admin)->get("/api/reports/export?scope=vehicule&vehicle_id={$this->d222->id}&period=mois&month=2026-11")->assertOk();
        $this->actingAs($this->admin)->get('/api/reports/export?scope=global&period=semaine&date=2026-11-07')->assertOk();
    }
}
