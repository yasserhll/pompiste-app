const TZ = 'Africa/Casablanca' // uniquement pour la date du jour des filtres

const litresFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
const intFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

export const litres = (v: string | number | null | undefined, unit = true) =>
  v == null || v === '' ? '—' : `${litresFmt.format(Number(v))}${unit ? ' L' : ''}`

export const num = (v: string | number | null | undefined) => (v == null || v === '' ? '—' : litresFmt.format(Number(v)))
export const int = (v: string | number | null | undefined) => (v == null || v === '' ? '—' : intFmt.format(Number(v)))

export const counter = (v: string | number | null | undefined, unit?: string | null) =>
  v == null || v === '' ? '—' : `${litresFmt.format(Number(v))} ${unit === 'h' ? 'h' : 'km'}`

// Les dates de l'API sont déjà en heure locale du serveur (Africa/Casablanca) avec leur décalage :
// « 2026-11-07T10:40:00+01:00 ». On affiche ces chiffres tels quels, sans conversion par le
// navigateur : les bases de fuseaux des navigateurs ne s'accordent pas toujours sur le Maroc
// (Chrome 156 : UTC+0, PHP/MySQL/Windows : UTC+1). Le serveur reste la seule référence.
const WALL = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/

function wall(iso?: string | null) {
  const m = iso ? WALL.exec(iso) : null
  return m ? { y: m[1], mo: m[2], d: m[3], h: m[4] ?? '00', mi: m[5] ?? '00' } : null
}

export const dateTime = (iso?: string | null) => {
  const w = wall(iso)
  return w ? `${w.d}/${w.mo}/${w.y} ${w.h}:${w.mi}` : '—'
}

export const date = (iso?: string | null) => {
  const w = wall(iso)
  return w ? `${w.d}/${w.mo}/${w.y}` : '—'
}

export const time = (iso?: string | null) => {
  const w = wall(iso)
  return w ? `${w.h}:${w.mi}` : '—'
}

/** Date du jour à Casablanca, AAAA-MM-JJ. */
export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())

export const daysAgoISO = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
}

export const ROLE_LABEL: Record<string, string> = { admin: 'Administrateur', responsable_site: 'Responsable de site', pompiste: 'Pompiste' }
export const CATEGORY_LABEL: Record<string, string> = { camion: 'Camion', engin: 'Engin', vehicule_leger: 'Véhicule léger', citerne: 'Citerne', autre: 'Autre' }
export const STATUS_LABEL: Record<string, string> = { actif: 'Actif', en_panne: 'En panne', inactif: 'Inactif' }
