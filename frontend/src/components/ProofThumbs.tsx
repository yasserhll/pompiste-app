import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Download, FileText, ImageOff, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { blobUrl, download } from '../lib/api'
import { cls } from '../lib/util'

export type Proof = { id: number; kind: string; mime: string; has_thumb?: boolean }

// Cache des URL objets (miniatures et originaux) pour la session : évite de recharger en défilant
const cache = new Map<string, Promise<string>>()
const load = (id: number, thumb: boolean) => {
  const key = `${id}:${thumb ? 't' : 'o'}`
  if (!cache.has(key)) {
    const p = blobUrl(`/attachments/${id}${thumb ? '?thumb=1' : ''}`)
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return cache.get(key)!
}

function Thumb({ p, size, onOpen }: { p: Proof; size: number; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const isImg = p.mime.startsWith('image/')

  // Chargement seulement quand la miniature devient visible
  useEffect(() => {
    if (!isImg || !ref.current) return
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      load(p.id, !!p.has_thumb).then(setUrl).catch(() => setFailed(true))
    }, { rootMargin: '200px' })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [p.id, p.has_thumb, isImg])

  return (
    <button ref={ref} type="button" onClick={onOpen} title={p.kind === 'bon_papier' ? 'Bon papier' : 'Justificatif'}
      className="group relative shrink-0 overflow-hidden rounded-lg bg-ink-100 ring-1 ring-ink-200 transition hover:ring-2 hover:ring-brand-500"
      style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
        : isImg && !failed ? <span className="absolute inset-0 animate-pulse bg-ink-200" />
        : <span className="flex h-full w-full items-center justify-center text-ink-400">{failed ? <ImageOff size={size / 2.6} /> : <FileText size={size / 2.6} />}</span>}
      {p.kind === 'bon_papier' && <span className="absolute inset-x-0 bottom-0 bg-ink-900/70 py-px text-center text-[8px] font-bold uppercase tracking-wider text-white">Bon</span>}
    </button>
  )
}

/** Justificatifs d'une ligne (sortie, entrée) : miniatures + visionneuse plein écran. */
export function ProofThumbs({ items, size = 40, max = 3, empty }: { items: Proof[]; size?: number; max?: number; empty?: React.ReactNode }) {
  const [open, setOpen] = useState<number | null>(null)
  if (!items.length) return <>{empty ?? <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700"><ImageOff size={14} />Aucun</span>}</>
  const shown = items.slice(0, max)
  return (
    <>
      <div className="flex items-center gap-1.5">
        {shown.map((p, i) => <Thumb key={p.id} p={p} size={size} onOpen={() => setOpen(i)} />)}
        {items.length > max && (
          <button type="button" onClick={() => setOpen(max)} className="flex items-center justify-center rounded-lg bg-ink-100 text-xs font-bold text-ink-600 ring-1 ring-ink-200 hover:bg-ink-200" style={{ width: size, height: size }}>
            +{items.length - max}
          </button>
        )}
      </div>
      <Lightbox items={items} index={open} onIndex={setOpen} />
    </>
  )
}

function Lightbox({ items, index, onIndex }: { items: Proof[]; index: number | null; onIndex: (i: number | null) => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const touch = useRef<number | null>(null)
  const p = index !== null ? items[index] : null

  useEffect(() => {
    setUrl(null)
    if (!p || !p.mime.startsWith('image/')) return
    let alive = true
    load(p.id, false).then((u) => alive && setUrl(u)).catch(() => {})
    return () => { alive = false }
  }, [p])

  useEffect(() => {
    if (index === null) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onIndex(null)
      if (e.key === 'ArrowRight') onIndex(Math.min(items.length - 1, index + 1))
      if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1))
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [index, items.length, onIndex])

  return createPortal(
    <AnimatePresence>
      {p && index !== null && (
        <motion.div className="fixed inset-0 z-[70] flex flex-col bg-ink-950/95 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onTouchStart={(e) => { touch.current = e.touches[0].clientX }}
          onTouchEnd={(e) => {
            if (touch.current === null) return
            const dx = e.changedTouches[0].clientX - touch.current
            if (dx < -50) onIndex(Math.min(items.length - 1, index + 1))
            if (dx > 50) onIndex(Math.max(0, index - 1))
            touch.current = null
          }}>
          <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] text-white">
            <p className="text-sm font-medium">{p.kind === 'bon_papier' ? 'Bon papier' : 'Justificatif'} · {index + 1} / {items.length}</p>
            <div className="flex gap-1">
              <button onClick={() => download(`/attachments/${p.id}`)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Télécharger"><Download size={20} /></button>
              <button onClick={() => onIndex(null)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Fermer"><X size={22} /></button>
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-[calc(env(safe-area-inset-bottom)+1rem)]" onClick={() => onIndex(null)}>
            {p.mime.startsWith('image/')
              ? url ? <motion.img key={url} src={url} alt="" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
                : <span className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
              : <button onClick={(e) => { e.stopPropagation(); download(`/attachments/${p.id}`) }} className="flex flex-col items-center gap-3 rounded-2xl bg-white/10 px-8 py-6 text-white"><FileText size={40} />Ouvrir le document</button>}
            {items.length > 1 && (
              <>
                <NavBtn side="left" disabled={index === 0} onClick={() => onIndex(index - 1)} />
                <NavBtn side="right" disabled={index === items.length - 1} onClick={() => onIndex(index + 1)} />
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function NavBtn({ side, disabled, onClick }: { side: 'left' | 'right'; disabled: boolean; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick() }} aria-label={side === 'left' ? 'Précédent' : 'Suivant'}
      className={cls('absolute top-1/2 hidden -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20 disabled:opacity-20 sm:block', side === 'left' ? 'left-4' : 'right-4')}>
      <Icon size={24} />
    </button>
  )
}
