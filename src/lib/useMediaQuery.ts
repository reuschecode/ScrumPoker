import { useCallback, useSyncExternalStore } from 'react'

export const DESKTOP_QUERY = '(min-width: 1024px)'
export const MOBILE_QUERY = '(max-width: 639px)'

const canMatch = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function'

/** true cuando la media query coincide; se actualiza al cambiar el viewport. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!canMatch()) return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  const getSnapshot = useCallback(() => (canMatch() ? window.matchMedia(query).matches : false), [query])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
