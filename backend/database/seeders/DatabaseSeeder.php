<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\WorkShift;
use Illuminate\Database\Seeder;

/**
 * Données de départ minimales (aucune donnée métier fictive) :
 *  - horaires par défaut des 2 shifts, à ajuster dans Paramètres > Shifts ;
 *  - compte administrateur défini par ADMIN_EMAIL / ADMIN_PASSWORD dans .env.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        WorkShift::firstOrCreate(['site_id' => null, 'code' => 'matin'],
            ['name' => 'Matin', 'team_slot' => 1, 'start_time' => '07:00', 'end_time' => '19:00']);
        WorkShift::firstOrCreate(['site_id' => null, 'code' => 'soir'],
            ['name' => 'Soir', 'team_slot' => 2, 'start_time' => '19:00', 'end_time' => '07:00']);

        $email = env('ADMIN_EMAIL');
        $password = env('ADMIN_PASSWORD');
        if ($email && $password) {
            User::firstOrCreate(['email' => $email], [
                'name' => env('ADMIN_NAME', 'Administrateur'),
                'password' => $password,
                'role' => 'admin',
            ]);
        } else {
            $this->command?->warn('ADMIN_EMAIL / ADMIN_PASSWORD absents du .env : aucun administrateur créé.');
        }
    }
}
