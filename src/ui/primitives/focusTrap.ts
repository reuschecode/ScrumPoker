const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]'

/** Mantiene Tab dentro de `container` (modales y drawers). Llamar desde un listener de keydown. */
export function trapTabFocus(e: KeyboardEvent, container: HTMLElement | null): void {
  if (e.key !== 'Tab' || !container) return
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0 && el.getClientRects().length > 0,
  )
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) {
    e.preventDefault()
    return
  }
  const active = document.activeElement
  if (!container.contains(active)) {
    e.preventDefault()
    first.focus()
  } else if (e.shiftKey && (active === first || active === container)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}
