# Sistema de Turnos – Hotel Plaza

Sistema de gestión de turnos para la recepción de un hotel. Los huéspedes sacan turno desde una tablet en el lobby, **hasta 3 recepcionistas** controlan una cola compartida desde sus PCs, y una pantalla TV muestra a qué recepción debe dirigirse cada huésped.

## Cómo funciona con varios recepcionistas

- Hay **una sola cola** (orden de llegada). Cada recepcionista la atiende desde su propio PC.
- Al abrir el panel de recepción, cada recepcionista **elige su puesto** (Recepción 1, 2 o 3). La elección se recuerda en ese navegador.
- Cuando un recepcionista pulsa **"Llamar siguiente"**, el primer turno de la cola se le asigna a *su* puesto. Los demás puestos no se ven afectados.
- La **TV anuncia el destino**: muestra y dice por voz *"Turno Check-In número 5, diríjase a Recepción 1"*, para que el huésped sepa exactamente a dónde ir.

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
| PC de cada recepcionista (1, 2 y 3) | `http://<IP-servidor>:3000/recepcion` |
| Tablet del lobby | `http://<IP-servidor>:3000/tablet` |
| Samsung Smart TV | `http://<IP-servidor>:3000/tv` |

> Los 3 PCs de recepción abren la **misma URL** `/recepcion`. La primera vez, cada uno elige su puesto (Recepción 1/2/3) e ingresa el PIN. Un puesto ya tomado por un equipo no puede ser usado por otro al mismo tiempo.

## PIN de cada recepción

Cada puesto se protege con un PIN configurable en `puestos.config.json` (en la raíz del proyecto):

```json
{
  "1": { "pin": "1111" },
  "2": { "pin": "2222" },
  "3": { "pin": "3333" }
}
```

**Cambia estos PINs antes de usar el sistema en producción.** El recepcionista ingresa el PIN una sola vez por equipo; queda recordado en ese navegador. Para cambiar de puesto, toca el chip "Recepción N" en el encabezado.

## Botones del panel de recepción

- **Llamar siguiente** — toma el primer turno de la cola y lo asigna a tu puesto.
- **Repetir** — vuelve a anunciar por voz en la TV el turno actual (si el huésped no escuchó).
- **Atendido** — cierra el turno actual como atendido.
- **Ausente** — cierra el turno actual como ausente (el huésped no se presentó).

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
