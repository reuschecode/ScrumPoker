/** Une clases condicionalmente (mini clsx). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/** Hash determinista 32 bits (FNV-1a) para derivar colores/avatares. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Paleta de avatares (tono, saturación, luminosidad) agradable sobre fondo oscuro. */
export const AVATAR_HUES = [262, 200, 165, 20, 330, 45, 290, 120, 230, 5] as const

export function avatarColor(id: string): { bg: string; fg: string; ring: string } {
  const hue = AVATAR_HUES[hashString(id) % AVATAR_HUES.length]
  return {
    bg: `hsl(${hue} 55% 42%)`,
    fg: `hsl(${hue} 90% 95%)`,
    ring: `hsl(${hue} 70% 60% / 0.55)`,
  }
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('es', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

/** Enlace para compartir la mesa. */
export function tableLink(code: string): string {
  if (typeof window === 'undefined') return `/t/${code}`
  return `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/t/${code}`
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}
