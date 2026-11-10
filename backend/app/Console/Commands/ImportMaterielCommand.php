<?php

namespace App\Console\Commands;

use App\Models\Site;
use App\Models\Vehicle;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * Import contrôlé du fichier « Affectation de materiels » (feuille principale + « Arrêt & panne »).
 *
 *  - Sites créés à partir de la colonne Site (MZINDA, Louta, Louta-Jet, Bouchane, Benguerir…).
 *  - Véhicules identifiés par l'immatriculation (le code de parc n'est pas unique : TRSP, DACIA…).
 *    Existant : mis à jour (code, châssis, type, site) ; jamais supprimé s'il est absent du fichier.
 *  - Feuille « Arrêt & panne » : statut en_panne + remarque.
 *  - Feuille « DEPLACEMENT » : listée pour information, non appliquée (sens du déplacement à confirmer).
 *
 *   php artisan fuel:import-materiel "C:\...\Affectation de materiels OCTOBRE guenteur.xlsx" --dry-run
 */
class ImportMaterielCommand extends Command
{
    protected $signature = 'fuel:import-materiel {file} {--sheet= : nom de la feuille principale (défaut : la première)} {--dry-run : afficher sans écrire}';

    protected $description = 'Importe les sites et véhicules depuis le fichier d\'affectation de matériels';

    public function handle(): int
    {
        $file = $this->argument('file');
        if (!is_file($file)) {
            $this->error("Fichier introuvable : $file");
            return self::FAILURE;
        }
        $reader = IOFactory::createReaderForFile($file);
        $reader->setReadDataOnly(true);
        $book = $reader->load($file);
        $main = $this->option('sheet') ? $book->getSheetByName($this->option('sheet')) : $book->getSheet(0);
        if (!$main) {
            $this->error('Feuille introuvable.');
            return self::FAILURE;
        }

        $rows = $this->rows($main, ['immatriculation', 'code parc', 'chassis', 'type', 'site']);
        $this->info(count($rows) . " lignes lues dans « {$main->getTitle()} ».");

        $seen = [];
        $conflicts = [];
        $vehicles = [];
        foreach ($rows as $line => $r) {
            $immat = $this->immat($r['immatriculation']);
            if ($immat === '' || trim((string) $r['code parc']) === '') {
                $conflicts[] = "ligne $line : immatriculation ou code de parc vide — ignorée";
                continue;
            }
            $v = [
                'immatriculation' => $immat,
                'code_parc' => $this->clean($r['code parc']),
                'chassis' => $this->clean($r['chassis']) ?: null,
                'type_label' => $this->clean($r['type']) ?: null,
                'site' => $this->clean($r['site']),
            ];
            if (isset($seen[$immat])) {
                if ($seen[$immat] != $v) $conflicts[] = "ligne $line : $immat présent plusieurs fois avec des valeurs différentes — première ligne conservée";
                continue;
            }
            $seen[$immat] = $v;
            $vehicles[] = $v;
        }

        $sites = collect($vehicles)->pluck('site')->filter()->unique(fn ($s) => mb_strtoupper($s))->values();
        $this->table(['Site', 'Véhicules'], $sites->map(fn ($s) => [$s, collect($vehicles)->filter(fn ($v) => mb_strtoupper($v['site']) === mb_strtoupper($s))->count()]));

        $breakdowns = [];
        if ($sheet = $this->findSheet($book, 'panne')) {
            foreach ($this->rows($sheet, ['code', 'matricule', 'remarque']) as $r) {
                $breakdowns[] = ['code' => $this->clean($r['code']), 'immat' => $this->immat($r['matricule']), 'note' => $this->clean($r['remarque']) ?: 'En panne'];
            }
        }
        if ($sheet = $this->findSheet($book, 'deplacement')) {
            $moves = $this->rows($sheet, ['immatriculation', 'code parc', 'deplacement'], true);
            if ($moves) {
                $this->warn(count($moves) . ' véhicule(s) dans « ' . $sheet->getTitle() . ' » — NON appliqué, à confirmer :');
                foreach ($moves as $m) $this->line("   {$this->clean($m['code parc'])} ({$this->immat($m['immatriculation'])}) → {$this->clean($m['deplacement'])}");
            }
        }
        foreach ($conflicts as $c) $this->warn($c);

        if ($this->option('dry-run')) {
            $this->info('Simulation : rien n\'a été écrit. ' . count($vehicles) . ' véhicules, ' . count($breakdowns) . ' en panne.');
            return self::SUCCESS;
        }

        $stats = ['sites' => 0, 'created' => 0, 'updated' => 0, 'unchanged' => 0, 'panne' => 0];
        DB::transaction(function () use ($vehicles, $breakdowns, &$stats) {
            $siteIds = [];
            foreach ($vehicles as $v) {
                $key = mb_strtoupper($v['site'] ?: 'SANS SITE');
                if (!isset($siteIds[$key])) {
                    $site = Site::firstOrCreate(['code' => $key], ['name' => $v['site'] ?: 'Sans site']);
                    if ($site->wasRecentlyCreated) $stats['sites']++;
                    $siteIds[$key] = $site->id;
                }
                [$category, $unit] = Vehicle::classify($v['type_label']);
                $attrs = ['code_parc' => $v['code_parc'], 'chassis' => $v['chassis'], 'type_label' => $v['type_label'], 'site_id' => $siteIds[$key]];
                $vehicle = Vehicle::where('immatriculation', $v['immatriculation'])->first();
                if (!$vehicle) {
                    Vehicle::create($attrs + ['immatriculation' => $v['immatriculation'], 'category' => $category, 'counter_unit' => $unit]);
                    $stats['created']++;
                } else {
                    // La catégorie / unité de compteur saisies par l'admin ne sont pas écrasées
                    $vehicle->fill($attrs);
                    $vehicle->isDirty() ? $stats['updated']++ : $stats['unchanged']++;
                    $vehicle->save();
                }
            }
            foreach ($breakdowns as $b) {
                $q = Vehicle::query();
                $b['immat'] !== '' ? $q->where('immatriculation', $b['immat']) : $q->where('code_parc', $b['code']);
                $stats['panne'] += $q->update(['status' => 'en_panne', 'status_note' => $b['note']]);
            }
        });

        $this->table(array_keys($stats), [array_values($stats)]);
        return self::SUCCESS;
    }

    /** Lignes de la feuille sous forme [colonne normalisée => valeur], à partir de la ligne d'en-tête. */
    private function rows(Worksheet $ws, array $wanted, bool $fillMerged = false): array
    {
        $data = $ws->toArray(null, true, false, true);
        $header = null;
        $map = [];
        $out = [];
        $last = [];
        foreach ($data as $n => $row) {
            if ($header === null) {
                foreach ($row as $col => $val) {
                    $k = $this->norm($val);
                    foreach ($wanted as $w) if ($k === $w || ($w === 'matricule' && $k === 'immatriculation')) $map[$w] = $col;
                }
                if (count($map) >= 2) $header = $n;
                else $map = [];
                continue;
            }
            if ($this->norm($row[$map[$wanted[0]] ?? 'A'] ?? '') === $wanted[0]) continue; // en-tête répété
            // Ligne vide : ignorée AVANT le report des cellules fusionnées
            $raw = array_map(fn ($w) => isset($map[$w]) ? trim((string) ($row[$map[$w]] ?? '')) : '', $wanted);
            if (implode('', $raw) === '') continue;
            if ($fillMerged && trim((string) ($row[$map[$wanted[0]]] ?? '')) === '') continue;
            $r = [];
            foreach ($wanted as $w) {
                $val = isset($map[$w]) ? ($row[$map[$w]] ?? null) : null;
                if ($fillMerged && ($val === null || $val === '') && isset($last[$w])) $val = $last[$w];
                $r[$w] = $val;
                if ($val !== null && $val !== '') $last[$w] = $val;
            }
            if (collect($r)->filter(fn ($v) => $v !== null && trim((string) $v) !== '')->isEmpty()) continue;
            $out[$n] = $r;
        }
        return $out;
    }

    private function findSheet($book, string $needle): ?Worksheet
    {
        foreach ($book->getAllSheets() as $s) if (str_contains($this->norm($s->getTitle()), $needle)) return $s;
        return null;
    }

    private function norm($v): string
    {
        $s = mb_strtolower(trim((string) $v));
        $s = strtr($s, ['é' => 'e', 'è' => 'e', 'ê' => 'e', 'â' => 'a', '°' => '', 'ç' => 'c', '&' => ' ']);
        $s = preg_replace('/[^a-z0-9 ]/u', '', $s);
        return preg_replace('/\s+/', ' ', trim(str_replace(['n de ', 'no de '], '', $s)));
    }

    private function clean($v): string
    {
        return preg_replace('/\s+/u', ' ', trim((string) $v));
    }

    private function immat($v): string
    {
        return mb_strtoupper(preg_replace('/[\s-]+/u', '', trim((string) $v)));
    }
}
