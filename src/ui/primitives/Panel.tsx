import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  /** Elementos a la derecha del título (botones, badges). */
  actions?: ReactNode
  /** Sin padding interno (para listas que scrollean). */
  flush?: boolean
  glass?: boolean
}

export function Panel({ title, actions, flush, glass, className, children, ...rest }: PanelProps) {
  return (
    <section
      className={cn(
        'flex flex-col rounded-xl border border-line bg-bg-elev/80 shadow-panel',
        glass && 'glass',
        className,
      )}
      {...rest}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          {title && <h2 className="text-sm font-bold tracking-wide text-ink">{title}</h2>}
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className={cn('min-h-0 flex-1', !flush && 'p-4')}>{children}</div>
    </section>
  )
}
