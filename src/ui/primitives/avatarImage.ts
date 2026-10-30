import { useEffect, useState } from 'react'
import type { Style } from '@dicebear/core'
import type { AvatarStyleId } from '@/domain/avatars'

type StyleDefinition = ConstructorParameters<typeof Style>[0]
type DrawnStyleId = Exclude<AvatarStyleId, 'initials'>

// Cada estilo es su propio chunk: solo se descarga el que la mesa usa o el selector muestra.
const LOADERS: Record<DrawnStyleId, () => Promise<{ default: unknown }>> = {
  thumbs: () => import('@dicebear/styles/thumbs.json'),
  'adventurer-neutral': () => import('@dicebear/styles/adventurer-neutral.json'),
  'avataaars-neutral': () => import('@dicebear/styles/avataaars-neutral.json'),
  'big-smile': () => import('@dicebear/styles/big-smile.json'),
  bottts: () => import('@dicebear/styles/bottts.json'),
  'fun-emoji': () => import('@dicebear/styles/fun-emoji.json'),
  lorelei: () => import('@dicebear/styles/lorelei.json'),
  micah: () => import('@dicebear/styles/micah.json'),
  'notionists-neutral': () => import('@dicebear/styles/notionists-neutral.json'),
  personas: () => import('@dicebear/styles/personas.json'),
  'pixel-art': () => import('@dicebear/styles/pixel-art.json'),
  shapes: () => import('@dicebear/styles/shapes.json'),
}

const styles = new Map<DrawnStyleId, Promise<Style>>()
const images = new Map<string, string>()

function loadStyle(id: DrawnStyleId): Promise<Style> {
  let pending = styles.get(id)
  if (!pending) {
    pending = Promise.all([import('@dicebear/core'), LOADERS[id]()]).then(
      ([core, m]) => new core.Style(m.default as StyleDefinition),
    )
    // Si falla la descarga, se permite reintentar en el próximo render.
    pending.catch(() => styles.delete(id))
    styles.set(id, pending)
  }
  return pending
}

/** Genera el avatar. Es determinista: un mismo usuario siempre se ve igual dentro de un estilo. */
export async function renderAvatar(id: DrawnStyleId, seed: string): Promise<string> {
  const key = `${id}:${seed}`
  const cached = images.get(key)
  if (cached) return cached
  const [core, style] = await Promise.all([import('@dicebear/core'), loadStyle(id)])
  const uri = new core.Avatar(style, { seed }).toDataUri()
  images.set(key, uri)
  return uri
}

/** Devuelve la imagen, o null con 'initials', mientras carga o si falla: entonces se ven las iniciales. */
export function useAvatarImage(style: AvatarStyleId, seed: string): string | null {
  const key = `${style}:${seed}`
  const [loaded, setLoaded] = useState<{ key: string; uri: string } | null>(null)

  useEffect(() => {
    if (style === 'initials' || images.has(key)) return
    let alive = true
    renderAvatar(style, seed)
      .then((uri) => {
        if (alive) setLoaded({ key, uri })
      })
      .catch(() => {
        /* sin red para el chunk: se mantienen las iniciales */
      })
    return () => {
      alive = false
    }
  }, [style, seed, key])

  if (style === 'initials') return null
  return images.get(key) ?? (loaded?.key === key ? loaded.uri : null)
}
