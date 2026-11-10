<?php

namespace App\Services\Fuel;

use App\Models\Fuel\FuelAnomaly;
use App\Models\Fuel\FuelDelivery;
use App\Models\Fuel\FuelAdjustment;
use App\Models\Fuel\FuelInventory;
use App\Models\Fuel\FuelRefuel;
use App\Models\Fuel\FuelStockMovement;
use App\Models\Fuel\FuelTank;
use App\Models\Vehicle;
use Illuminate\Support\Collection;
use PhpOffice\PhpSpreadsheet\Shared\Date as XlDate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

/**
 * Rapport Excel par citerne, au format du fichier terrain « mobile 1.xlsx » :
 *
 *   ligne 5  : ENTREE (B:C) | SORTIES (D:J) | SERIE DEPART | SERIE FIN | STOCK REEL
 *   ligne 6  : Date | Qte | Fournisseur | N° DE BON | Heure | Code | Immatriculation | Kilometrage | Qte | Remarque
 *   ligne 7  : stock d'ouverture de la période (absent du modèle : sans lui, le solde démarrait à 0
 *              et devenait négatif — 757 lignes négatives dans mobile 1.xlsx)
 *   ligne 8+ : un mouvement de stock par ligne, ordre chronologique ; M = M(préc.) + B − I
 *
 * Écarts volontaires avec le modèle : Immatriculation écrite en valeur (le modèle faisait un VLOOKUP
 * vers un classeur externe) ; Série départ / fin = index réellement relevés (le modèle les calculait
 * à partir de la quantité, ce qui empêchait tout contrôle). Feuilles « Synthèse » et « Anomalies » ajoutées.
 */
class TankReportExporter
{
    private const FONT = 'Century Gothic';
    private const FILL_TOP = 'FFDBE9F7';
    private const FILL_HEAD = 'FFD9F2D0';
    private const WIDTHS = ['A' => 16.44, 'B' => 10.66, 'C' => 22, 'D' => 13, 'E' => 10.66, 'F' => 23.78,
        'G' => 32.78, 'H' => 15.11, 'I' => 10.66, 'J' => 34, 'K' => 12.78, 'L' => 12.78, 'M' => 13];

    public function __construct(private StockService $stock) {}

    /** @param Collection<FuelTank> $tanks */
    public function tanksWorkbook(Collection $tanks, ReportPeriod $p, string $title): Spreadsheet
    {
        $book = new Spreadsheet();
        $book->getProperties()->setCreator('Module gasoil')->setTitle($title);
        $book->removeSheetByIndex(0);

        $summary = [];
        foreach ($tanks as $tank) {
            $summary[] = $this->tankSheet($book, $tank, $p);
        }
        $this->summarySheet($book, $summary, $p, $title);
        $this->anomaliesSheet($book, $tanks->pluck('id')->all(), $p);
        $book->setActiveSheetIndex(0);
        return $book;
    }

    public function vehicleWorkbook(Vehicle $vehicle, ReportPeriod $p, ?array $tankIds): Spreadsheet
    {
        $book = new Spreadsheet();
        $ws = $book->getActiveSheet();
        $ws->setTitle($this->sheetName('Véhicule ' . $vehicle->code_parc));
        $ws->setCellValue('A1', "Consommation {$vehicle->code_parc} — {$vehicle->immatriculation} ({$vehicle->type_label})");
        $ws->setCellValue('A2', $p->label);
        $ws->getStyle('A1')->getFont()->setBold(true)->setSize(13);

        $heads = ['Date', 'Heure', 'N° de bon', 'Bon papier', 'Citerne', 'Site', 'Conducteur', 'Shift', 'Pompiste',
            'Compteur (' . $vehicle->counter_unit . ')', 'Qte (L)', 'Écart compteur', $vehicle->counter_unit === 'h' ? 'L/h' : 'L/100 km', 'Statut'];
        $ws->fromArray($heads, null, 'A4');
        $this->headerStyle($ws, 'A4:N4', self::FILL_HEAD);

        $q = FuelRefuel::where('vehicle_id', $vehicle->id)->whereBetween('refueled_at', [$p->from, $p->to])
            ->with('tank')->orderBy('refueled_at')->orderBy('id');
        if ($tankIds !== null) $q->whereIn('fuel_tank_id', $tankIds);

        $r = 5;
        $prev = null;
        foreach ($q->get() as $f) {
            $diff = ($f->status === 'valide' && $prev !== null && $f->counter_value !== null) ? (float) $f->counter_value - $prev : null;
            $ratio = ($diff && $diff > 0) ? ($vehicle->counter_unit === 'h' ? (float) $f->quantity_l / $diff : (float) $f->quantity_l * 100 / $diff) : null;
            $ws->fromArray([
                XlDate::PHPToExcel($f->refueled_at->copy()->startOfDay()), XlDate::PHPToExcel($f->refueled_at) - floor(XlDate::PHPToExcel($f->refueled_at)),
                $f->voucher_number, $f->paper_voucher_number, $f->tank->code, $f->site_name, $f->driver_name, $f->shift_name,
                $f->pump_attendant_name, Num::toFloat($f->counter_value), Num::toFloat($f->quantity_l), $diff,
                $ratio !== null ? round($ratio, 2) : null, $f->status === 'valide' ? 'Validé' : 'Annulé',
            ], null, "A{$r}");
            if ($f->status === 'valide' && $f->counter_value !== null) $prev = (float) $f->counter_value;
            $r++;
        }
        $last = max(5, $r - 1);
        $ws->getStyle("A5:A{$last}")->getNumberFormat()->setFormatCode('d/m/yyyy');
        $ws->getStyle("B5:B{$last}")->getNumberFormat()->setFormatCode('h:mm');
        $this->bodyStyle($ws, "A5:N{$last}");
        $ws->setCellValue("J" . ($r + 1), 'Total');
        $ws->setCellValue("K" . ($r + 1), "=SUMIF(N5:N{$last},\"Validé\",K5:K{$last})");
        $ws->getStyle("J" . ($r + 1) . ":K" . ($r + 1))->getFont()->setBold(true);
        foreach (range('A', 'N') as $c) $ws->getColumnDimension($c)->setAutoSize(true);
        $ws->freezePane('A5');
        $ws->setAutoFilter("A4:N{$last}");
        return $book;
    }

    public function save(Spreadsheet $book, string $path): void
    {
        (new Xlsx($book))->save($path);
    }

    // ───────────────────────────────────────────────────────────── feuille citerne

    private function tankSheet(Spreadsheet $book, FuelTank $tank, ReportPeriod $p): array
    {
        $ws = $book->createSheet();
        $ws->setTitle($this->sheetName($tank->code));
        $ws->getParent()->getDefaultStyle()->getFont()->setName(self::FONT)->setSize(11);

        $opening = $this->stock->balanceAt($tank, $p->from);

        $ws->setCellValue('A1', "RAPPORT CITERNE {$tank->code}");
        $ws->setCellValue('A2', "{$tank->name} — site " . ($tank->site?->name ?? '') . " — capacité {$tank->capacity_l} L");
        $ws->setCellValue('A3', $p->label . ' — édité le ' . now(config('fuel.timezone'))->format('d/m/Y H:i'));
        $ws->getStyle('A1')->getFont()->setBold(true)->setSize(14);

        // En-têtes (lignes 5-6) identiques au modèle
        $ws->setCellValue('B5', 'ENTREE')->mergeCells('B5:C5');
        $ws->setCellValue('D5', 'SORTIES')->mergeCells('D5:J5');
        $ws->setCellValue('K5', 'SERIE DEPART')->mergeCells('K5:K6');
        $ws->setCellValue('L5', 'SERIE FIN')->mergeCells('L5:L6');
        $ws->setCellValue('M5', 'STOCK REEL')->mergeCells('M5:M6');
        $ws->fromArray(['Date', 'Qte', 'Fournisseur', 'N° DE BON', 'Heure', 'Code', 'Immatriculation', 'Kilometrage', 'Qte', 'Remarque'], null, 'A6');
        $this->headerStyle($ws, 'A5:M5', self::FILL_TOP);
        $this->headerStyle($ws, 'B6:J6', self::FILL_HEAD);
        $this->headerStyle($ws, 'A6', self::FILL_TOP);
        $ws->getStyle('M5')->getFont()->setSize(11);

        // Ligne 7 : stock d'ouverture
        $ws->setCellValue('A7', XlDate::PHPToExcel($p->from->startOfDay()));
        $ws->setCellValue('C7', "STOCK D'OUVERTURE");
        $ws->setCellValue('M7', (float) $opening);
        $ws->getStyle('A7:M7')->getFont()->setItalic(true);

        $movements = FuelStockMovement::where('fuel_tank_id', $tank->id)
            ->whereBetween('occurred_at', [$p->from, $p->to])
            ->orderBy('occurred_at')->orderBy('id')->get();
        $this->preload($movements);

        $r = 8;
        $entries = $exits = $adjust = '0.00';
        $bons = 0;
        $decimals = false;
        foreach ($movements as $m) {
            $row = $this->movementRow($m);
            $ws->fromArray($row['cells'], null, "A{$r}", true);
            $ws->setCellValue("M{$r}", "=M" . ($r - 1) . "+B{$r}-I{$r}");
            if (!empty($row['italic'])) $ws->getStyle("A{$r}:M{$r}")->getFont()->setItalic(true)->getColor()->setARGB('FF9C0006');
            $q = Num::fmt((string) $m->quantity_l);
            if (str_contains($q, '.') && !str_ends_with($q, '.00')) $decimals = true;
            match ($m->type) {
                'entree', 'annulation_entree', 'stock_initial' => $entries = Num::add($entries, $q),
                'sortie', 'annulation_sortie' => $exits = Num::sub($exits, $q),
                'ajustement' => $adjust = Num::add($adjust, $q),
            };
            if ($m->type === 'sortie') $bons++;
            $r++;
        }
        $last = max(7, $r - 1);

        $ws->getStyle("A7:A{$last}")->getNumberFormat()->setFormatCode('d/m/yyyy');
        $ws->getStyle("E7:E{$last}")->getNumberFormat()->setFormatCode('h:mm:ss');
        $qtyFormat = $decimals ? '0.00' : '0';
        foreach (['B', 'I', 'M'] as $c) $ws->getStyle("{$c}7:{$c}{$last}")->getNumberFormat()->setFormatCode($qtyFormat);
        $ws->getStyle("K7:L{$last}")->getNumberFormat()->setFormatCode('0.##');
        $this->bodyStyle($ws, "A7:M{$last}");

        foreach (self::WIDTHS as $c => $w) $ws->getColumnDimension($c)->setWidth($w);
        $ws->freezePane('A7');
        $ws->setAutoFilter("A6:M{$last}");
        $ws->getPageSetup()->setOrientation('landscape')->setFitToWidth(1)->setFitToHeight(0);
        $ws->getPageSetup()->setRowsToRepeatAtTopByStartAndEnd(5, 6);

        $closing = Num::sub(Num::add(Num::add($opening, $entries), $adjust), $exits);
        $inv = FuelInventory::where('fuel_tank_id', $tank->id)->where('status', 'approuve')
            ->where('measured_at', '<=', $p->to)->orderByDesc('measured_at')->first();

        return [
            'tank' => $tank, 'opening' => $opening, 'entries' => $entries, 'exits' => $exits, 'adjust' => $adjust,
            'closing' => $closing, 'bons' => $bons, 'inventory' => $inv,
            'anomalies' => FuelAnomaly::where('fuel_tank_id', $tank->id)->whereBetween('created_at', [$p->from, $p->to])->count(),
        ];
    }

    private function preload(Collection $movements): void
    {
        $by = $movements->groupBy('source_type');
        $refuel = (new FuelRefuel)->getMorphClass();
        $delivery = (new FuelDelivery)->getMorphClass();
        $adjustment = (new FuelAdjustment)->getMorphClass();
        $maps = [
            $refuel => FuelRefuel::whereIn('id', ($by[$refuel] ?? collect())->pluck('source_id'))->get()->keyBy('id'),
            $delivery => FuelDelivery::whereIn('id', ($by[$delivery] ?? collect())->pluck('source_id'))->get()->keyBy('id'),
            $adjustment => FuelAdjustment::whereIn('id', ($by[$adjustment] ?? collect())->pluck('source_id'))->get()->keyBy('id'),
        ];
        foreach ($movements as $m) {
            $m->setRelation('source', $m->source_type ? ($maps[$m->source_type][$m->source_id] ?? null) : null);
        }
    }

    /** Une ligne du modèle (colonnes A → L) pour un mouvement de stock. */
    private function movementRow(FuelStockMovement $m): array
    {
        $date = XlDate::PHPToExcel($m->occurred_at->copy()->startOfDay());
        $time = XlDate::PHPToExcel($m->occurred_at) - floor(XlDate::PHPToExcel($m->occurred_at));
        $q = (float) $m->quantity_l;
        $src = $m->source;
        $blank = array_fill(0, 12, null);

        switch ($m->type) {
            case 'stock_initial':
                $c = $blank; $c[0] = $date; $c[1] = $q; $c[2] = 'STOCK INITIAL';
                return ['cells' => $c];
            case 'entree':
            case 'annulation_entree':
                $c = $blank; $c[0] = $date; $c[1] = $q;
                $c[2] = $m->type === 'entree' ? ($src?->supplier ?? '') : 'ANNULATION LIVRAISON';
                $c[9] = trim(implode(' — ', array_filter([
                    $src?->delivery_note_number ? 'BL ' . $src->delivery_note_number : null,
                    $src?->delivery_reference, $src?->remark,
                ])));
                return ['cells' => $c, 'italic' => $m->type === 'annulation_entree'];
            case 'ajustement':
                $c = $blank; $c[0] = $date; $c[1] = $q; $c[2] = 'AJUSTEMENT INVENTAIRE';
                $c[9] = $src?->reason ?? $m->note;
                return ['cells' => $c];
            case 'sortie':
            case 'annulation_sortie':
                /** @var FuelRefuel|null $src */
                $cancel = $m->type === 'annulation_sortie';
                $remark = array_filter([
                    $src?->paper_voucher_number ? 'Bon papier ' . $src->paper_voucher_number : null,
                    $src?->driver_name,
                    $src?->remark,
                    $src?->corrects_refuel_id ? 'Correction' : null,
                    $cancel ? 'ANNULATION : ' . ($src?->cancel_reason ?? '') : ($src?->status === 'annule' ? 'BON ANNULÉ' : null),
                ]);
                return ['cells' => [
                    $date, null, null, $src?->voucher_seq, $time, $src?->vehicle_code, $src?->vehicle_immatriculation,
                    $cancel ? null : Num::toFloat($src?->counter_value), -$q, implode(' — ', $remark),
                    $cancel ? null : Num::toFloat($src?->index_start), $cancel ? null : Num::toFloat($src?->index_end),
                ], 'italic' => $cancel || $src?->status === 'annule'];
        }
        return ['cells' => $blank];
    }

    // ───────────────────────────────────────────────────────────── synthèse / anomalies

    private function summarySheet(Spreadsheet $book, array $rows, ReportPeriod $p, string $title): void
    {
        $ws = $book->createSheet(0);
        $ws->setTitle('Synthèse');
        $ws->setCellValue('A1', $title);
        $ws->setCellValue('A2', $p->label);
        $ws->getStyle('A1')->getFont()->setBold(true)->setSize(14);
        $heads = ['Citerne', 'Site', 'Stock ouverture', 'Entrées', 'Sorties', 'Ajustements', 'Stock théorique clôture',
            'Nb bons', 'Dernier inventaire', 'Stock mesuré', 'Écart mesuré − théorique', 'Anomalies'];
        $ws->fromArray($heads, null, 'A4');
        $this->headerStyle($ws, 'A4:L4', self::FILL_TOP);

        $r = 5;
        foreach ($rows as $s) {
            $inv = $s['inventory'];
            $ws->fromArray([
                $s['tank']->code, $s['tank']->site?->name, (float) $s['opening'], (float) $s['entries'], (float) $s['exits'],
                (float) $s['adjust'], (float) $s['closing'], $s['bons'],
                $inv ? XlDate::PHPToExcel($inv->measured_at) : 'Aucun', $inv ? (float) $inv->measured_quantity_l : null,
                $inv ? (float) $inv->difference_l : null, $s['anomalies'],
            ], null, "A{$r}", true);
            $r++;
        }
        $last = max(5, $r - 1);
        if ($rows) {
            $ws->setCellValue("A{$r}", 'TOTAL');
            foreach (['C', 'D', 'E', 'F', 'G', 'H', 'L'] as $c) $ws->setCellValue("{$c}{$r}", "=SUM({$c}5:{$c}{$last})");
            $ws->getStyle("A{$r}:L{$r}")->getFont()->setBold(true);
        }
        $ws->getStyle("C5:G{$r}")->getNumberFormat()->setFormatCode('#,##0.00');
        $ws->getStyle("I5:I{$last}")->getNumberFormat()->setFormatCode('d/m/yyyy h:mm');
        $ws->getStyle("J5:K{$last}")->getNumberFormat()->setFormatCode('#,##0.00');
        $this->bodyStyle($ws, "A5:L{$r}");
        $ws->setCellValue('A' . ($r + 2), 'Stock théorique = stock initial + entrées − sorties ± ajustements validés. '
            . 'Le stock mesuré provient uniquement des inventaires physiques approuvés.');
        $ws->getStyle('A' . ($r + 2))->getFont()->setItalic(true)->setSize(9);
        foreach (range('A', 'L') as $c) $ws->getColumnDimension($c)->setAutoSize(true);
    }

    private function anomaliesSheet(Spreadsheet $book, array $tankIds, ReportPeriod $p): void
    {
        $ws = $book->createSheet();
        $ws->setTitle('Anomalies');
        $ws->fromArray(['Date', 'Citerne', 'Type', 'Gravité', 'N° de bon', 'Véhicule', 'Message', 'Statut', 'Traitement'], null, 'A1');
        $this->headerStyle($ws, 'A1:I1', self::FILL_HEAD);

        $rows = FuelAnomaly::with(['tank', 'refuel'])->whereIn('fuel_tank_id', $tankIds)
            ->whereBetween('created_at', [$p->from, $p->to])->orderBy('created_at')->get();
        $r = 2;
        foreach ($rows as $a) {
            $ws->fromArray([
                XlDate::PHPToExcel($a->created_at), $a->tank?->code, $a->type, $a->severity, $a->refuel?->voucher_number,
                $a->refuel?->vehicle_code, $a->message, $a->status, $a->resolution_note,
            ], null, "A{$r}", true);
            $r++;
        }
        $last = max(2, $r - 1);
        $ws->getStyle("A2:A{$last}")->getNumberFormat()->setFormatCode('d/m/yyyy h:mm');
        $this->bodyStyle($ws, "A2:I{$last}");
        foreach (range('A', 'I') as $c) $ws->getColumnDimension($c)->setAutoSize(true);
        $ws->getColumnDimension('G')->setAutoSize(false)->setWidth(70);
        $ws->freezePane('A2');
        $ws->setAutoFilter("A1:I{$last}");
    }

    // ───────────────────────────────────────────────────────────── styles

    private function headerStyle(Worksheet $ws, string $range, string $fill): void
    {
        $st = $ws->getStyle($range);
        $st->getFont()->setName(self::FONT)->setBold(true)->setSize(10);
        $st->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB($fill);
        $st->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER)->setVertical(Alignment::VERTICAL_CENTER)->setWrapText(true);
        $st->getBorders()->getAllBorders()->setBorderStyle(Border::BORDER_THIN);
    }

    private function bodyStyle(Worksheet $ws, string $range): void
    {
        $st = $ws->getStyle($range);
        $st->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
        $st->getBorders()->getAllBorders()->setBorderStyle(Border::BORDER_THIN);
    }

    private function sheetName(string $name): string
    {
        return mb_substr(str_replace(['[', ']', ':', '*', '?', '/', '\\'], '-', $name), 0, 31);
    }
}
