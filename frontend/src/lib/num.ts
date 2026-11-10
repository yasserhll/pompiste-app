// Même normalisation que le serveur (App\Services\Fuel\Num::parse), pour l'aperçu immédiat.
// Le serveur reste seul juge : la valeur envoyée est la saisie brute.

export type Parsed = { ok: true; value: string; cents: bigint } | { ok: false; error: string } | { ok: true; value: null; cents: null }

export function parseNum(raw: string | null | undefined): Parsed {
  if (raw == null || raw.trim() === '') return { ok: true, value: null, cents: null }
  let s = raw.replace(/[\s  '’_]/g, '')
  const negative = s.startsWith('-')
  if (negative) s = s.slice(1)
  if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return { ok: false, error: 'Nombre invalide' }

  const dots = (s.match(/\./g) || []).length
  const commas = (s.match(/,/g) || []).length

  if (dots && commas) {
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','
    const th = dec === '.' ? ',' : '.'
    if (s.split(dec).length > 2) return { ok: false, error: 'Séparateurs incohérents' }
    s = s.split(th).join('').replace(dec, '.')
  } else if (dots + commas > 1) {
    const sep = dots ? '.' : ','
    const re = new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`)
    if (!re.test(s)) return { ok: false, error: 'Séparateurs incohérents' }
    s = s.split(sep).join('')
  } else if (dots + commas === 1) {
    const sep = dots ? '.' : ','
    const [int, frac] = s.split(sep)
    if (frac.length === 3 && int !== '' && int !== '0') return { ok: false, error: 'Ambigu : saisir sans séparateur, ou 1-2 décimales' }
    if (frac.length > 2) return { ok: false, error: 'Maximum 2 décimales' }
    s = `${int || '0'}.${frac || '0'}`
  }

  const [i, f = ''] = s.split('.')
  if (i.length > 12) return { ok: false, error: 'Valeur trop grande' }
  const cents = BigInt(i || '0') * 100n + BigInt((f + '00').slice(0, 2))
  const signed = negative ? -cents : cents
  return { ok: true, value: centsToString(signed), cents: signed }
}

export function centsToString(c: bigint): string {
  const neg = c < 0n
  const a = neg ? -c : c
  return `${neg ? '-' : ''}${a / 100n}.${String(a % 100n).padStart(2, '0')}`
}

/** Quantité = fin − départ, en centièmes (exact). */
export function quantity(start: string, end: string): { value: string | null; error?: string } {
  const a = parseNum(start)
  const b = parseNum(end)
  if (!a.ok) return { value: null, error: `Série départ : ${a.error}` }
  if (!b.ok) return { value: null, error: `Série fin : ${b.error}` }
  if (a.cents === null || b.cents === null) return { value: null }
  const q = b.cents - a.cents
  if (q < 0n) return { value: centsToString(q), error: 'Série fin inférieure à la série départ' }
  return { value: centsToString(q) }
}
