import { useEffect, useState } from 'react'

/**
 * Reloj local que avanza cada `tickMs` mientras `until` (timestamp) esté en el futuro.
 * Sin `until` (o ya vencido) no hay intervalo: no cuesta nada cuando no hay nada que expirar.
 * El último tick siempre deja `now >= until`, así el consumidor ve el vencimiento.
 */
export function useNow(tickMs: number, until: number | null): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (until === null || Date.now() >= until) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= until) clearInterval(id)
    }, tickMs)
    return () => clearInterval(id)
  }, [tickMs, until])

  return now
}
