# Scrum Poker — Arquitectura y guía para implementadores

Aplicación **frontend** (Vite + React 19 + TypeScript estricto + Tailwind v4 + framer-motion +
lucide-react + zustand) para puntuar historias de usuario con Planning Poker. No hay backend:
la mesa vive en el navegador del creador (host) y los demás se conectan a él.

Toda la copia visible al usuario va **en español** (tuteo, tono cercano y breve).

## 1. Modelo: mesa host-autoritativa

```
   cliente A ──┐                         ┌── cliente C
               ├──►  HOST (creador)  ◄───┤
   cliente B ──┘   reducer + estado      └── cliente D
                   difunde proyecciones
```

* **Comandos** (`Command`, `src/domain/types.ts`): intención de un usuario. El cliente los envía al
  host; el host les estampa `by` (del `hello` autenticado) y `at` (`Date.now()`), los aplica con
  `reduce()` y difunde a cada cliente `projectStateFor(state, viewerId)` + `events`.
* **Comandos de sistema** (`SystemCommand`): JOIN / DISCONNECT / LEAVE, solo los genera el host.
* **Proyección**: antes de revelar, los votos ajenos viajan como `HIDDEN_VOTE` ('•'); el propio siempre
  se ve. Tras revelar, todos los valores. Nunca viajan secretos.
* **Eventos** (`DomainEvent`): los produce el reducer; alimentan sonidos, toasts y animaciones.
* **Transportes** (`TransportKind`): `local` (BroadcastChannel, pestañas del mismo navegador) y `peer`
  (WebRTC con PeerJS, entre dispositivos). Se elige con `VITE_TRANSPORT` (`src/lib/env.ts`).
* **Identidad**: `{ id, secret, name }` en localStorage (`src/store/identity.ts`). El host guarda
  `secret` por `id` en el primer JOIN; una reconexión con secreto distinto se rechaza (`bad-secret`).
* **Resiliencia**: el host persiste su estado en `localStorage` (`sp:host:<CODE>`) para sobrevivir a un
  refresh; los clientes reintentan con backoff si pierden la conexión. Un participante desconectado se
  marca `connected=false` y se retira tras `DISCONNECT_GRACE_MS`; si vuelve antes conserva voto y rol.

## 2. Mapa de archivos y responsables

```
src/
  domain/           (agente DOMINIO)  tipos [listo], reducer, mazos, estadísticas, proyección, tests
  net/              (agente RED)      protocolo [listo], transports (local, peer), hostSession, clientSession
  store/            (agente RED)      identity [listo], tableStore, hooks (useTable), eventBus, recentTables
  sound/            (agente SONIDO)   engine (WebAudio sintetizado), settings, useSoundEffects, SoundToggle
  ui/primitives/    [listo]           Button, IconButton, Input, Panel, Avatar, Badge, Modal
  ui/toast/         [toastStore listo] Toaster (agente SHELL), useEventToasts (agente SOCIAL)
  ui/pages/         (agente SHELL)    Home, TablePage
  ui/components/    (agente MESA)     table/*   (agente SOCIAL) chat/*, history/*, reactions/*
  lib/              [listo]           ids, utils (cn, initials, avatarColor, tableLink, copyToClipboard), env
  styles/index.css  [listo]           tokens @theme + utilidades (glass, preserve-3d, text-gradient…)
  main.tsx, App.tsx (agente SHELL)
```

Convenciones:
* Imports con alias `@/` (p. ej. `@/domain/types`). TS estricto, sin `any`, sin `// @ts-ignore`.
* Estilos con clases Tailwind y los tokens de `styles/index.css` (`bg-bg`, `bg-bg-elev`, `bg-surface`,
  `bg-surface-2`, `border-line`, `text-ink`, `text-ink-2`, `text-ink-3`, `text-accent`, `bg-accent`,
  `bg-accent-soft`, `text-mint`, `bg-mint-soft`, `text-warn`, `text-danger`, `bg-danger-soft`,
  `bg-felt`, `shadow-card`, `shadow-glow`, `shadow-panel`, `rounded-xl`…). Nada de CSS-in-JS.
* Animaciones con `framer-motion` (`import { motion, AnimatePresence } from 'framer-motion'`).
  Preferir `layout`, springs suaves (`type: 'spring', stiffness: 300-420, damping: 26-34`) y respetar
  `useReducedMotion()`.
* Iconos: `lucide-react`, tamaño `size-4`/`size-5`, `strokeWidth={1.75}` para un look ligero.
* Los componentes de UI leen el estado con `useTable()` (`src/store/hooks.ts`), no reciben el estado
  por props; así cada componente es autosuficiente y las páginas solo componen.

## 3. Contratos (resumen; la fuente de verdad son los archivos)

### `src/domain/*` (exports que la UI y la red consumen)
```ts
// deck.ts
export const DECKS: Record<DeckId, Deck>
export const DECK_LIST: Deck[]
export function getDeck(id: DeckId): Deck
export function isCardOf(deck: Deck, value: string): boolean
export function cardNumericValue(value: string): number | null   // '½' → 0.5; '?','☕', tallas → null
// stats.ts
export function computeStats(votes: Record<UserId,string>, deck: Deck): VoteStats
// table.ts
export function createTableState(opts: { code; name; host: { id; name }; deck: DeckId; now: number }): TableState
// reducer.ts
export function reduce(state: TableState, action: Action): ReduceResult   // puro; nunca lanza
// projection.ts
export function projectStateFor(state: TableState, viewerId: UserId): TableState
// selectors.ts
export function isAdmin(state, userId): boolean
export function isHost(state, userId): boolean
export function getParticipant(state, userId): Participant | undefined
export function votedIds(state): UserId[]
export function allVoted(state): boolean   // todos los participantes conectados han votado
```

### `src/store/*`
```ts
// tableStore.ts
export const useTableStore  // zustand
interface TableStore {
  session: Session | null
  snapshot: SessionSnapshot | null
  createTable(opts: { tableName: string; deck: DeckId }): Promise<string>  // devuelve el código; ya conectado
  joinTable(code: string): Promise<void>  // si localStorage tiene `sp:host:<code>` con hostId === yo → re-hostear
  dispatch(cmd: Command): void
  leaveTable(): void
}
// hooks.ts
export function useTable(): {
  status: ConnectionStatus; state: TableState | null; code: string | null; me: UserId
  role: 'host' | 'client' | null; isHost: boolean; isAdmin: boolean
  deck: Deck | null; myVote: string | null; participants: Participant[]
  dispatch(cmd: Command): void; lastError: SessionSnapshot['lastError']
}
// eventBus.ts
export const eventBus: { subscribe(cb: (events: DomainEvent[], state: TableState) => void): () => void; emit(...) }
// recentTables.ts
export function listRecentTables(): Array<{ code; name; role: 'host'|'client'; at: number }>
export function rememberTable(entry): void
export function forgetTable(code): void
```

### `src/sound/*`
```ts
export type SoundName = 'vote' | 'voteOther' | 'reveal' | 'newRound' | 'reset' | 'join' | 'leave' | 'kick'
  | 'kicked' | 'chat' | 'reaction' | 'close' | 'adminGranted' | 'error' | 'click'
export function playSound(name: SoundName): void
export function unlockAudio(): void                       // llamar en el primer gesto del usuario
export const useSoundSettings  // zustand { muted: boolean; volume: number; toggleMuted(); setVolume() } persistido
export function useSoundEffects(): void                   // hook: eventBus → playSound (montar una vez en TablePage)
export function SoundToggle(): JSX.Element               // IconButton Volume2/VolumeX
```

## 4. Especificación de UX

### Home (`/`)
* Hero breve: título "Scrum Poker" con `text-gradient`, subtítulo.
* Dos tarjetas lado a lado (apiladas en móvil):
  1. **Crear mesa**: tu nombre (prefill `useIdentity`), nombre de la mesa, selector de mazo (DECK_LIST,
     muestra las cartas), botón "Crear mesa" → `createTable` → `navigate('/t/CODE')`.
  2. **Unirse a una mesa**: tu nombre, código (6 caracteres, `normalizeTableCode`, mayúsculas, mono),
     botón "Entrar" → `navigate('/t/CODE')`.
* "Mesas recientes" (`listRecentTables`) con chips clicables si hay.
* Validaciones inline (nombre vacío, código inválido). Enter envía.

### Mesa (`/t/:code`)
* Si no hay nombre en la identidad → `Modal` no descartable "¿Cómo te llamas?" antes de conectar.
* `TablePage` monta `useSoundEffects()` y `useEventToasts()`, llama `joinTable(code)` al entrar y
  `leaveTable()` al desmontar.
* **Overlays por estado**: `connecting` (spinner + "Conectando a la mesa…"), `reconnecting` (banner
  superior ámbar "Se perdió la conexión. Reintentando…"), `not-found` ("Esta mesa no existe o el
  anfitrión no está conectado" + botón volver), `kicked` ("Te expulsaron de la mesa"), `closed`
  ("La mesa fue cerrada"), `error`.
* **Header** (glass, sticky): logo/nombre de la mesa (admins: `EditableText` inline, lápiz al hover) ·
  código en mono + botón "Copiar enlace" (toast "Enlace copiado") · a la derecha: `SoundToggle`, tu
  avatar + nombre editable (`SET_NAME` + `useIdentity.setName`), botón "Salir" (host: "Cerrar mesa",
  con confirmación).
* **Layout**: columna principal (mesa) + panel lateral derecho de 360px con pestañas **Chat** /
  **Historial** (en < 1024px el panel es un drawer que se abre con botones del header; badge con
  mensajes no leídos).
* **Columna principal**, de arriba abajo:
  1. `StoryBar`: "Ronda N" + nombre de la historia. Admin: input inline editable (`SET_STORY`, guarda
     al blur/Enter, debounce opcional); no admin: texto. Si está vacío: "Sin historia — pide a un admin
     que la escriba" / para admin placeholder "¿Qué historia estamos puntuando?".
  2. `PokerTable`: óvalo de fieltro (`bg-felt`, borde `felt-edge`, sombra interior) centrado; los
     asientos (`Seat`) se distribuyen alrededor con trigonometría (el usuario actual siempre abajo en
     el centro, el resto en sentido horario por orden de ingreso). Con `layout` + `AnimatePresence`
     para entradas/salidas (entrada: scale 0.6→1 + fade; salida: fade + scale). En < 640px, los
     asientos pasan a una cuadrícula `flex-wrap` bajo un óvalo más pequeño.
     En el centro del óvalo: estado de la ronda ("Esperando votos… 3/5", "¡Todos votaron!",
     "Votos revelados") y, para admin, los botones principales (`AdminBar`).
  3. `VotingDeck` (abajo, tipo "mano de cartas"): una carta por valor del mazo; la seleccionada se
     eleva (`y: -12`, `shadow-glow`); clic → `VOTE`; clic en la seleccionada → `CLEAR_VOTE`.
     Deshabilitado (opacity) tras revelar. `whileHover={{ y: -6 }}`, `whileTap={{ scale: 0.96 }}`.
  4. `ReactionBar`: fila de emojis (`REACTION_EMOJIS`) → `REACT`; cooldown local 600 ms.
* `Seat`: avatar (`Avatar`), nombre (truncado), iconos: corona `Crown` (host), escudo `ShieldCheck`
  (admin), punto gris + "desconectado" si `!connected`. Encima, la **carta** del participante:
  - sin voto: contorno punteado vacío;
  - con voto no revelado: dorso de carta (`bg-card-back` con patrón) + check pequeño;
  - revelado: volteo 3D (`rotateY` 180→0, stagger 60 ms por asiento) mostrando el valor en grande.
  - el propio asiento muestra el valor elegido aun sin revelar (la proyección ya lo permite).
  Burbuja de reacción: emoji grande que aparece sobre el avatar con spring y desaparece a los
  `REACTION_TTL_MS` (clave `reaction.at` para re-animar). Pulso sutil en el asiento al votar.
  Menú de admin (al hover/clic en `MoreHorizontal`, no sobre uno mismo ni sobre el host para
  expulsar): "Hacer admin" / "Quitar admin", "Expulsar" (confirmación en `Modal`).
* `AdminBar` (solo admins): antes de revelar → **Revelar votos** (deshabilitado si 0 votos; pista
  "Faltan: Ana, Luis") y "Reiniciar votación" (ghost). Tras revelar → `ResultsPanel`.
* `ResultsPanel` (visible para todos tras revelar): distribución por valor con barras animadas
  (`motion.div` `scaleX` desde 0), promedio, mediana, moda, badge "Consenso" en menta si aplica, lista
  de quién votó qué. Para admin: formulario **Puntaje final** (select con las cartas del mazo, prefill
  `stats.suggested`, o campo libre corto) + "Siguiente historia" (opcional) + botón **Guardar y
  nueva ronda** (`FINISH_ROUND`) + "Volver a votar" (`RESET_ROUND`).
* `ChatPanel`: lista con scroll automático al fondo (si el usuario estaba abajo), burbujas propias a
  la derecha (acento) y ajenas a la izquierda (surface) con avatar/nombre/hora; input + botón enviar;
  Enter envía, Shift+Enter nueva línea; contador de no leídos cuando el panel está cerrado.
* `HistoryPanel`: tabla/lista de `history` (más reciente primero): N, historia, **puntaje final**
  destacado, sugerido/promedio, chip de votos al expandir; total de puntos acumulados; botón "Exportar
  CSV" (descarga `historial-CODE.csv`). Vacío: "Aún no hay rondas cerradas".
* Toasts (`useEventToasts`): "Ana se unió", "Luis salió", "Pedro fue expulsado", "Ahora eres
  administrador", "Mesa renombrada", "Ronda 3 guardada: 5 puntos", errores de dominio (`lastError`).

## 5. Sonidos (WebAudio sintetizado, sin archivos)
| evento | sonido |
|---|---|
| vote.cast (propio) | `vote`: tick corto (sine 660→440 Hz, 70 ms) |
| vote.cast (ajeno) | `voteOther`: pop suave (triangle 300→520 Hz, 90 ms, volumen bajo) |
| round.revealed | `reveal`: whoosh (ruido filtrado 250 ms) + acorde ascendente (C5-E5-G5) |
| round.finished | `newRound`: ding doble ascendente |
| round.reset | `reset`: nota descendente corta |
| participant.joined | `join`: pop ascendente |
| participant.left | `leave`: pop descendente |
| participant.kicked (otro) | `kick`: golpe grave (sine 120 Hz, decay 300 ms) |
| participant.kicked (yo) | `kicked`: dos notas descendentes graves |
| chat.message (ajeno) | `chat`: blip corto |
| reaction | `reaction`: pop muy corto y agudo |
| table.closed | `close`: tres notas descendentes |
| admin.granted (a mí) | `adminGranted`: fanfarria de dos notas |
| error de dominio | `error`: buzz corto |
Volumen maestro ~0.35, mute persistido en localStorage (`sp:sound`). `unlockAudio()` en el primer
`pointerdown`/`keydown` del documento. Nunca sonar durante el primer snapshot (`welcome`).

## 6. Pruebas
* `npm run typecheck`, `npm test` (vitest, reducer y stats), `npm run build`.
* Manual: `npm run dev` (transporte `local`) y abrir 2-3 pestañas en `/t/CODE`.
