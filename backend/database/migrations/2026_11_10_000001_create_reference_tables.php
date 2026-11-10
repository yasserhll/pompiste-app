<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Référentiel structuré (sites, véhicules, conducteurs, shifts, affectations datées).
// Les tables historiques (affectations, matricule_entries…) ne sont pas modifiées :
// elles restent la source des écrans existants et servent de source d'import.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sites', function (Blueprint $table) {
            $table->id();
            $table->string('code', 50)->unique();          // LOUTA, LOUTA-JET, MZINDA…
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('vehicles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->nullable()->constrained('sites')->nullOnDelete();
            $table->string('code_parc', 50)->index();       // D222, E81… (non unique : TRSP, DACIA…)
            $table->string('immatriculation', 50)->unique();
            $table->string('chassis', 50)->nullable()->index();
            $table->string('type_label', 100)->nullable();  // libellé brut : 8*4 50T, PELLE 336…
            $table->enum('category', ['camion', 'engin', 'vehicule_leger', 'citerne', 'autre'])->default('camion');
            $table->enum('counter_unit', ['km', 'h'])->default('km');
            $table->decimal('tank_capacity_l', 10, 2)->nullable(); // réservoir du véhicule, pour le contrôle
            $table->enum('status', ['actif', 'en_panne', 'inactif'])->default('actif');
            $table->string('status_note')->nullable();
            $table->timestamps();
        });

        Schema::create('drivers', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('name_key')->unique();           // nom normalisé (majuscules, espaces simples)
            $table->string('matricule', 50)->nullable();
            $table->string('phone', 30)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // Horaires configurables. site_id NULL = horaires par défaut de tous les sites.
        Schema::create('work_shifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->nullable()->constrained('sites')->cascadeOnDelete();
            $table->string('code', 20);                     // matin | soir
            $table->string('name');
            $table->unsignedTinyInteger('team_slot');       // 1 = équipe 1, 2 = équipe 2 (colonnes de l'affectation)
            $table->time('start_time');
            $table->time('end_time');                       // end < start ⇒ le shift traverse minuit
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['site_id', 'code']);
        });

        Schema::create('driver_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vehicle_id')->constrained('vehicles')->cascadeOnDelete();
            $table->foreignId('driver_id')->constrained('drivers')->restrictOnDelete();
            $table->unsignedTinyInteger('team_slot');       // 1 / 2 → shift via work_shifts.team_slot
            $table->foreignId('site_id')->nullable()->constrained('sites')->nullOnDelete();
            $table->date('starts_on');
            $table->date('ends_on')->nullable();            // NULL = toujours en cours
            $table->boolean('is_replacement')->default(false);
            $table->string('source', 30)->default('manuel'); // manuel | import_affectations
            $table->unsignedBigInteger('legacy_affectation_id')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['vehicle_id', 'team_slot', 'starts_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('driver_assignments');
        Schema::dropIfExists('work_shifts');
        Schema::dropIfExists('drivers');
        Schema::dropIfExists('vehicles');
        Schema::dropIfExists('sites');
    }
};
