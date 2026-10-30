# Scrum Poker

Mesa de **Planning Poker** en tiempo real para puntuar historias de usuario con tu equipo.
Es una aplicación 100 % frontend: no necesita backend ni registro. La mesa vive en el navegador
de quien la crea y el resto del equipo se conecta con un enlace o con el código de la mesa.

## Funcionalidades

- **Mesa visual**: los participantes se sientan alrededor de una mesa; cada uno muestra su carta
  boca abajo al votar y las cartas se voltean al revelar.
- **Compartir**: enlace directo (`/t/CÓDIGO`) o código de 6 caracteres para entrar.
- **Roles**: quien crea la mesa es el anfitrión y administrador; puede nombrar administradores.
  Los administradores revelan los votos, reinician la votación, pasan de ronda y expulsan
  participantes. El anfitrión además renombra la mesa y la cierra.
- **Rondas con historia de usuario**: cada ronda lleva el nombre de la HU que se está puntuando.
- **Puntaje final decidido por un administrador**: al cerrar la ronda se guarda la HU con el
  puntaje que el equipo decida (sugerido automáticamente a partir de los votos).
- **Historial** de rondas con votos, promedio, sugerido y puntaje final; exportable a CSV.
- **Nombres editables**: cada participante elige y edita su nombre.
- **Chat** de la mesa, **reacciones** con emojis que aparecen sobre cada participante,
  **sonidos** sintetizados para cada acción y **animaciones** suaves con framer-motion.
- Iconos ligeros de [lucide](https://lucide.dev).

## Cómo correrlo

Requisitos: Node 20+.

```bash
npm install
```

Desarrollo en una sola máquina (varias pestañas del mismo navegador se ven entre sí):

```bash
npm run dev
```

Abre `http://localhost:5173` y crea una mesa. Todas las pestañas de un navegador comparten identidad,
así que para entrar como otro participante abre el enlace en otra pestaña añadiendo `?guest`:
`http://localhost:5173/t/CÓDIGO?guest`.

Para probar entre dispositivos durante el desarrollo:

```bash
VITE_TRANSPORT=peer npm run dev -- --host
```

Build de producción (usa WebRTC entre dispositivos; se puede servir como sitio estático):

```bash
npm run build
```

Otros scripts: `npm run typecheck`, `npm test`, `npm run preview`.

## Cómo funciona

```
cliente A ─┐                           ┌─ cliente C
           ├──►  ANFITRIÓN (creador) ◄─┤
cliente B ─┘   estado + reducer puro   └─ cliente D
               difunde proyecciones
```

- El navegador del anfitrión guarda el estado real de la mesa y aplica cada comando con un
  reducer puro (`src/domain/reducer.ts`). A cada cliente le envía una *proyección* en la que los
  votos ajenos van ocultos hasta que se revelan.
- Transportes intercambiables (`VITE_TRANSPORT`):
  - `local`: `BroadcastChannel`, pestañas del mismo navegador (por defecto en `npm run dev`).
  - `peer`: WebRTC con [PeerJS](https://peerjs.com) y su servidor público de señalización
    (por defecto en el build de producción). Funciona entre dispositivos sin backend propio.
- El anfitrión persiste la mesa en `localStorage`: si cierra la pestaña o recarga, la mesa se pausa
  y se reanuda al volver a abrir el mismo enlace. Los clientes se reconectan solos.
- Cada navegador tiene una identidad local (`id` + secreto) para que los roles y las expulsiones se
  mantengan al reconectar sin posibilidad de suplantación.

Más detalle en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Estructura

```
src/
  domain/   tipos, reducer puro, mazos, estadísticas, proyección (con tests)
  net/      protocolo, transportes (local / peer), sesiones de anfitrión y cliente
  store/    identidad local, store de la mesa (zustand), hooks, bus de eventos
  sound/    motor de sonido sintetizado (Web Audio) y mapeo de eventos a sonidos
  ui/       páginas, componentes de la mesa, chat, historial, reacciones, toasts, primitivas
  styles/   tokens de diseño (Tailwind v4)
```

## Limitaciones conocidas

- Si el anfitrión cierra el navegador, la mesa queda pausada hasta que vuelva (no hay servidor).
- El transporte `peer` depende del servidor público de PeerJS para el *handshake* inicial y de que
  la red permita WebRTC (la mayoría de redes domésticas y de oficina lo permiten).
