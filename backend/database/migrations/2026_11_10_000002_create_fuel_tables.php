<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Module gasoil. Les litres, index et compteurs sont en DECIMAL (jamais en float).
// Le stock d'une citerne n'évolue QUE par fuel_stock_movements (journal append-only).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->enum('role', ['admin', 'responsable_site', 'pompiste'])->default('pompiste')->after('email');
            $table->boolean('is_active')->default(true)->after('role');
        });

        Schema::create('fuel_tanks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->constrained('sites')->restrictOnDelete();
            $table->foreignId('vehicle_id')->nullable()->constrained('vehicles')->nullOnDelete(); // citerne mobile = camion
            $table->string('code', 50)->unique();           // 85751A55, LOUTA1…
            $table->string('name');
            $table->enum('kind', ['fixe', 'mobile'])->default('fixe');
            $table->decimal('capacity_l', 12, 2);
            $table->decimal('initial_stock_l', 12, 2)->default(0);
            $table->dateTime('initial_stock_at')->nullable();
            $table->decimal('current_stock_l', 12, 2)->default(0); // cache du journal, mis à jour sous verrou
            $table->decimal('low_stock_threshold_l', 12, 2)->nullable();
            $table->boolean('allow_negative')->default(false);
            $table->unsignedInteger('last_voucher_seq')->default(0);
            $table->string('legacy_source', 20)->nullable(); // citerne_entries.source (historique Excel)
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // Compteur de distribution (pistolet / volucompteur) — les séries sont suivies ici.
        Schema::create('fuel_dispensers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fuel_tank_id')->constrained('fuel_tanks')->restrictOnDelete();
            $table->string('code', 50);
            $table->string('name');
            $table->decimal('current_index', 14, 2)->default(0); // dernière série fin validée
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['fuel_tank_id', 'code']);
        });

        // Remise à zéro / changement de compteur : rupture volontaire de la chaîne des séries.
        Schema::create('fuel_dispenser_resets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fuel_dispenser_id')->constrained('fuel_dispensers')->restrictOnDelete();
            $table->enum('kind', ['remise_a_zero', 'changement_compteur', 'correction_index']);
            $table->decimal('old_index', 14, 2);
            $table->decimal('new_index', 14, 2);
            $table->string('reason', 500);
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->dateTime('occurred_at');
            $table->timestamps();
        });

        Schema::create('vehicle_qr_codes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vehicle_id')->constrained('vehicles')->cascadeOnDelete();
            $table->string('token', 64)->unique();          // aléatoire, ne contient aucune donnée
            $table->boolean('is_active')->default(true);
            $table->dateTime('revoked_at')->nullable();
            $table->foreignId('revoked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('revoke_reason')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['vehicle_id', 'is_active']);
        });

        Schema::create('fuel_deliveries', function (Blueprint $table) {
            $table->id();
            $table->uuid('client_uuid')->unique();          // anti-doublon (double clic, renvoi réseau)
            $table->foreignId('fuel_tank_id')->constrained('fuel_tanks')->restrictOnDelete();
            $table->dateTime('delivered_at');
            $table->decimal('quantity_l', 12, 2);
            $table->string('supplier')->nullable();
            $table->string('delivery_note_number', 100)->nullable();
            $table->string('delivery_reference', 100)->nullable();
            $table->string('remark', 500)->nullable();
            $table->enum('status', ['valide', 'annule'])->default('valide');
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->dateTime('cancelled_at')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('cancel_reason', 500)->nullable();
            $table->timestamps();
            $table->index(['fuel_tank_id', 'delivered_at']);
        });

        Schema::create('fuel_refuels', function (Blueprint $table) {
            $table->id();
            $table->uuid('client_uuid')->unique();
            $table->string('voucher_number', 40)->unique(); // 85751A55-000177
            $table->unsignedInteger('voucher_seq');
            $table->string('paper_voucher_number', 50)->nullable()->index();
            $table->foreignId('fuel_tank_id')->constrained('fuel_tanks')->restrictOnDelete();
            $table->foreignId('fuel_dispenser_id')->constrained('fuel_dispensers')->restrictOnDelete();
            $table->foreignId('vehicle_id')->constrained('vehicles')->restrictOnDelete();
            $table->foreignId('driver_id')->nullable()->constrained('drivers')->nullOnDelete();
            $table->foreignId('driver_assignment_id')->nullable()->constrained('driver_assignments')->nullOnDelete();
            $table->foreignId('work_shift_id')->nullable()->constrained('work_shifts')->nullOnDelete();
            $table->foreignId('site_id')->constrained('sites')->restrictOnDelete(); // site de la citerne
            $table->foreignId('pump_attendant_id')->constrained('users')->restrictOnDelete();
            $table->dateTime('refueled_at');                // heure serveur, Africa/Casablanca
            $table->date('work_date');                      // date de la journée de travail (shift de nuit)

            // Instantané figé au moment de l'opération (ne suit pas les modifications ultérieures)
            $table->string('vehicle_code', 50);
            $table->string('vehicle_immatriculation', 50);
            $table->string('vehicle_type', 100)->nullable();
            $table->string('vehicle_category', 30);
            $table->string('driver_name')->nullable();
            $table->string('shift_name')->nullable();
            $table->string('site_name');
            $table->string('pump_attendant_name');
            $table->json('snapshot');

            $table->decimal('index_start', 14, 2);
            $table->decimal('index_end', 14, 2);
            $table->decimal('quantity_l', 12, 2);           // = index_end − index_start (sauf correction autorisée)
            $table->decimal('declared_quantity_l', 12, 2)->nullable();
            $table->decimal('expected_index_start', 14, 2)->nullable();
            $table->decimal('counter_value', 14, 2)->nullable();
            $table->enum('counter_unit', ['km', 'h']);
            $table->decimal('previous_counter_value', 14, 2)->nullable();
            $table->decimal('stock_before_l', 12, 2);
            $table->decimal('stock_after_l', 12, 2);
            $table->string('remark', 500)->nullable();

            $table->enum('status', ['valide', 'annule'])->default('valide');
            $table->boolean('has_anomaly')->default(false);
            $table->foreignId('corrects_refuel_id')->nullable()->constrained('fuel_refuels')->nullOnDelete();
            $table->dateTime('cancelled_at')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('cancel_reason', 500)->nullable();
            $table->timestamps();

            $table->unique(['fuel_tank_id', 'voucher_seq']);
            $table->index(['fuel_tank_id', 'refueled_at']);
            $table->index(['vehicle_id', 'refueled_at']);
            $table->index(['site_id', 'work_date']);
        });

        Schema::create('fuel_stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fuel_tank_id')->constrained('fuel_tanks')->restrictOnDelete();
            $table->enum('type', ['stock_initial', 'entree', 'sortie', 'ajustement', 'annulation_sortie', 'annulation_entree']);
            $table->decimal('quantity_l', 12, 2);           // signé : + entre dans la citerne, − en sort
            $table->decimal('balance_after_l', 12, 2);
            $table->dateTime('occurred_at');
            $table->nullableMorphs('source');               // FuelRefuel, FuelDelivery, FuelAdjustment…
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('note', 500)->nullable();
            $table->timestamps();
            $table->index(['fuel_tank_id', 'occurred_at']);
        });

        Schema::create('fuel_inventories', function (Blueprint $table) {
            $table->id();
            $table->uuid('client_uuid')->unique();
            $table->foreignId('fuel_tank_id')->constrained('fuel_tanks')->restrictOnDelete();
            $table->dateTime('measured_at');
            $table->decimal('measured_quantity_l', 12, 2);  // mesure physique (jauge, pige…)
            $table->decimal('theoretical_quantity_l', 12, 2); // stock théorique au moment de la mesure
            $table->decimal('difference_l', 12, 2);         // mesuré − théorique
            $table->string('method', 50)->nullable();
            $table->string('note', 500)->nullable();
            $table->enum('status', ['en_attente', 'approuve', 'rejete'])->default('en_attente');
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('reviewed_at')->nullable();
            $table->string('review_note', 500)->nullable();
            $table->timestamps();
        });

        Schema::create('fuel_adjustments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fuel_tank_id')->constrained('fuel_tanks')->restrictOnDelete();
            $table->foreignId('fuel_inventory_id')->nullable()->constrained('fuel_inventories')->nullOnDelete();
            $table->decimal('quantity_l', 12, 2);           // signé
            $table->string('reason', 500);
            $table->dateTime('effective_at');
            $table->enum('status', ['en_attente', 'approuve', 'rejete'])->default('en_attente');
            $table->foreignId('requested_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('reviewed_at')->nullable();
            $table->string('review_note', 500)->nullable();
            $table->timestamps();
        });

        // Demande de correction / annulation d'un bon validé (le bon n'est jamais modifié en place).
        Schema::create('fuel_correction_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fuel_refuel_id')->constrained('fuel_refuels')->restrictOnDelete();
            $table->enum('kind', ['annulation', 'correction']);
            $table->json('proposed_changes')->nullable();   // champs corrigés (correction)
            $table->string('reason', 500);
            $table->enum('status', ['en_attente', 'approuve', 'rejete'])->default('en_attente');
            $table->foreignId('requested_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('reviewed_at')->nullable();
            $table->string('review_note', 500)->nullable();
            $table->foreignId('replacement_refuel_id')->nullable()->constrained('fuel_refuels')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('fuel_attachments', function (Blueprint $table) {
            $table->id();
            $table->nullableMorphs('attachable');           // NULL tant que le bon n'est pas validé
            $table->string('kind', 30)->default('photo');   // bon_papier | photo | bon_livraison | autre
            $table->string('disk', 20)->default('local');   // disque privé, jamais public
            $table->string('path');
            $table->string('original_name')->nullable();
            $table->string('mime', 100);
            $table->unsignedInteger('size');
            $table->char('sha256', 64);
            $table->foreignId('uploaded_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('fuel_anomalies', function (Blueprint $table) {
            $table->id();
            $table->string('type', 50);                     // serie_incoherente, compteur_en_baisse…
            $table->enum('severity', ['info', 'alerte', 'critique'])->default('alerte');
            $table->foreignId('fuel_tank_id')->nullable()->constrained('fuel_tanks')->nullOnDelete();
            $table->foreignId('site_id')->nullable()->constrained('sites')->nullOnDelete();
            $table->foreignId('fuel_refuel_id')->nullable()->constrained('fuel_refuels')->nullOnDelete();
            $table->foreignId('vehicle_id')->nullable()->constrained('vehicles')->nullOnDelete();
            $table->string('message', 500);
            $table->json('data')->nullable();
            $table->enum('status', ['ouverte', 'traitee', 'ignoree'])->default('ouverte');
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('resolved_at')->nullable();
            $table->string('resolution_note', 500)->nullable();
            $table->timestamps();
            $table->index(['status', 'type']);
        });

        Schema::create('fuel_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 60);
            $table->nullableMorphs('auditable');
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->string('ip', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('fuel_settings', function (Blueprint $table) {
            $table->string('key', 80)->primary();
            $table->json('value');
            $table->timestamps();
        });

        // Périmètre des utilisateurs : sites (responsable, pompiste) et citernes (pompiste)
        Schema::create('site_user', function (Blueprint $table) {
            $table->foreignId('site_id')->constrained('sites')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->primary(['site_id', 'user_id']);
        });
        Schema::create('fuel_tank_user', function (Blueprint $table) {
            $table->foreignId('fuel_tank_id')->constrained('fuel_tanks')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->primary(['fuel_tank_id', 'user_id']);
        });
    }

    public function down(): void
    {
        foreach ([
            'fuel_tank_user', 'site_user', 'fuel_settings', 'fuel_audit_logs', 'fuel_anomalies',
            'fuel_attachments', 'fuel_correction_requests', 'fuel_adjustments', 'fuel_inventories',
            'fuel_stock_movements', 'fuel_refuels', 'fuel_deliveries', 'vehicle_qr_codes',
            'fuel_dispenser_resets', 'fuel_dispensers', 'fuel_tanks',
        ] as $t) {
            Schema::dropIfExists($t);
        }
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['role', 'is_active']);
        });
    }
};
