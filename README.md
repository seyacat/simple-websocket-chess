# Ajedrez con WebSocket y Phaser

Un juego de ajedrez multijugador en tiempo real que utiliza WebSocket para la comunicación y Phaser para el renderizado del tablero.

## Características

- **Multijugador en tiempo real**: Conéctate como host o guest para jugar
- **WebSocket**: Comunicación a través de servidor proxy con tokens cortos
- **Phaser 3**: Motor de juego para renderizado suave del tablero y animaciones
- **Vue 3 + Vite**: Frontend moderno y reactivo
- **Reglas completas de ajedrez**: Movimientos válidos, jaque, jaque mate, tablas
- **Interfaz responsive**: Funciona en desktop, tablet y móvil

## Arquitectura

### Componentes Principales
1. **Frontend (Vue 3)**: Interfaz de usuario y gestión de estado
2. **Phaser 3**: Renderizado del tablero y manejo de input
3. **WebSocket Service**: Conexión al servidor proxy
4. **Pinia Stores**: Gestión de estado (conexión y juego)

### Flujo de Comunicación
```
Jugador A (Host) ↔ WebSocket Service ↔ Servidor Proxy ↔ WebSocket Service ↔ Jugador B (Guest)
```

## Configuración

### Requisitos
- Node.js 16+
- npm o yarn

### Instalación
```bash
npm install
```

### Variables de Entorno
Crea un archivo `.env` basado en `.env.example`:
```env
VITE_WS_URL=wss://closer.click:4000
VITE_WS_RECONNECT_DELAY=3000
VITE_WS_MAX_RECONNECT_ATTEMPTS=5
VITE_GAME_NAME=simple-chess
VITE_DEFAULT_BOARD_SIZE=800
VITE_DEBUG_MODE=true
```

### Desarrollo
```bash
npm run dev
```

### Build para Producción
```bash
npm run build
```

### Preview
```bash
npm run preview
```

## Uso

### 1. Conectar al Servidor
1. Abre la aplicación en el navegador
2. Haz clic en "Conectar" para establecer conexión WebSocket
3. Recibirás un token corto (ej: "ABCD")

### 2. Compartir Token
1. Comparte tu token con el oponente (por chat, email, etc.)
2. El oponente ingresa tu token en "Token del Oponente"
3. Haz clic en "Conectar" para vincular las sesiones

### 3. Configurar Partida
1. **Host**: Selecciona "Host" y haz clic en "Iniciar Partida"
2. **Guest**: Selecciona "Guest" y espera a que el host inicie

### 4. Jugar
1. Las blancas siempre empiezan
2. Haz clic en una pieza para seleccionarla
3. Las casillas válidas se resaltan en verde
4. Haz clic en una casilla válida para mover
5. Los movimientos se sincronizan automáticamente entre jugadores

## Estructura del Proyecto

```
src/
├── components/
│   ├── chess/
│   │   └── PhaserChessGame.vue    # Componente wrapper para Phaser
│   └── connection/
│       └── ConnectionPanel.vue    # Panel de conexión WebSocket
├── stores/
│   ├── connectionStore.js         # Estado de conexión WebSocket
│   └── gameStore.js              # Estado del juego de ajedrez
├── services/
│   └── WebSocketService.js       # Servicio de conexión WebSocket
├── utils/
│   └── chessRules.js             # Reglas y lógica del ajedrez
├── phaser/
│   ├── scenes/                   # Escenas Phaser
│   ├── assets/                   # Sprites y sonidos
│   └── utils/                    # Utilidades Phaser
└── App.vue                       # Componente principal
```

## Protocolo de Mensajes WebSocket

### Formato Base
```json
{
  "to": "TOKEN_DESTINO",
  "message": "TIPO|DATOS_JSON"
}
```

### Tipos de Mensajes
1. **GAME_START**: Inicio de partida
   - `GAME_START|{"color":"black","timestamp":1234567890,"isHost":false}`

2. **MOVE**: Movimiento de pieza
   - `MOVE|{"from":{"row":6,"col":4},"to":{"row":4,"col":4},"piece":"P","timestamp":1234567890}`

3. **CHAT**: Mensaje de chat
   - `CHAT|{"text":"¡Buen movimiento!","sender":"ABCD"}`

4. **GAME_END**: Fin de partida
   - `GAME_END|{"reason":"checkmate","winner":"white"}`

## Desarrollo

### Agregar Nuevas Características
1. **Nuevas reglas de ajedrez**: Modificar `src/utils/chessRules.js`
2. **Nuevos componentes Vue**: Crear en `src/components/`
3. **Nuevas escenas Phaser**: Crear en `src/phaser/scenes/`
4. **Nuevos mensajes WebSocket**: Extender `WebSocketService.js`

### Debug
Habilita el modo debug en `.env`:
```env
VITE_DEBUG_MODE=true
```

Esto mostrará información detallada de conexión y mensajes.

## Despliegue

### Servidor Estático
```bash
npm run build
# Los archivos se generan en /dist
```

### Servicios Recomendados
- **Netlify**: Drag & drop de la carpeta `/dist`
- **Vercel**: `vercel --prod`
- **GitHub Pages**: Configurar acción de deploy

### Configuración CORS
El servidor WebSocket debe permitir conexiones desde tu dominio. Contacta al administrador del servidor proxy si es necesario.

## Solución de Problemas

### Conexión WebSocket Fallida
1. Verifica que el servidor proxy esté ejecutándose
2. Revisa la URL en `.env`
3. Verifica la consola del navegador para errores

### Movimientos No Sincronizados
1. Verifica que ambos jugadores estén conectados
2. Confirma que los tokens sean correctos
3. Revisa la consola para mensajes de error

### Problemas de Rendimiento
1. Reduce el tamaño del tablero en pantallas pequeñas
2. Deshabilita animaciones si es necesario
3. Verifica la conexión a internet

## Contribuir

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## Licencia

Este proyecto está bajo la Licencia MIT. Ver `LICENSE` para más detalles.

## Créditos

- **Phaser 3**: Motor de juego HTML5
- **Vue 3**: Framework progresivo de JavaScript
- **Vite**: Herramienta de build frontend
- **Pinia**: Store para Vue

## Contacto

Para preguntas o soporte, abre un issue en el repositorio.
