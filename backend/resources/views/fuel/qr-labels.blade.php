<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
  @page { margin: 10mm; }
  body { font-family: DejaVu Sans, sans-serif; margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  td { width: 33.33%; height: 66mm; text-align: center; vertical-align: middle; border: 1px dashed #999; padding: 3mm; }
  img { width: 44mm; height: 44mm; }
  .code { font-size: 26pt; font-weight: bold; letter-spacing: 1px; margin-top: 2mm; }
  .sub { font-size: 8pt; color: #333; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
</style>
</head>
<body>
@foreach ($labels->chunk(12) as $page)
  <div class="page">
    <table>
      @foreach ($page->chunk(3) as $row)
        <tr>
          @foreach ($row as $l)
            <td>
              <img src="{{ $l['img'] }}" alt="">
              <div class="code">{{ $l['code'] }}</div>
              <div class="sub">{{ $l['immatriculation'] }}@if($l['site']) · {{ $l['site'] }}@endif</div>
            </td>
          @endforeach
          @for ($i = $row->count(); $i < 3; $i++)<td></td>@endfor
        </tr>
      @endforeach
    </table>
  </div>
@endforeach
</body>
</html>
