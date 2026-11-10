<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
  @page { margin: 10mm; }
  body { font-family: DejaVu Sans, sans-serif; font-size: 10pt; }
  h1 { font-size: 15pt; margin: 0 0 2mm; }
  .num { font-size: 13pt; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-top: 3mm; }
  td { border: 1px solid #888; padding: 1.6mm 2mm; }
  td.k { background: #DBE9F7; width: 38%; font-weight: bold; }
  .big { font-size: 14pt; font-weight: bold; }
  .cancel { color: #9C0006; font-weight: bold; font-size: 13pt; border: 2px solid #9C0006; padding: 2mm; text-align: center; }
  .foot { margin-top: 4mm; font-size: 8pt; color: #444; }
</style>
</head>
<body>
  <h1>BON DE GASOIL</h1>
  <div class="num">N° {{ $f->voucher_number }}</div>
  @if ($f->status === 'annule')
    <p class="cancel">BON ANNULÉ le {{ $f->cancelled_at?->format('d/m/Y H:i') }} — {{ $f->cancel_reason }}</p>
  @endif
  <table>
    <tr><td class="k">Date / heure</td><td>{{ $f->refueled_at->format('d/m/Y H:i') }} (Africa/Casablanca)</td></tr>
    <tr><td class="k">Citerne</td><td>{{ $f->tank->code }} — {{ $f->site_name }}</td></tr>
    <tr><td class="k">Véhicule</td><td>{{ $f->vehicle_code }} — {{ $f->vehicle_immatriculation }} ({{ $f->vehicle_type }})</td></tr>
    <tr><td class="k">Conducteur</td><td>{{ $f->driver_name ?? 'Non affecté' }}@if($f->shift_name) — shift {{ $f->shift_name }}@endif</td></tr>
    <tr><td class="k">Pompiste</td><td>{{ $f->pump_attendant_name }}</td></tr>
    <tr><td class="k">Série départ</td><td>{{ $f->index_start }}</td></tr>
    <tr><td class="k">Série fin</td><td>{{ $f->index_end }}</td></tr>
    <tr><td class="k">Quantité</td><td class="big">{{ $f->quantity_l }} L</td></tr>
    <tr><td class="k">Compteur véhicule</td><td>{{ $f->counter_value ?? '—' }} {{ $f->counter_unit === 'h' ? 'H' : 'km' }}</td></tr>
    @if ($f->paper_voucher_number)<tr><td class="k">Bon papier</td><td>{{ $f->paper_voucher_number }}</td></tr>@endif
    @if ($f->remark)<tr><td class="k">Remarque</td><td>{{ $f->remark }}</td></tr>@endif
    <tr><td class="k">Justificatifs</td><td>{{ $f->attachments->count() }} photo(s)</td></tr>
  </table>
  <p class="foot">Bon généré par l'application — référence interne {{ $f->client_uuid }}</p>
</body>
</html>
