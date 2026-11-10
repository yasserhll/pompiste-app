<?php

namespace Tests\Feature\Fuel;

use App\Models\Fuel\FuelAnomaly;
use App\Models\Fuel\FuelAttachment;
use App\Models\Fuel\FuelRefuel;
use App\Models\Fuel\FuelStockMovement;
use App\Models\Fuel\FuelTank;
use App\Services\Fuel\QrCodeService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class RefuelFlowTest extends FuelTestCase
{
    // 1. Scan d'un QR code valide
    public function test_scan_valid_qr_returns_vehicle_card(): void
    {
        $qr = $this->qrFor($this->d222);
        $res = $this->actingAs($this->pompiste)->postJson('/api/scan', ['fuel_tank_id' => $this->tank->id, 'qr' => $qr->payload()])
            ->assertOk();
        $res->assertJsonPath('vehicle.code_parc', 'D222')
            ->assertJsonPath('vehicle.immatriculation', 'CF9SB099805EH1731')
            ->assertJsonPath('vehicle.counter_unit', 'h')
            ->assertJsonPath('identified_by', 'qr')
            ->assertJsonPath('dispenser.expected_index_start', '664344.00');
        $this->assertStringNotContainsString('D222', $qr->payload(), 'Le QR ne doit contenir aucune donnée du véhicule');
    }

    // 2. QR inconnu ou désactivé
    public function test_unknown_or_revoked_qr_is_rejected(): void
    {
        $this->actingAs($this->pompiste)->postJson('/api/scan', ['fuel_tank_id' => $this->tank->id, 'qr' => Str::random(40)])
            ->assertStatus(422)->assertJsonValidationErrors('qr');

        $qr = $this->qrFor($this->d222);
        app(QrCodeService::class)->revokeActive($this->admin, $this->d222, 'Étiquette perdue');
        $this->actingAs($this->pompiste)->postJson('/api/scan', ['fuel_tank_id' => $this->tank->id, 'qr' => $qr->payload()])
            ->assertStatus(422)->assertJsonFragment(['Ce QR code a été désactivé (Étiquette perdue). Utiliser la recherche manuelle et signaler l\'étiquette.']);
    }

    // 3. Bon conducteur selon le shift (y compris shift de nuit qui traverse minuit)
    public function test_driver_is_proposed_according_to_shift(): void
    {
        $scan = fn () => $this->actingAs($this->pompiste)->postJson('/api/scan', ['fuel_tank_id' => $this->tank->id, 'vehicle_id' => $this->d222->id])->assertOk();

        $this->at('2026-11-07 10:00:00');
        $scan()->assertJsonPath('driver.name', 'AHMED TEST')->assertJsonPath('shift.code', 'matin')->assertJsonPath('work_date', '2026-11-07');

        $this->at('2026-11-07 21:30:00');
        $scan()->assertJsonPath('driver.name', 'YOUSSEF TEST')->assertJsonPath('shift.code', 'soir');

        // 02:00 le 08/11 → shift du soir de la journée du 07/11
        $this->at('2026-11-08 02:00:00');
        $scan()->assertJsonPath('driver.name', 'YOUSSEF TEST')->assertJsonPath('work_date', '2026-11-07');
    }

    public function test_replacement_driver_takes_precedence_and_overlap_is_ambiguous(): void
    {
        $remp = \App\Models\Driver::findOrCreateByName('REMPLACANT TEST');
        \App\Models\DriverAssignment::create(['vehicle_id' => $this->d222->id, 'driver_id' => $remp->id, 'team_slot' => 1,
            'starts_on' => '2026-11-07', 'ends_on' => '2026-11-07', 'is_replacement' => true]);
        $this->actingAs($this->pompiste)->postJson('/api/scan', ['fuel_tank_id' => $this->tank->id, 'vehicle_id' => $this->d222->id])
            ->assertJsonPath('driver.name', 'REMPLACANT TEST');

        // Deux titulaires différents, même date de début : ambigu → sélection obligatoire
        \App\Models\DriverAssignment::where('is_replacement', true)->delete();
        \App\Models\DriverAssignment::create(['vehicle_id' => $this->d222->id, 'driver_id' => $remp->id, 'team_slot' => 1, 'starts_on' => '2026-10-26']);
        $res = $this->actingAs($this->pompiste)->postJson('/api/refuels/preview', $this->refuelPayload($this->d222, '664344', '664500'))->assertOk();
        $res->assertJsonPath('assignment_status', 'ambigu')->assertJsonPath('can_submit', false);
        $this->assertCount(3, $res->json('candidates'));
    }

    // 4, 5, 6, 8. Bons D222 (227 L) et D265 (164 L), déduction du stock, numérotation
    public function test_field_vouchers_d222_and_d265(): void
    {
        [$d265, $d222] = $this->recordFieldVouchers();

        $this->assertSame('164.00', $d265['quantity_l']);
        $this->assertSame('227.00', $d222['quantity_l']);
        $this->assertSame('664508.00', $d222['index_start']);
        $this->assertSame('664735.00', $d222['index_end']);
        $this->assertSame('3808.00', $d222['counter_value']);
        $this->assertSame('h', $d222['counter_unit']);
        $this->assertSame('85751A55-001912', $d265['voucher_number']);
        $this->assertSame('85751A55-001913', $d222['voucher_number']);
        $this->assertSame('0075952', $d222['paper_voucher_number']);
        $this->assertSame('AHMED TEST', $d222['driver_name']);
        $this->assertSame('Matin', $d222['shift_name']);
        $this->assertSame('Pompiste Louta', $d222['pump_attendant_name']);
        $this->assertSame('2026-11-07T10:40:00+01:00', $d222['refueled_at']);

        $tank = FuelTank::find($this->tank->id);
        $this->assertSame('2609.00', (string) $tank->current_stock_l); // 3000 − 164 − 227
        $this->assertSame('664735.00', (string) $tank->dispensers()->first()->current_index);
        $this->assertSame('2000.00', (string) FuelTank::find($this->otherTank->id)->current_stock_l, 'Citernes indépendantes');

        $this->actingAs($this->pompiste)->get("/api/refuels/{$d222['id']}/voucher")->assertOk()->assertHeader('content-type', 'application/pdf');
    }

    // Historique figé : changer l'affectation ne modifie pas un ancien bon
    public function test_snapshot_is_frozen(): void
    {
        [, $d222] = $this->recordFieldVouchers();
        \App\Models\DriverAssignment::query()->update(['ends_on' => '2026-11-07']);
        $this->d222->update(['code_parc' => 'D222-BIS', 'immatriculation' => 'NOUVELLE']);
        $this->ahmed->update(['name' => 'AUTRE NOM']);

        $f = FuelRefuel::find($d222['id']);
        $this->assertSame('D222', $f->vehicle_code);
        $this->assertSame('CF9SB099805EH1731', $f->vehicle_immatriculation);
        $this->assertSame('AHMED TEST', $f->driver_name);
        $this->assertSame('AHMED TEST', $f->snapshot['driver']['name']);
    }

    // 7. Photos rattachées au bon, stockage privé, accès contrôlé
    public function test_photos_are_attached_and_protected(): void
    {
        Storage::fake('local');
        $id1 = $this->actingAs($this->pompiste)->post('/api/attachments', ['file' => UploadedFile::fake()->image('bon.jpg'), 'kind' => 'bon_papier'],
            ['Accept' => 'application/json'])->assertCreated()->json('id');
        $id2 = $this->actingAs($this->pompiste)->post('/api/attachments', ['file' => UploadedFile::fake()->image('compteur.jpg')],
            ['Accept' => 'application/json'])->assertCreated()->json('id');

        $refuel = $this->actingAs($this->pompiste)->postJson('/api/refuels', $this->refuelPayload($this->d222, '664344', '664571', [
            'counter_value' => '3808', 'attachment_ids' => [$id1, $id2],
        ]))->assertCreated()->json('refuel');

        $this->assertCount(2, $refuel['attachments']);
        $this->assertArrayNotHasKey('path', $refuel['attachments'][0]);
        $this->actingAs($this->pompiste)->get("/api/attachments/$id1")->assertOk();

        // Un pompiste d'un autre site ne voit pas le justificatif
        $intrus = \App\Models\User::factory()->create(['role' => 'pompiste']);
        $intrus->fuelTanks()->attach($this->otherTank->id);
        $this->actingAs($intrus)->getJson("/api/attachments/$id1")->assertForbidden();

        // Une photo déjà rattachée ne peut pas être réutilisée
        $this->actingAs($this->pompiste)->postJson('/api/refuels', $this->refuelPayload($this->d265, '664571', '664600', [
            'attachment_ids' => [$id1], 'confirmed_warnings' => ['vehicule_sans_affectation', 'compteur_absent'],
        ]))->assertStatus(422)->assertJsonValidationErrors('attachment_ids');
        $this->assertSame(2, FuelAttachment::count());
    }

    // 10. Séries incohérentes : confirmation exigée puis anomalie enregistrée
    public function test_inconsistent_series_requires_confirmation_and_creates_anomaly(): void
    {
        $payload = $this->refuelPayload($this->d222, '664400', '664627', ['counter_value' => '3808']);
        $res = $this->actingAs($this->pompiste)->postJson('/api/refuels', $payload)->assertStatus(409);
        $this->assertContains('serie_incoherente', array_column($res->json('warnings'), 'code'));
        $this->assertSame(0, FuelRefuel::count());

        $payload['confirmed_warnings'] = ['serie_incoherente'];
        $refuel = $this->actingAs($this->pompiste)->postJson('/api/refuels', $payload)->assertCreated()->json('refuel');
        $this->assertTrue($refuel['has_anomaly']);
        $this->assertDatabaseHas('fuel_anomalies', ['type' => 'serie_incoherente', 'fuel_refuel_id' => $refuel['id'], 'severity' => 'critique']);

        // Série fin < série départ : refus
        $this->actingAs($this->pompiste)->postJson('/api/refuels', $this->refuelPayload($this->d222, '664627', '664600'))
            ->assertStatus(422);
    }

    public function test_counter_lower_than_previous_is_flagged(): void
    {
        $this->recordFieldVouchers();
        $this->at('2026-11-07 15:00:00');
        $res = $this->actingAs($this->pompiste)->postJson('/api/refuels/preview', $this->refuelPayload($this->d222, '664735', '664800', ['counter_value' => '3700']))
            ->assertOk();
        $codes = array_column($res->json('warnings'), 'code');
        $this->assertContains('compteur_en_baisse', $codes);
        $this->assertSame('3808.00', $res->json('previous_counter_value'));
    }

    // 11. Stock insuffisant
    public function test_insufficient_stock_is_refused(): void
    {
        $this->actingAs($this->pompiste)->postJson('/api/refuels', $this->refuelPayload($this->d222, '664344', '667500', [
            'counter_value' => '3808', 'confirmed_warnings' => ['quantite_elevee'],
        ]))->assertStatus(422);
        $this->assertSame('3000.00', (string) FuelTank::find($this->tank->id)->current_stock_l);
        $this->assertSame(0, FuelStockMovement::where('type', 'sortie')->count());
    }

    // 12 & 16. Double clic / renvoi après coupure réseau : un seul bon
    public function test_double_submit_creates_a_single_voucher(): void
    {
        $payload = $this->refuelPayload($this->d222, '664344', '664571', ['counter_value' => '3808']);
        $first = $this->actingAs($this->pompiste)->postJson('/api/refuels', $payload)->assertCreated();
        $second = $this->actingAs($this->pompiste)->postJson('/api/refuels', $payload)->assertOk();

        $this->assertTrue($second->json('replayed'));
        $this->assertSame($first->json('refuel.id'), $second->json('refuel.id'));
        $this->assertSame(1, FuelRefuel::count());
        $this->assertSame('2773.00', (string) FuelTank::find($this->tank->id)->current_stock_l);
    }

    // 13. Deux pompistes sur le même compteur : le second voit la nouvelle série attendue
    public function test_two_pump_attendants_on_same_dispenser(): void
    {
        // Les deux ont scanné quand la série attendue était 664344
        $a = $this->refuelPayload($this->d222, '664344', '664571', ['counter_value' => '3808']);
        $b = $this->refuelPayload($this->d265, '664344', '664508', ['counter_value' => '834', 'confirmed_warnings' => ['vehicule_sans_affectation']]);

        $this->actingAs($this->pompiste)->postJson('/api/refuels', $a)->assertCreated();
        $res = $this->actingAs($this->pompiste2)->postJson('/api/refuels', $b)->assertStatus(409);
        $w = collect($res->json('warnings'))->firstWhere('code', 'serie_incoherente');
        $this->assertSame('664571.00', $w['data']['expected']);
        $this->assertSame(1, FuelRefuel::count());
        $this->assertSame('2773.00', (string) FuelTank::find($this->tank->id)->current_stock_l);
    }

    // 14. Véhicule sans affectation
    public function test_vehicle_without_assignment(): void
    {
        $res = $this->actingAs($this->pompiste)->postJson('/api/scan', ['fuel_tank_id' => $this->tank->id, 'vehicle_id' => $this->d265->id])->assertOk();
        $res->assertJsonPath('assignment_status', 'aucune')->assertJsonPath('driver', null);
        $this->assertContains('vehicule_sans_affectation', array_column($res->json('warnings'), 'code'));

        // Conducteur non affecté choisi : motif obligatoire
        $p = $this->refuelPayload($this->d265, '664344', '664508', ['counter_value' => '834', 'driver_id' => $this->youssef->id]);
        $this->actingAs($this->pompiste)->postJson('/api/refuels', $p + ['confirmed_warnings' => ['vehicule_sans_affectation']])->assertStatus(422);
        $p['driver_reason'] = 'Remplacement exceptionnel';
        $p['confirmed_warnings'] = ['vehicule_sans_affectation', 'conducteur_non_affecte'];
        $this->actingAs($this->pompiste)->postJson('/api/refuels', $p)->assertCreated()->assertJsonPath('refuel.driver_name', 'YOUSSEF TEST');
        $this->assertDatabaseHas('fuel_anomalies', ['type' => 'conducteur_non_affecte']);
    }

    // 15. Correction et annulation auditées avec mouvements compensatoires
    public function test_correction_and_cancellation(): void
    {
        [$d265, $d222] = $this->recordFieldVouchers();

        // Demande de correction par le pompiste, approuvée par l'admin
        $req = $this->actingAs($this->pompiste)->postJson("/api/refuels/{$d222['id']}/corrections", [
            'kind' => 'correction', 'reason' => 'Compteur mal recopié', 'changes' => ['counter_value' => '3818'],
        ])->assertCreated()->json();
        $this->actingAs($this->pompiste)->postJson("/api/corrections/{$req['id']}/review", ['approve' => true])->assertForbidden();
        $done = $this->actingAs($this->admin)->postJson("/api/corrections/{$req['id']}/review", ['approve' => true])->assertOk()->json();

        $orig = FuelRefuel::find($d222['id']);
        $new = FuelRefuel::find($done['replacement_refuel_id']);
        $this->assertSame('annule', $orig->status);
        $this->assertSame('3818.00', (string) $new->counter_value);
        $this->assertSame('227.00', (string) $new->quantity_l);
        $this->assertSame($orig->id, $new->corrects_refuel_id);
        $this->assertSame('2609.00', (string) FuelTank::find($this->tank->id)->current_stock_l, 'Correction sans changement de quantité : stock inchangé');

        // Annulation directe du bon D265
        $this->actingAs($this->pompiste)->postJson("/api/refuels/{$d265['id']}/cancel", ['reason' => 'Erreur de saisie'])->assertForbidden();
        $this->actingAs($this->admin)->postJson("/api/refuels/{$d265['id']}/cancel", ['reason' => 'Erreur de saisie'])->assertOk();
        $this->assertSame('2773.00', (string) FuelTank::find($this->tank->id)->current_stock_l);
        $this->assertDatabaseHas('fuel_audit_logs', ['action' => 'ravitaillement.annule', 'auditable_id' => $d265['id']]);
        $this->assertDatabaseHas('fuel_audit_logs', ['action' => 'ravitaillement.corrige', 'auditable_id' => $new->id]);

        // Un bon validé n'est jamais modifiable directement : pas de route PUT/DELETE
        $this->actingAs($this->admin)->putJson("/api/refuels/{$d265['id']}", ['quantity_l' => 1])->assertStatus(405);
        $this->actingAs($this->admin)->deleteJson("/api/refuels/{$d265['id']}")->assertStatus(405);
    }

    // 17. Accès non autorisé à un autre site
    public function test_access_to_other_site_is_forbidden(): void
    {
        [, $d222] = $this->recordFieldVouchers();
        $intrus = \App\Models\User::factory()->create(['role' => 'pompiste']);
        $intrus->fuelTanks()->attach($this->otherTank->id);

        $this->actingAs($intrus)->postJson('/api/refuels', $this->refuelPayload($this->d222, '664735', '664800'))->assertForbidden();
        $this->actingAs($intrus)->getJson("/api/refuels/{$d222['id']}")->assertNotFound();
        $this->actingAs($intrus)->getJson('/api/refuels')->assertOk()->assertJsonPath('total', 0);
        $this->actingAs($intrus)->getJson("/api/tanks/{$this->tank->id}")->assertForbidden();
        $this->actingAs($intrus)->getJson('/api/reports/export?scope=global&period=mois&month=2026-11')->assertForbidden();

        $resp = \App\Models\User::factory()->create(['role' => 'responsable_site']);
        $resp->sites()->attach($this->mzinda->id);
        $this->actingAs($resp)->getJson("/api/reports/export?scope=citerne&fuel_tank_id={$this->tank->id}&period=mois&month=2026-11")->assertForbidden();
        $this->actingAs($resp)->getJson('/api/tanks')->assertOk()->assertJsonCount(1)->assertJsonPath('0.code', '84246A55');

        // Un pompiste ne voit que ses propres bons
        $this->actingAs($this->pompiste2)->getJson('/api/refuels')->assertOk()->assertJsonPath('total', 0);
    }

    public function test_deliveries_and_inventory_with_adjustment(): void
    {
        $uuid = (string) Str::uuid();
        $payload = ['client_uuid' => $uuid, 'fuel_tank_id' => $this->tank->id, 'quantity_l' => '1500', 'supplier' => 'Fournisseur test',
            'delivery_note_number' => 'BL-1'];
        $this->actingAs($this->pompiste)->postJson('/api/deliveries', $payload)->assertForbidden(); // paramètre désactivé par défaut
        $this->actingAs($this->admin)->postJson('/api/deliveries', $payload)->assertCreated();
        $this->actingAs($this->admin)->postJson('/api/deliveries', $payload)->assertOk()->assertJsonPath('replayed', true);
        $this->assertSame('4500.00', (string) FuelTank::find($this->tank->id)->current_stock_l);

        // Dépassement de capacité : confirmation
        $this->actingAs($this->admin)->postJson('/api/deliveries', array_merge($payload, ['client_uuid' => (string) Str::uuid(), 'quantity_l' => '800']))
            ->assertStatus(409);

        // Inventaire : la mesure ne modifie pas le stock tant qu'elle n'est pas approuvée avec ajustement
        $inv = $this->actingAs($this->pompiste)->postJson('/api/inventories', ['client_uuid' => (string) Str::uuid(),
            'fuel_tank_id' => $this->tank->id, 'measured_quantity_l' => '4480', 'method' => 'jauge'])->assertCreated()->json();
        $this->assertSame('-20.00', $inv['difference_l']);
        $this->assertSame('4500.00', (string) FuelTank::find($this->tank->id)->current_stock_l);
        $this->actingAs($this->admin)->postJson("/api/inventories/{$inv['id']}/review", ['approve' => true, 'create_adjustment' => true])->assertOk();
        $this->assertSame('4480.00', (string) FuelTank::find($this->tank->id)->current_stock_l);

        $tank = $this->actingAs($this->admin)->getJson("/api/tanks/{$this->tank->id}")->assertOk();
        $tank->assertJsonPath('total_entries_l', '1500.00')->assertJsonPath('total_adjustments_l', '-20.00')
            ->assertJsonPath('theoretical_stock_l', '4480.00')->assertJsonPath('journal_ok', true)
            ->assertJsonPath('last_inventory.measured_l', '4480.00');
    }

    public function test_low_stock_creates_alert(): void
    {
        $this->tank->update(['low_stock_threshold_l' => 2700]);
        $this->recordFieldVouchers();
        $this->assertDatabaseHas('fuel_anomalies', ['type' => 'stock_faible', 'fuel_tank_id' => $this->tank->id, 'status' => 'ouverte']);
        $this->assertSame(1, FuelAnomaly::where('type', 'stock_faible')->count(), 'Une seule alerte ouverte par citerne');
    }
}
