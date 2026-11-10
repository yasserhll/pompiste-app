// Client HTTP : jeton Sanctum, erreurs typées (422 validation, 409 confirmation, 403…)

export type Warning = { level: 'bloquant' | 'alerte' | 'info'; code: string; message: string; data?: Record<string, unknown> }

export class ApiError extends Error {
  status: number
  errors: Record<string, string[]>
  warnings: Warning[]
  requiresConfirmation: boolean
  offline: boolean

  constructor(status: number, body: any, offline = false) {
    const first = body?.errors ? (Object.values(body.errors)[0] as string[] | undefined)?.[0] : undefined
    super(first || body?.message || (offline ? 'Connexion impossible. Vérifier le réseau.' : `Erreur ${status}`))
    this.status = status
    this.errors = body?.errors ?? {}
    this.warnings = body?.warnings ?? []
    this.requiresConfirmation = !!body?.requires_confirmation
    this.offline = offline
  }

  /** Tous les messages, pour un affichage complet. */
  get messages(): string[] {
    const list = Object.values(this.errors).flat()
    return list.length ? list : [this.message]
  }
}

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api'
const TOKEN_KEY = 'pompiste.token'

export const token = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } },
  set: (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch { /* stockage indisponible */ } },
}

let onUnauthorized: () => void = () => {}
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn }

type Options = { method?: string; body?: unknown; query?: Record<string, unknown>; signal?: AbortSignal; raw?: boolean }

function buildUrl(path: string, query?: Record<string, unknown>) {
  const qs = new URLSearchParams()
  Object.entries(query ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.append(k, String(v))
  })
  const s = qs.toString()
  return `${BASE}${path}${s ? `?${s}` : ''}`
}

export async function request<T = any>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const t = token.get()
  if (t) headers.Authorization = `Bearer ${t}`
  let body: BodyInit | undefined
  if (opts.body instanceof FormData) body = opts.body
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body) }

  let res: Response
  try {
    res = await fetch(buildUrl(path, opts.query), { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body, signal: opts.signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, null, true)
  }

  if (res.status === 401) { token.set(null); onUnauthorized() }
  if (!res.ok) {
    let data: any = null
    try { data = await res.json() } catch { /* corps non JSON */ }
    throw new ApiError(res.status, data)
  }
  if (opts.raw) return res as unknown as T
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  get: <T = any>(path: string, query?: Record<string, unknown>, signal?: AbortSignal) => request<T>(path, { query, signal }),
  post: <T = any>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ?? {} }),
  put: <T = any>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: body ?? {} }),
}

/** Téléchargement authentifié (PDF, Excel). */
export async function download(path: string, query?: Record<string, unknown>, method: 'GET' | 'POST' = 'GET', body?: unknown) {
  const res = await request<Response>(path, { query, raw: true, method, body })
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') ?? ''
  const name = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)?.[1] ?? 'fichier'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = decodeURIComponent(name)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Image protégée → URL objet (l'en-tête Authorization est requis). */
export async function blobUrl(path: string): Promise<string> {
  const res = await request<Response>(path, { raw: true })
  return URL.createObjectURL(await res.blob())
}

export type Paginated<T> = { data: T[]; current_page: number; last_page: number; total: number; per_page: number }
