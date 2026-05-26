# Sistema de Turnos – Hotel Plaza

Sistema de gestión de turnos para la recepción de un hotel. Los huéspedes sacan turno desde una tablet en el lobby, el recepcionista controla la cola desde su PC, y una pantalla TV muestra quién es atendido.

## Requisitos

- Node.js 18 o superior
- Red local (LAN/WiFi) — no requiere internet

## Instalación

```bash
npm install
```

## Cómo correr

**Producción:**
```bash
npm start
```

**Desarrollo (reinicio automático):**
```bash
npm run dev
```

El servidor muestra las tres URLs al iniciar:
```
✓ Servidor corriendo en http://localhost:3000
  Recepción: http://localhost:3000/recepcion
  Tablet:    http://localhost:3000/tablet
  TV:        http://localhost:3000/tv
```

## Encontrar la IP local del servidor

Cada dispositivo en la red debe ingresar la IP del PC servidor, no `localhost`.

**Windows:**
```cmd
ipconfig
```
Buscar "Dirección IPv4" bajo el adaptador de red activo (ej: `192.168.1.105`).

**Mac/Linux:**
```bash
ifconfig
```
Buscar `inet` bajo `en0` o `eth0`.

## Qué abrir en cada dispositivo

| Dispositivo | URL |
|---|---|
| PC del recepcionista | `http://<IP-servidor>:3000/recepcion` |
| Tablet del lobby | `http://<IP-servidor>:3000/tablet` |
| Samsung Smart TV | `http://<IP-servidor>:3000/tv` |

Ejemplo: si la IP del servidor es `192.168.1.105`, la tablet abre `http://192.168.1.105:3000/tablet`.

## Configurar Samsung Smart TV

1. Abrir el navegador integrado del TV (Samsung Internet o similar)
2. Ingresar la URL: `http://<IP-servidor>:3000/tv`
3. El TV actualiza automáticamente con Socket.IO — no necesita recargar

## Modo kiosco en Android (tablet del lobby)

1. Ir a **Ajustes → Accesibilidad → Pantalla anclada** (o "Fijar pantalla")
2. Activar la opción
3. Abrir Chrome con la URL de la tablet
4. Mantener presionado el botón de recientes y tocar el ícono de anclaje

## Modo kiosco en iPad (tablet del lobby)

1. Ir a **Ajustes → Accesibilidad → Acceso guiado**
2. Activar "Acceso guiado"
3. Abrir Safari con la URL de la tablet
4. Hacer triple clic en el botón de inicio para iniciar el acceso guiado
5. Tocar "Iniciar"

## Datos persistentes

El estado se guarda en `data/state.json` automáticamente. Al reiniciar el servidor, la cola y los contadores se mantienen. El estado se reinicia automáticamente cada día (zona horaria: America/Bogota).
