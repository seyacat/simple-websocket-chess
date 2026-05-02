# Closer Click Chess

Ajedrez 1-on-1 sobre el proxy WebSocket de Closer Click. Vue 3 + Vite + Pinia + Phaser 3 (renderizado del tablero).

🌐 Producción: **https://seyacat.github.io/simple-websocket-chess/**

## Características

- **Multijugador en tiempo real** sobre `wss://proxy.closer.click`.
- **Lobby público**: el host se publica en el canal `chess_hosts`; los guests lo ven aparecer/desaparecer en tiempo real (eventos `joined` / `left`).
- **Lobby privado**: el host mantiene su token, los guests lo ingresan manualmente.
- **Reglas de ajedrez completas** + cronómetros + tablero Phaser.
- **Identidad cross-app** vía vault (mismo keypair que chat).
- **Reputación firmada con web of trust**: tras emparejar host/guest, cada lado verifica la pubkey del otro (handshake ECDSA P-256) y luego intercambian endorsements. El header muestra el badge ★ del oponente; click abre el modal para calificar.

## Stack y dependencias

```jsonc
{
  "@gatoseya/closer-click-proxy-client": "^0.1.1",
  "@gatoseya/closer-click-identity":     "^0.4.0",
  "vue": "^3", "pinia": "^3", "phaser": "^3"
}
```

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:3000
npm run build
```

`.env` (basado en `.env.example`):

```
VITE_WS_URL=wss://proxy.closer.click
VITE_WS_RECONNECT_DELAY=3000
VITE_WS_MAX_RECONNECT_ATTEMPTS=5
VITE_WS_LOBBY_REFRESH_INTERVAL=60000   # respaldo; updates en tiempo real ya mantienen el lobby
VITE_GAME_NAME=simple-chess
VITE_DEFAULT_BOARD_SIZE=800
```

## Arquitectura

### Stores

- `connectionStore` — proxy WebSocket + identidad. Estado: `mode` (host/guest), `subscribedHost`, `subscribers`, `peerIdentities` (Map<token, {pubkey, peer}>), `trustMap` (mis ratings), `myPubkey`, `myNickname`.
- `gameStore` / `hostGameStore` / `playerGameStore` / `sharedGameLogic` — estado autoritativo del juego, lógica del host y del player.

Los game stores se suscriben a `proxyClient.on('message', …)`. El `connectionStore` intercepta antes los tipos de identidad/rating (`IDENTIFY_*`, `RATING_*`) y los maneja centralmente; los game stores ven sólo el resto.

### Flujo de juego

```
Host crea juego        Guest se une
  publica `chess_hosts`   se conecta con token del host
       │                       │
       ▼                       ▼
  setSubscribedHost / addSubscriber
       │                       │
       ├──── handshake ECDSA ──┤
       │                       │
       ├── RATING_QUERY ── (a otros peers conocidos)
       │
       ▼
  juego empieza, mensajes MOVE / SEAT_REQUEST / etc.
```

### Componentes de identidad

- `components/identity/UserSettingsModal.vue` — editar nickname, exportar/importar identidad.
- `components/identity/PeerRatingModal.vue` — calificar al oponente, ver endorsements firmadas, suspicion modifier.

El header (`App.vue`) integra:

- Botón `@nickname` → abre UserSettingsModal.
- Botón "Oponente" con badge ★ (amarillo si tu rating, azul si derivado de endorsements de gente que tú calificas).

### Reputación

Misma mecánica que en chat:

- Cada rating es un envelope firmado: `{subject, rating, notes, ratedBy, issuedAt, signature}`.
- Endorsements de extraños se ignoran.
- Peso de un endorsement = `miRating(emisor) / 5`.
- Vault dedupea por `(ratedBy, subject)` y limita a 50 endorsements por subject.

## Deploy

GitHub Actions en `.github/workflows/deploy.yml` publica `dist/` a GitHub Pages al hacer push a `main`.

## Estructura

```
src/
├── App.vue                       header con identidad, oponente, nav
├── components/
│   ├── chess/PhaserChessGame.vue
│   ├── connection/ConnectionPanel.vue (legacy)
│   ├── identity/
│   │   ├── UserSettingsModal.vue
│   │   └── PeerRatingModal.vue
│   └── lobby/
│       ├── LobbyView.vue
│       ├── HostGameView.vue
│       └── GuestWaitingView.vue
├── stores/
│   ├── connectionStore.js        proxy + identidad + trustMap
│   ├── gameStore.js
│   ├── hostGameStore.js
│   ├── playerGameStore.js
│   └── sharedGameLogic.js
├── utils/
│   └── rating.js                 computeDerivedRating (mismo helper que chat)
└── ...
```

## Licencia

MIT
