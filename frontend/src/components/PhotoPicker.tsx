import { useEffect, useRef, useState } from 'react'
import { ApiError, request } from '../lib/api'
import { compressImage } from '../lib/util'
import { Button, Spinner } from './ui'

export type PhotoItem = {
  key: string
  id: number | null        // id serveur une fois envoyée
  name: string
  preview: string | null   // URL objet locale (perdue au rechargement de la page)
  status: 'envoi' | 'ok' | 'erreur'
  error?: string
  file?: File
  kind: 'bon_papier' | 'photo'
}

/**
 * Photos / justificatifs. Chaque photo est envoyée dès sa prise (POST /attachments) et
 * rattachée au bon seulement à la validation. Une photo envoyée n'est jamais effacée du
 * serveur : « Retirer » la détache simplement de ce bon avant validation.
 */
export function PhotoPicker({ items, onChange }: { items: PhotoItem[]; onChange: (fn: (items: PhotoItem[]) => PhotoItem[]) => void }) {
  const camRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const replaceKey = useRef<string | null>(null)
  const [kind, setKind] = useState<PhotoItem['kind']>('bon_papier')

  const upload = async (item: PhotoItem) => {
    const fd = new FormData()
    fd.append('file', item.file!)
    fd.append('kind', item.kind)
    try {
      const res = await request<{ id: number }>('/attachments', { method: 'POST', body: fd })
      onChange((list) => list.map((x) => (x.key === item.key ? { ...x, id: res.id, status: 'ok', error: undefined, file: undefined } : x)))
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Échec de l\'envoi'
      onChange((list) => list.map((x) => (x.key === item.key ? { ...x, status: 'erreur', error: msg } : x)))
    }
  }

  const add = async (files: FileList | null) => {
    if (!files?.length) return
    const toReplace = replaceKey.current
    replaceKey.current = null
    for (const raw of Array.from(files)) {
      const file = await compressImage(raw)
      const item: PhotoItem = {
        key: `${Date.now()}-${Math.random()}`, id: null, name: file.name, kind,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null, status: 'envoi', file,
      }
      onChange((list) => (toReplace ? list.map((x) => (x.key === toReplace ? item : x)) : [...list, item]))
      upload(item)
    }
  }

  useEffect(() => () => items.forEach((i) => i.preview && URL.revokeObjectURL(i.preview)), []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-sm">
        {(['bon_papier', 'photo'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1 font-medium ${kind === k ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-700'}`}>
            {k === 'bon_papier' ? 'Bon papier' : 'Autre photo'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" size="lg" onClick={() => camRef.current?.click()}>📷 Prendre une photo</Button>
        <Button type="button" variant="secondary" size="lg" onClick={() => fileRef.current?.click()}>🖼️ Galerie</Button>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { add(e.target.files); e.target.value = '' }} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = '' }} />

      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((it) => (
            <li key={it.key} className="overflow-hidden rounded-lg border border-ink-200 bg-white">
              <div className="relative aspect-[4/3] bg-ink-100">
                {it.preview ? <img src={it.preview} alt={it.name} className="h-full w-full object-cover" /> :
                  <div className="flex h-full items-center justify-center p-2 text-center text-xs text-ink-500">{it.status === 'ok' ? '✔ Envoyée' : it.name}</div>}
                {it.status === 'envoi' && <div className="absolute inset-0 flex items-center justify-center bg-white/60"><Spinner /></div>}
                <span className="absolute left-1 top-1 rounded bg-ink-900/75 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {it.kind === 'bon_papier' ? 'Bon papier' : 'Photo'}
                </span>
              </div>
              <div className="space-y-1 p-2 text-xs">
                {it.status === 'erreur' && <p className="text-red-600">{it.error}</p>}
                <div className="flex gap-1">
                  {it.status === 'erreur' && it.file && (
                    <button type="button" className="font-semibold text-brand-700" onClick={() => {
                      onChange((l) => l.map((x) => (x.key === it.key ? { ...x, status: 'envoi' } : x))); upload(it)
                    }}>Réessayer</button>
                  )}
                  <button type="button" className="font-semibold text-ink-700" onClick={() => { replaceKey.current = it.key; camRef.current?.click() }}>Remplacer</button>
                  <button type="button" className="ml-auto font-semibold text-red-600" onClick={() => onChange((l) => l.filter((x) => x.key !== it.key))}>Retirer</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
