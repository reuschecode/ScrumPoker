/** Estilos de avatar que puede elegir un admin. El dominio solo conoce los ids; la UI los dibuja. */
export const AVATAR_STYLES = [
  { id: 'thumbs', label: 'Pulgares' },
  { id: 'adventurer-neutral', label: 'Aventura' },
  { id: 'avataaars-neutral', label: 'Avataaars' },
  { id: 'big-smile', label: 'Sonrisas' },
  { id: 'bottts', label: 'Robots' },
  { id: 'fun-emoji', label: 'Emojis' },
  { id: 'lorelei', label: 'Lorelei' },
  { id: 'micah', label: 'Micah' },
  { id: 'notionists-neutral', label: 'Notion' },
  { id: 'personas', label: 'Personas' },
  { id: 'pixel-art', label: 'Píxeles' },
  { id: 'shapes', label: 'Formas' },
  { id: 'initials', label: 'Iniciales' },
] as const

export type AvatarStyleId = (typeof AVATAR_STYLES)[number]['id']

export const DEFAULT_AVATAR_STYLE: AvatarStyleId = 'thumbs'

export function isAvatarStyleId(x: unknown): x is AvatarStyleId {
  return AVATAR_STYLES.some((s) => s.id === x)
}

/** Las mesas guardadas antes de existir esta opción no traen estilo. */
export function resolveAvatarStyle(x: unknown): AvatarStyleId {
  return isAvatarStyleId(x) ? x : DEFAULT_AVATAR_STYLE
}
