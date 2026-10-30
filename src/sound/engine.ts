/**
 * Motor de sonido: todo sintetizado con Web Audio, sin archivos.
 *
 * - El AudioContext se crea perezosamente en `unlockAudio()` (dentro de un gesto del usuario,
 *   que es lo que exigen las políticas de autoplay). `playSound` nunca crea el contexto.
 * - `playSound` nunca lanza: sin contexto, silenciado, pestaña oculta o sin WebAudio → no hace nada.
 * - Anti-saturación: máximo 6 sonidos por 150 ms y nunca el mismo sonido dos veces en 60 ms.
 */
import type { SoundName } from './types'
import { useSoundSettings } from './settings'

/** Mínimo para rampas exponenciales (nunca 0 exacto). ≈ −80 dB, inaudible. */
const EPS = 0.0001
const MAX_SOUNDS_PER_WINDOW = 6
const WINDOW_MS = 150
const SAME_SOUND_GAP_MS = 60
/** Si `resume()` tarda más que esto, el sonido ya no tiene sentido y se descarta. */
const RESUME_GRACE_MS = 400
/** Pequeño margen para no programar en el pasado. */
const LEAD_S = 0.005

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null
let unsupported = false
let settingsBound = false

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

// ---------------------------------------------------------------------------
// Contexto
// ---------------------------------------------------------------------------

function audioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  if (typeof AudioContext !== 'undefined') return AudioContext
  // Safari antiguo expone solo el constructor con prefijo.
  const legacy = (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  return legacy ?? null
}

function bindSettings(): void {
  if (settingsBound) return
  settingsBound = true
  useSoundSettings.subscribe((s, prev) => {
    if (s.volume === prev.volume || !ctx || !master) return
    master.gain.setTargetAtTime(Math.max(EPS, s.volume), ctx.currentTime, 0.02)
  })
}

function ensureContext(): AudioContext | null {
  if (ctx && ctx.state !== 'closed') return ctx
  if (unsupported) return null
  const Ctor = audioContextCtor()
  if (!Ctor) {
    unsupported = true
    return null
  }
  try {
    const c = new Ctor({ latencyHint: 'interactive' })
    const g = c.createGain()
    g.gain.value = Math.max(EPS, useSoundSettings.getState().volume)
    g.connect(c.destination)
    ctx = c
    master = g
    // Si el sistema lo suspende o interrumpe más tarde (p. ej. iOS), reanudar requiere otro gesto.
    c.onstatechange = () => {
      if (c.state !== 'running' && c.state !== 'closed') installAudioUnlock()
    }
    noiseBuffer = null
    bindSettings()
    return c
  } catch {
    unsupported = true
    return null
  }
}

/** Crea/reanuda el contexto. Llamar dentro de un gesto del usuario. Nunca lanza. */
export function unlockAudio(): void {
  try {
    const c = ensureContext()
    if (!c || c.state === 'running' || c.state === 'closed') return
    void c.resume().catch(() => undefined)
  } catch {
    /* sin audio: la app sigue funcionando */
  }
}

const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'touchend', 'click'] as const
let unlockInstalled = false
let uninstallUnlock: (() => void) | null = null

/**
 * Registra una sola vez listeners de gesto en `document` que llaman a `unlockAudio()`.
 * Se retiran solos en cuanto el contexto queda `running` (si el primer gesto no bastó,
 * p. ej. un `touchstart` que el navegador no cuenta como activación, se sigue esperando).
 * Devuelve una función para desinstalarlos manualmente.
 */
export function installAudioUnlock(): () => void {
  if (typeof document === 'undefined') return () => undefined
  if (unlockInstalled) return uninstallUnlock ?? (() => undefined)
  if (ctx?.state === 'running') return () => undefined

  function remove(): void {
    for (const ev of UNLOCK_EVENTS) document.removeEventListener(ev, onGesture, true)
    unlockInstalled = false
    uninstallUnlock = null
  }
  function onGesture(): void {
    try {
      const c = ensureContext()
      if (!c) {
        remove()
        return
      }
      if (c.state === 'running') {
        remove()
        return
      }
      if (c.state === 'closed') return
      void c
        .resume()
        .then(() => {
          if (c.state === 'running') remove()
        })
        .catch(() => undefined)
    } catch {
      /* nunca lanza desde un listener global */
    }
  }
  for (const ev of UNLOCK_EVENTS) document.addEventListener(ev, onGesture, { capture: true, passive: true })
  unlockInstalled = true
  uninstallUnlock = remove
  return remove
}

// ---------------------------------------------------------------------------
// Síntesis: tono con ADSR corto + glide, y ráfaga de ruido filtrada
// ---------------------------------------------------------------------------

interface ToneSpec {
  type?: OscillatorType
  /** Frecuencia inicial (Hz). */
  freq: number
  /** Frecuencia final del glide (Hz). */
  to?: number
  /** Duración del glide (s); por defecto, toda la nota. */
  glide?: number
  /** Inicio relativo al comienzo del sonido (s). */
  at?: number
  /** Duración total (s), release incluido. */
  dur: number
  /** Pico de ganancia 0..1 (se multiplica por el volumen maestro). */
  peak?: number
  attack?: number
  decay?: number
  /** Nivel de sustain relativo al pico, 0..1. */
  sustain?: number
  release?: number
  /** Paso bajo (Hz) para suavizar ondas cuadradas. */
  lowpass?: number
}

function tone(c: AudioContext, out: AudioNode, t0: number, s: ToneSpec): void {
  const start = t0 + (s.at ?? 0)
  const end = start + s.dur
  const attack = Math.max(0.002, s.attack ?? 0.005)
  const release = Math.max(0.005, s.release ?? Math.min(0.06, s.dur / 2))
  const peak = Math.max(EPS, s.peak ?? 0.5)
  const sustain = Math.max(EPS, peak * (s.sustain ?? 1))

  const osc = c.createOscillator()
  osc.type = s.type ?? 'sine'
  osc.frequency.setValueAtTime(s.freq, start)
  if (s.to !== undefined && s.to !== s.freq) {
    osc.frequency.exponentialRampToValueAtTime(s.to, start + Math.min(s.glide ?? s.dur, s.dur))
  }

  const g = c.createGain()
  g.gain.setValueAtTime(EPS, start)
  g.gain.exponentialRampToValueAtTime(peak, start + attack)
  const decayEnd = start + attack + (s.decay ?? 0)
  if (s.decay) g.gain.exponentialRampToValueAtTime(sustain, decayEnd)
  const releaseStart = Math.max(decayEnd, end - release)
  g.gain.setValueAtTime(sustain, releaseStart)
  g.gain.exponentialRampToValueAtTime(EPS, end)

  const nodes: AudioNode[] = [osc, g]
  let head: AudioNode = osc
  if (s.lowpass) {
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = s.lowpass
    f.Q.value = 0.7
    head.connect(f)
    head = f
    nodes.push(f)
  }
  head.connect(g)
  g.connect(out)
  osc.onended = () => nodes.forEach((n) => n.disconnect())
  osc.start(start)
  osc.stop(end + 0.03)
}

interface NoiseSpec {
  at?: number
  dur: number
  peak?: number
  attack?: number
  /** Centro del paso banda al inicio (Hz). */
  freq: number
  /** Centro del paso banda al final (Hz): barrido. */
  to?: number
  q?: number
}

function getNoiseBuffer(c: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer
  const length = c.sampleRate // 1 s de ruido blanco, en bucle
  const buf = c.createBuffer(1, length, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  noiseBuffer = buf
  return buf
}

function noise(c: AudioContext, out: AudioNode, t0: number, s: NoiseSpec): void {
  const start = t0 + (s.at ?? 0)
  const end = start + s.dur
  const attack = Math.max(0.005, Math.min(s.attack ?? s.dur * 0.4, s.dur - 0.01))
  const peak = Math.max(EPS, s.peak ?? 0.3)

  const src = c.createBufferSource()
  src.buffer = getNoiseBuffer(c)
  src.loop = true

  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = s.q ?? 1
  f.frequency.setValueAtTime(s.freq, start)
  if (s.to !== undefined && s.to !== s.freq) f.frequency.exponentialRampToValueAtTime(s.to, end)

  const g = c.createGain()
  g.gain.setValueAtTime(EPS, start)
  g.gain.exponentialRampToValueAtTime(peak, start + attack)
  g.gain.exponentialRampToValueAtTime(EPS, end)

  src.connect(f)
  f.connect(g)
  g.connect(out)
  src.onended = () => [src, f, g].forEach((n) => n.disconnect())
  src.start(start)
  src.stop(end + 0.02)
}

/** Campanita: fundamental + segundo armónico tenue, con decaimiento natural. */
function ding(c: AudioContext, out: AudioNode, t0: number, freq: number, at: number, dur: number, peak = 0.32): void {
  tone(c, out, t0, { freq, at, dur, peak, attack: 0.004, decay: dur * 0.5, sustain: 0.35, release: dur * 0.4 })
  tone(c, out, t0, {
    freq: freq * 2,
    at,
    dur: dur * 0.6,
    peak: peak * 0.18,
    attack: 0.003,
    decay: dur * 0.3,
    sustain: 0.2,
    release: dur * 0.25,
  })
}

// Notas usadas (Hz)
const A4 = 440
const C5 = 523.25
const CS5 = 554.37
const E5 = 659.25
const G5 = 783.99
const A5 = 880
const D6 = 1174.66

type Design = (c: AudioContext, out: AudioNode, t0: number) => void

/** Un diseño por sonido. Duración ≤ 400 ms (reveal/close ≤ 700 ms). */
const DESIGNS: Record<SoundName, Design> = {
  // tick corto: sine 660→440 Hz, 70 ms
  vote: (c, o, t) => tone(c, o, t, { freq: 660, to: 440, glide: 0.06, dur: 0.07, peak: 0.45, release: 0.03 }),
  // pop suave y bajo: triangle 300→520 Hz, 90 ms
  voteOther: (c, o, t) =>
    tone(c, o, t, { type: 'triangle', freq: 300, to: 520, glide: 0.07, dur: 0.09, peak: 0.2, release: 0.04 }),
  // whoosh (ruido filtrado 250 ms) + acorde ascendente C5-E5-G5 → 680 ms
  reveal: (c, o, t) => {
    noise(c, o, t, { dur: 0.25, attack: 0.12, freq: 300, to: 2600, q: 0.9, peak: 0.3 })
    const chord: ToneSpec = { type: 'triangle', freq: C5, dur: 0.36, peak: 0.26, attack: 0.012, decay: 0.1, sustain: 0.55, release: 0.2 }
    tone(c, o, t, { ...chord, at: 0.1 })
    tone(c, o, t, { ...chord, freq: E5, at: 0.2 })
    tone(c, o, t, { ...chord, freq: G5, at: 0.3, dur: 0.38, peak: 0.3 })
  },
  // ding doble ascendente → 400 ms
  newRound: (c, o, t) => {
    ding(c, o, t, A5, 0, 0.2, 0.3)
    ding(c, o, t, D6, 0.14, 0.26, 0.32)
  },
  // nota descendente corta
  reset: (c, o, t) =>
    tone(c, o, t, { type: 'triangle', freq: 520, to: 330, glide: 0.14, dur: 0.18, peak: 0.3, release: 0.07 }),
  // pop ascendente
  join: (c, o, t) => tone(c, o, t, { freq: 380, to: 620, glide: 0.08, dur: 0.12, peak: 0.35, attack: 0.006, release: 0.05 }),
  // pop descendente
  leave: (c, o, t) => tone(c, o, t, { freq: 620, to: 380, glide: 0.09, dur: 0.12, peak: 0.3, release: 0.05 }),
  // golpe grave con decay de 300 ms (tipo bombo)
  kick: (c, o, t) =>
    tone(c, o, t, { freq: 160, to: 60, glide: 0.1, dur: 0.3, peak: 0.9, attack: 0.003, decay: 0.22, sustain: 0.12, release: 0.06 }),
  // dos notas descendentes graves → 380 ms
  kicked: (c, o, t) => {
    tone(c, o, t, { type: 'triangle', freq: 220, dur: 0.17, peak: 0.4, lowpass: 1200, release: 0.05 })
    tone(c, o, t, { type: 'triangle', freq: 165, at: 0.17, dur: 0.21, peak: 0.4, lowpass: 1200, release: 0.08 })
  },
  // blip corto
  chat: (c, o, t) => tone(c, o, t, { freq: 880, to: 1175, glide: 0.03, dur: 0.06, peak: 0.22, release: 0.03 }),
  // pop muy corto y agudo
  reaction: (c, o, t) => tone(c, o, t, { freq: 1300, to: 1900, glide: 0.03, dur: 0.05, peak: 0.2, release: 0.025 }),
  // tres notas descendentes (E5 · C#5 · A4) → 680 ms
  close: (c, o, t) => {
    ding(c, o, t, E5, 0, 0.24, 0.3)
    ding(c, o, t, CS5, 0.19, 0.24, 0.3)
    ding(c, o, t, A4, 0.38, 0.3, 0.32)
  },
  // fanfarria de dos notas (C5 → G5) → 400 ms
  adminGranted: (c, o, t) => {
    tone(c, o, t, { type: 'triangle', freq: C5, dur: 0.16, peak: 0.28, release: 0.05 })
    tone(c, o, t, { type: 'triangle', freq: G5, at: 0.12, dur: 0.28, peak: 0.3, decay: 0.1, sustain: 0.6, release: 0.14 })
    tone(c, o, t, { freq: G5 * 2, at: 0.12, dur: 0.2, peak: 0.07, release: 0.1 })
  },
  // buzz corto: dos cuadradas casi al unísono (batido) suavizadas con paso bajo
  error: (c, o, t) => {
    const buzz: ToneSpec = { type: 'square', freq: 140, dur: 0.16, peak: 0.16, lowpass: 900, attack: 0.004, release: 0.06 }
    tone(c, o, t, buzz)
    tone(c, o, t, { ...buzz, freq: 148 })
  },
  // tick de interfaz
  click: (c, o, t) => tone(c, o, t, { freq: 1600, to: 1100, glide: 0.03, dur: 0.04, peak: 0.18, attack: 0.002, release: 0.02 }),
}

// ---------------------------------------------------------------------------
// Reproducción
// ---------------------------------------------------------------------------

const recentPlays: number[] = []
const lastPlayByName = new Map<SoundName, number>()

/** Anti-saturación. Si acepta, registra la reproducción. */
function admit(name: SoundName): boolean {
  const t = now()
  const last = lastPlayByName.get(name)
  if (last !== undefined && t - last < SAME_SOUND_GAP_MS) return false
  while (recentPlays.length > 0 && t - recentPlays[0] > WINDOW_MS) recentPlays.shift()
  if (recentPlays.length >= MAX_SOUNDS_PER_WINDOW) return false
  recentPlays.push(t)
  lastPlayByName.set(name, t)
  return true
}

function schedule(c: AudioContext, name: SoundName): void {
  if (!master) return
  DESIGNS[name](c, master, c.currentTime + LEAD_S)
}

/** Reproduce un sonido. Nunca lanza; no hace nada sin contexto, silenciado o con la pestaña oculta. */
export function playSound(name: SoundName): void {
  try {
    const c = ctx
    if (!c || !master || c.state === 'closed') return
    if (useSoundSettings.getState().muted) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (!admit(name)) return
    if (c.state === 'running') {
      schedule(c, name)
      return
    }
    // Suspendido/interrumpido: intenta reanudar y suena solo si fue rápido (evita ráfagas tardías).
    const requestedAt = now()
    void c
      .resume()
      .then(() => {
        if (c.state !== 'running' || now() - requestedAt > RESUME_GRACE_MS) return
        if (useSoundSettings.getState().muted) return
        schedule(c, name)
      })
      .catch(() => undefined)
  } catch {
    /* el sonido es accesorio: nunca rompe la app */
  }
}
