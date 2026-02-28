# Lista de Tareas: Juego de Ajedrez con WebSocket

## Fase 1: Configuración del Proyecto y Dependencias

### 1.1 Actualizar package.json
- [ ] Agregar dependencias necesarias:
  - `pinia` para gestión de estado
  - `uuid` para generación de IDs únicos
  - `chess.js` (opcional) para lógica de ajedrez o implementar propia
- [ ] Actualizar scripts si es necesario
- [ ] Ejecutar `npm install` para instalar dependencias

### 1.2 Configurar Variables de Entorno
- [ ] Crear archivo `.env` con:
  - `VITE_WS_URL=wss://closer.click:4000`
  - `VITE_WS_RECONNECT_DELAY=3000`
  - `VITE_GAME_NAME=simple-chess`
- [ ] Crear archivo `.env.example` con variables de ejemplo
- [ ] Configurar TypeScript si se decide usarlo

### 1.3 Estructura de Directorios
- [ ] Crear directorio `src/services/` para servicios
- [ ] Crear directorio `src/stores/` para stores Pinia
- [ ] Crear directorio `src/components/chess/` para componentes de ajedrez
- [ ] Crear directorio `src/components/connection/` para componentes de conexión
- [ ] Crear directorio `src/utils/` para utilidades

## Fase 2: Servicio WebSocket

### 2.1 Implementar WebSocketService
- [ ] Crear `src/services/WebSocketService.js`:
  - Conexión al servidor WebSocket
  - Manejo de eventos (open, message, close, error)
  - Reconexión automática con UUID almacenado
  - Envío de mensajes con formato `{to, message}`
- [ ] Implementar métodos públicos:
  - `connect()`: Establecer conexión
  - `sendMessage(to, message)`: Enviar mensaje
  - `disconnect()`: Cerrar conexión
  - `getConnectionStatus()`: Estado actual

### 2.2 Store de Conexión
- [ ] Crear `src/stores/connectionStore.js` (Pinia):
  - Estado: `uuid`, `shortToken`, `isConnected`, `error`
  - Acciones: `connect`, `disconnect`, `sendMessage`
  - Getters: `connectionStatus`, `hasToken`
- [ ] Integrar con WebSocketService
- [ ] Persistir UUID en localStorage para reconexión

### 2.3 Componente de Conexión
- [ ] Crear `src/components/connection/ConnectionPanel.vue`:
  - Mostrar estado de conexión
  - Mostrar token corto asignado
  - Campo para ingresar token del oponente
  - Botones conectar/desconectar
- [ ] Integrar con connectionStore

## Fase 3: Lógica del Juego de Ajedrez

### 3.1 Implementar Reglas de Ajedrez
- [ ] Crear `src/utils/chessRules.js`:
  - Representación del tablero (8x8)
  - Definición de piezas y movimientos válidos
  - Reglas especiales (enroque, captura al paso, promoción)
  - Validación de jaque y jaque mate
- [ ] O usar biblioteca `chess.js` si se prefiere

### 3.2 Clase ChessGame
- [ ] Crear `src/services/ChessGameService.js`:
  - Estado del juego (tablero, turno, historial)
  - Métodos para mover piezas
  - Validación de movimientos
  - Detección de fin de juego
  - Serialización/deserialización del estado

### 3.3 Store del Juego
- [ ] Crear `src/stores/gameStore.js` (Pinia):
  - Estado: `board`, `currentTurn`, `selectedPiece`, `validMoves`
  - Acciones: `selectPiece`, `movePiece`, `resetGame`, `applyRemoteMove`
  - Getters: `gameStatus`, `isMyTurn`, `winner`

## Fase 4: Componentes de la Interfaz

### 4.1 Tablero de Ajedrez
- [ ] Crear `src/components/chess/ChessBoard.vue`:
  - Renderizar tablero 8x8 con casillas alternas
  - Mostrar piezas en sus posiciones
  - Soporte para drag & drop o click para mover
  - Resaltar casillas válidas para movimiento
  - Integrar con gameStore

### 4.2 Piezas de Ajedrez
- [ ] Crear `src/components/chess/ChessPiece.vue`:
  - Componente individual para cada tipo de pieza
  - SVG o imágenes para representación visual
  - Estados: normal, seleccionada, movible
  - Integrar con sistema de drag & drop

### 4.3 Controles del Juego
- [ ] Crear `src/components/chess/GameControls.vue`:
  - Botones: Nuevo juego, Rendirse, Ofrecer tablas
  - Selector de color (blancas/negras/aleatorio)
  - Temporizador opcional
  - Integrar con gameStore

### 4.4 Historial de Movimientos
- [ ] Crear `src/components/chess/MoveHistory.vue`:
  - Lista de movimientos en notación algebraica
  - Navegación por historial (deshacer/rehacer)
  - Integrar con gameStore

## Fase 5: Integración WebSocket + Juego

### 5.1 Sistema de Mensajes del Juego
- [ ] Definir protocolo de mensajes:
  - `GAME_START`: Iniciar nueva partida
  - `MOVE`: Enviar movimiento (ej: "e2e4")
  - `GAME_END`: Fin de partida (jaque mate, tablas, etc.)
  - `CHAT`: Mensaje de chat
- [ ] Crear `src/utils/gameProtocol.js` con constantes y formateadores

### 5.2 Modo Host
- [ ] En `src/stores/gameStore.js`:
  - Acción `hostGame()`: Iniciar como host
  - Enviar `GAME_START` al guest con configuración
  - Procesar movimientos del guest y validarlos
  - Enviar confirmación de movimientos válidos

### 5.3 Modo Guest
- [ ] En `src/stores/gameStore.js`:
  - Acción `joinGame(token)`: Unirse como guest
  - Esperar `GAME_START` del host
  - Enviar movimientos al host para validación
  - Aplicar movimientos confirmados por el host

### 5.4 Sincronización de Estado
- [ ] Implementar reconciliación de estado
- [ ] Manejar reconexión y resincronización
- [ ] Sistema de confirmación de movimientos

## Fase 6: Funcionalidades Adicionales

### 6.1 Compartir Token
- [ ] Crear `src/components/connection/TokenShare.vue`:
  - Mostrar token con opción de copiar al portapapeles
  - Generar código QR del token (opcional)
  - Compartir por enlace (URL con parámetro)

### 6.2 Chat Integrado
- [ ] Crear `src/components/connection/GameChat.vue`:
  - Lista de mensajes de chat
  - Campo para enviar nuevos mensajes
  - Integrar con WebSocketService

### 6.3 Persistencia de Partidas
- [ ] Guardar partidas en localStorage
- [ ] Recuperar partidas en curso al recargar
- [ ] Historial de partidas finalizadas

### 6.4 Responsive Design
- [ ] Ajustar CSS para móviles y tablets
- [ ] Orientación vertical/horizontal
- [ ] Tamaños de fuente y elementos táctiles

## Fase 7: Testing y Depuración

### 7.1 Testing Básico
- [ ] Probar conexión WebSocket localmente
- [ ] Probar movimientos básicos de ajedrez
- [ ] Probar flujo host-guest completo
- [ ] Probar reconexión después de desconexión

### 7.2 Depuración y Logging
- [ ] Panel de depuración para ver mensajes WebSocket
- [ ] Log de eventos del juego
- [ ] Estado de conexión visible

### 7.3 Optimizaciones
- [ ] Minimizar re-renders de Vue
- [ ] Optimizar mensajes WebSocket
- [ ] Lazy loading de componentes si es necesario

## Fase 8: Documentación y Despliegue

### 8.1 Documentación
- [ ] Actualizar README.md con instrucciones
- [ ] Documentar protocolo de mensajes
- [ ] Crear guía de usuario básica

### 8.2 Build y Despliegue
- [ ] Configurar `vite.config.js` para producción
- [ ] Ejecutar `npm run build`
- [ ] Verificar que funcione en producción
- [ ] Desplegar en servicio estático (GitHub Pages, Netlify, etc.)

## Prioridades y Orden de Implementación

### Prioridad Alta (MVP)
1. WebSocketService básico
2. Tablero de ajedrez estático
3. Movimientos básicos (sin validación completa)
4. Conexión host-guest simple
5. Interfaz mínima funcional

### Prioridad Media
1. Validación completa de movimientos
2. Reglas especiales de ajedrez
3. Sistema de turnos y estado del juego
4. Chat integrado
5. Responsive design

### Prioridad Baja
1. Temporizador de juego
2. Historial de partidas
3. Códigos QR para compartir
4. Temas visuales personalizables
5. Sonidos y efectos

## Notas Técnicas

### Almacenamiento
- Usar `localStorage` para:
  - UUID del jugador (reconexión)
  - Token del oponente
  - Estado de partida en curso
  - Configuración de usuario

### Manejo de Errores
- Mostrar mensajes de error amigables
- Reconexión automática con backoff exponencial
- Validación de entrada del usuario
- Timeout para operaciones de red

### Performance
- Minimizar mensajes WebSocket (solo datos esenciales)
- Usar `computed` properties en Vue para derivar estado
- Implementar virtual scrolling para historial largo
- Optimizar renders del tablero

## Preguntas para el Usuario

1. ¿Prefieres implementar la lógica de ajedrez desde cero o usar una biblioteca como `chess.js`?
2. ¿Necesitas soporte para características avanzadas de ajedrez (enroque, promoción, etc.) desde el inicio?
3. ¿Qué estilo visual prefieres para el tablero y piezas?
4. ¿Necesitas integración con algún sistema de autenticación externo?
5. ¿Hay requisitos específicos de accesibilidad?