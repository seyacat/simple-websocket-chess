# Diagrama de Arquitectura del Sistema

## Vista General del Sistema

```mermaid
graph TB
    subgraph "Frontend Vue.js (Cada Jugador)"
        A[App.vue] --> B[ConnectionPanel.vue]
        A --> C[ChessBoard.vue]
        A --> D[GameControls.vue]
        A --> E[MoveHistory.vue]
        
        B --> F[connectionStore]
        C --> G[gameStore]
        D --> G
        E --> G
        
        F --> H[WebSocketService]
        G --> H
    end
    
    subgraph "Servidor WebSocket Proxy"
        I[wss://closer.click:4000]
        I --> J[Token Manager]
        I --> K[Connection Manager]
        I --> L[Message Router]
    end
    
    H --> I
    
    subgraph "Almacenamiento Local"
        M[localStorage]
        F --> M
        G --> M
    end
    
    subgraph "Lógica del Juego"
        N[ChessGameService]
        G --> N
        N --> O[chessRules.js]
    end
```

## Flujo de Datos Detallado

### 1. Inicialización de Conexión
```mermaid
sequenceDiagram
    participant U as Usuario
    participant F as Frontend Vue
    participant WS as WebSocketService
    participant S as Servidor WS
    participant LS as localStorage

    U->>F: Abre aplicación
    F->>LS: Busca UUID guardado
    LS-->>F: UUID (si existe)
    F->>WS: connect(uuid)
    WS->>S: Conectar con/sin UUID
    S-->>WS: UUID, shortToken
    WS->>LS: Guardar UUID
    WS->>F: connection_established
    F->>U: Mostrar token corto
```

### 2. Inicio de Partida (Modo Host)
```mermaid
sequenceDiagram
    participant H as Host
    participant GH as gameStore (Host)
    participant WS as WebSocketService
    participant S as Servidor WS
    participant G as Guest
    participant GG as gameStore (Guest)

    H->>GH: hostGame()
    GH->>GH: Inicializar estado del juego
    GH->>WS: sendMessage(guestToken, GAME_START)
    WS->>S: {"to": guestToken, "message": "GAME_START|config"}
    S->>G: Mensaje entregado
    G->>GG: applyRemoteMove(GAME_START)
    GG->>GG: Inicializar estado del juego
    GG->>G: Renderizar tablero
```

### 3. Movimiento de Pieza
```mermaid
sequenceDiagram
    participant P as Jugador (Turno)
    participant GS as gameStore
    participant CS as chessRules
    participant WS as WebSocketService
    participant S as Servidor WS
    participant O as Oponente

    P->>GS: selectPiece(square)
    GS->>CS: getValidMoves(piece, board)
    CS-->>GS: Lista de movimientos válidos
    GS->>P: Mostrar movimientos válidos
    
    P->>GS: movePiece(toSquare)
    GS->>CS: isValidMove(from, to, board)
    CS-->>GS: true/false
    
    alt Movimiento válido
        GS->>GS: Aplicar movimiento localmente
        GS->>WS: sendMessage(opponentToken, MOVE|from|to)
        WS->>S: {"to": opponentToken, "message": "MOVE|e2e4"}
        S->>O: Mensaje entregado
        O->>O: Aplicar movimiento
    else Movimiento inválido
        GS->>P: Mostrar error
    end
```

## Estructura de Componentes Vue

### Jerarquía de Componentes
```
App.vue
├── ConnectionPanel.vue
│   ├── TokenDisplay.vue
│   ├── TokenInput.vue
│   └── ConnectionStatus.vue
├── ChessBoard.vue
│   ├── ChessSquare.vue (64 instancias)
│   │   └── ChessPiece.vue (0-1 por square)
├── GameControls.vue
│   ├── NewGameButton.vue
│   ├── SurrenderButton.vue
│   └── TimerDisplay.vue (opcional)
├── MoveHistory.vue
└── GameChat.vue (opcional)
```

### Stores Pinia
```
stores/
├── connectionStore.js
│   ├── state: uuid, shortToken, opponentToken, isConnected
│   ├── getters: connectionStatus, hasOpponent
│   └── actions: connect, disconnect, sendMessage
└── gameStore.js
    ├── state: board, currentTurn, selectedPiece, gameStatus
    ├── getters: isMyTurn, validMoves, winner
    └── actions: selectPiece, movePiece, resetGame, applyRemoteMove
```

## Modelo de Datos

### Estado del Tablero
```javascript
// Representación del tablero 8x8
board = [
  ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'], // fila 8 (negras)
  ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'], // fila 7
  [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '], // fila 6
  [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '], // fila 5
  [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '], // fila 4
  [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '], // fila 3
  ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'], // fila 2 (blancas)
  ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']  // fila 1
]

// Notación de piezas:
// Mayúsculas = blancas, Minúsculas = negras
// R/r: Torre, N/n: Caballo, B/b: Alfil, Q/q: Reina, K/k: Rey, P/p: Peón
```

### Mensajes WebSocket
```javascript
// Formato base (requerido por el servidor)
{
  "to": "ABCD",      // Token corto del destinatario
  "message": "payload" // Contenido específico del juego
}

// Tipos de mensajes del juego:
// GAME_START|color|timestamp
// MOVE|from|to|promotion? (ej: "MOVE|e2|e4")
// CHAT|message_text
// GAME_END|reason|winner
// SYNC|board_state (para resincronización)
```

## Consideraciones de Diseño

### Separación de Responsabilidades
1. **WebSocketService**: Solo maneja conexión y transporte de mensajes
2. **gameStore**: Maneja estado del juego y lógica de UI
3. **chessRules**: Lógica pura de ajedrez (sin estado)
4. **Componentes Vue**: Solo presentación y interacción del usuario

### Patrones Utilizados
- **Store Pattern**: Pinia para estado global
- **Service Pattern**: Servicios para lógica de negocio
- **Component Composition**: Componentes Vue reutilizables
- **Observer Pattern**: Eventos WebSocket y reacciones de store

### Manejo de Estado
- Estado local del componente: Solo UI temporal
- Estado global (store): Datos compartidos entre componentes
- Estado persistente (localStorage): Datos que sobreviven recargas
- Estado remoto: Sincronizado a través de WebSocket

## Decisiones de Implementación

### 1. Validación de Movimientos
- Opción A: Implementar desde cero en `chessRules.js`
- Opción B: Usar biblioteca `chess.js` (más robusta, menos control)
- **Recomendación**: Implementar básico primero, luego evaluar necesidad de biblioteca

### 2. Sincronización de Estado
- **Approach optimista**: Aplicar movimiento localmente inmediatamente, revertir si el host rechaza
- **Approack conservador**: Esperar confirmación del host antes de aplicar
- **Recomendación**: Approach optimista para mejor experiencia de usuario, con sistema de rollback

### 3. Manejo de Desconexiones
- Guardar estado completo del juego en localStorage
- Intentar reconexión automática
- Resincronizar estado al reconectar
- Timeout después de 30 segundos de desconexión

### 4. Responsive Design
- Breakpoints: móvil (<768px), tablet (768-1024px), desktop (>1024px)
- Tablero ajustable: tamaño máximo basado en viewport
- Orientación vertical en móviles: tablero arriba, controles abajo

## Métricas de Éxito

### Funcionales
- [ ] Conexión WebSocket estable
- [ ] Movimientos válidos de ajedrez
- [ ] Sincronización host-guest
- [ ] Reconexión automática
- [ ] Interfaz usable en móvil

### No Funcionales
- [ ] < 100ms de latencia para movimientos locales
- [ ] < 500ms de latencia para movimientos remotos
- [ ] < 3MB de bundle size inicial
- [ ] Carga inicial < 3 segundos
- [ ] Uso de memoria < 100MB

## Riesgos y Mitigaciones

| Riesgo | Impacto | Probabilidad | Mitigación |
|--------|---------|--------------|------------|
| Servidor WS offline | Alto | Media | Modo local de práctica, mensaje de error claro |
| Latencia alta | Medio | Alta | Indicador de latencia, movimiento optimista |
| Bugs en lógica de ajedrez | Medio | Media | Testing exhaustivo, usar biblioteca probada |
| Pérdida de conexión | Alto | Alta | Reconexión automática, guardado de estado |
| Compatibilidad navegador | Bajo | Baja | Polyfills para WebSocket, fallback a polling |

## Próximos Pasos

1. **Aprobación del plan** por el usuario
2. **Implementación de Fase 1** (Configuración)
3. **Implementación de Fase 2** (WebSocket básico)
4. **Implementación de Fase 3** (Tablero estático)
5. **Iteración y refinamiento** basado en feedback