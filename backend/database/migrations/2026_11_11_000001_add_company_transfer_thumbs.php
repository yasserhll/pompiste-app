<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// D'après les bons papier (0075951, 0075952) et les fichiers « Citerne LOUTA 1/2 » :
//  - société du véhicule cochée sur le bon : TRANSWIN / LAHLAL / LEL / AUTRES (+ CIN du conducteur si autres) ;
//  - une citerne fixe ravitaille les citernes mobiles : la sortie de l'une est une entrée de l'autre (transfert) ;
//  - miniatures des justificatifs pour les afficher à côté de chaque sortie.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vehicles', function (Blueprint $table) {
            $table->string('owner_company', 60)->nullable()->after('type_label'); // société propriétaire / sous-traitant
        });

        Schema::table('fuel_refuels', function (Blueprint $table) {
            $table->string('company', 60)->nullable()->after('paper_voucher_number');
            $table->string('external_driver_name')->nullable()->after('driver_name');
            $table->string('external_driver_cin', 30)->nullable()->after('external_driver_name');
            $table->enum('purpose', ['consommation', 'transfert'])->default('consommation')->after('fuel_dispenser_id');
            $table->foreignId('transfer_to_tank_id')->nullable()->after('purpose')->constrained('fuel_tanks')->nullOnDelete();
        });

        Schema::table('fuel_attachments', function (Blueprint $table) {
            $table->string('thumb_path')->nullable()->after('path');
        });

        // Nouveau type de mouvement : entrée par transfert depuis une autre citerne
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE fuel_stock_movements MODIFY type ENUM('stock_initial','entree','transfert_entree','sortie','ajustement','annulation_sortie','annulation_entree') NOT NULL");
        } else {
            Schema::table('fuel_stock_movements', function (Blueprint $table) {
                $table->string('type', 30)->change();
            });
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE fuel_stock_movements MODIFY type ENUM('stock_initial','entree','sortie','ajustement','annulation_sortie','annulation_entree') NOT NULL");
        }
        Schema::table('fuel_attachments', fn (Blueprint $t) => $t->dropColumn('thumb_path'));
        Schema::table('fuel_refuels', function (Blueprint $table) {
            $table->dropConstrainedForeignId('transfer_to_tank_id');
            $table->dropColumn(['company', 'external_driver_name', 'external_driver_cin', 'purpose']);
        });
        Schema::table('vehicles', fn (Blueprint $t) => $t->dropColumn('owner_company'));
    }
};
