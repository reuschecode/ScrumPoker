import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Link2 } from 'lucide-react'
import { copyToClipboard, cn, tableLink } from '@/lib/utils'
import { useToastStore } from '@/ui/toast/toastStore'
import { Button, IconButton } from '@/ui/primitives'

export interface ShareCodeProps {
  code: string
  /** Solo iconos (para el header en móvil). */
  compact?: boolean
  className?: string
}

type Copied = 'link' | 'code' | null

/** Código de la mesa en mono + copiar enlace / copiar código, con toast de confirmación. */
export function ShareCode({ code, compact = false, className }: ShareCodeProps) {
  const push = useToastStore((s) => s.push)
  const [copied, setCopied] = useState<Copied>(null)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  const flash = (what: Exclude<Copied, null>) => {
    setCopied(what)
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      setCopied(null)
    }, 1600)
  }

  const copy = async (what: Exclude<Copied, null>) => {
    const ok = await copyToClipboard(what === 'link' ? tableLink(code) : code)
    if (ok) {
      flash(what)
      push({
        title: what === 'link' ? 'Enlace copiado' : 'Código copiado',
        description: what === 'link' ? 'Compártelo con tu equipo para que entren a la mesa.' : `Código ${code}`,
        tone: 'mint',
        emoji: what === 'link' ? '🔗' : '#️⃣',
      })
    } else {
      push({
        title: 'No se pudo copiar',
        description: what === 'link' ? 'Copia el enlace desde la barra del navegador.' : `El código es ${code}.`,
        tone: 'danger',
      })
    }
  }

  const spacedCode = code.split('').join(' ')

  return (
    <div
      className={cn(
        'inline-flex h-10 items-center gap-1 rounded-lg border border-line bg-surface/60 pl-2.5 pr-1',
        className,
      )}
    >
      <span className="hidden text-[10px] font-semibold uppercase tracking-wider text-ink-3 sm:inline">Mesa</span>
      <span
        className="tabular font-mono text-sm font-bold tracking-[0.3em] text-ink"
        aria-label={`Código de mesa ${spacedCode}`}
        title="Código de la mesa"
      >
        {code}
      </span>
      <IconButton
        size="sm"
        label={copied === 'code' ? 'Código copiado' : 'Copiar código'}
        icon={
          copied === 'code' ? (
            <Check className="size-4 text-mint" strokeWidth={2} />
          ) : (
            <Copy className="size-4" strokeWidth={1.75} />
          )
        }
        onClick={() => void copy('code')}
      />
      {compact ? (
        <IconButton
          size="sm"
          label={copied === 'link' ? 'Enlace copiado' : 'Copiar enlace'}
          icon={
            copied === 'link' ? (
              <Check className="size-4 text-mint" strokeWidth={2} />
            ) : (
              <Link2 className="size-4" strokeWidth={1.75} />
            )
          }
          onClick={() => void copy('link')}
        />
      ) : (
        <Button
          size="sm"
          variant="secondary"
          icon={
            copied === 'link' ? (
              <Check className="size-4 text-mint" strokeWidth={2} />
            ) : (
              <Link2 className="size-4" strokeWidth={1.75} />
            )
          }
          onClick={() => void copy('link')}
        >
          {copied === 'link' ? 'Copiado' : 'Copiar enlace'}
        </Button>
      )}
    </div>
  )
}
