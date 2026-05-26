const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const turnos = require('./turnos');

function obtenerIPLocal() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const info of iface) {
      if (info.family === 'IPv4' && !info.internal) return info.address;
    }
  }
  return 'localhost';
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use('/recepcion', express.static(path.join(__dirname, '../public/recepcion')));
app.use('/tablet', express.static(path.join(__dirname, '../public/tablet')));
app.use('/tv', express.static(path.join(__dirname, '../public/tv')));
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));

app.get('/', (req, res) => res.redirect('/recepcion'));

io.on('connection', (socket) => {
  console.log(`[server] Cliente conectado: ${socket.id}`);

  socket.on('estado:pedir', () => {
    socket.emit('estado:sync', turnos.obtenerEstado());
  });

  socket.on('turno:crear', async ({ servicio, nombre, observacion }) => {
    try {
      const turno = await turnos.crearTurno(servicio, nombre, observacion);
      socket.emit('turno:confirmado', { numero: turno.numero, servicio: turno.servicio, nombre: turno.nombre });
      io.emit('turno:nuevo', turno);
      io.emit('estado:sync', turnos.obtenerEstado());
    } catch (error) {
      console.error('[server] Error creando turno:', error.message);
      socket.emit('error', { mensaje: error.message });
    }
  });

  socket.on('turno:llamar', async () => {
    try {
      const turno = await turnos.llamarSiguiente();
      io.emit('turno:activo', turno);
      io.emit('estado:sync', turnos.obtenerEstado());
    } catch (error) {
      console.error('[server] Error llamando turno:', error.message);
      socket.emit('error', { mensaje: error.message });
    }
  });

  socket.on('turno:atendido', async () => {
    try {
      await turnos.marcarAtendido();
      io.emit('turno:activo', null);
      io.emit('estado:sync', turnos.obtenerEstado());
    } catch (error) {
      console.error('[server] Error marcando atendido:', error.message);
      socket.emit('error', { mensaje: error.message });
    }
  });

  socket.on('turno:cancelar', async ({ id }) => {
    try {
      await turnos.cancelarTurno(id);
      io.emit('estado:sync', turnos.obtenerEstado());
    } catch (error) {
      console.error('[server] Error cancelando turno:', error.message);
      socket.emit('error', { mensaje: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[server] Cliente desconectado: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;

turnos.inicializar().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    const ip = obtenerIPLocal();
    console.log(`\n✓ Servidor corriendo`);
    console.log(`\n  Desde este PC (localhost):`);
    console.log(`    Recepción: http://localhost:${PORT}/recepcion`);
    console.log(`    Tablet:    http://localhost:${PORT}/tablet`);
    console.log(`    TV:        http://localhost:${PORT}/tv`);
    console.log(`\n  Desde otros dispositivos en la red (IP: ${ip}):`);
    console.log(`    Recepción: http://${ip}:${PORT}/recepcion`);
    console.log(`    Tablet:    http://${ip}:${PORT}/tablet`);
    console.log(`    TV:        http://${ip}:${PORT}/tv\n`);
  });
}).catch(error => {
  console.error('[server] Error al inicializar:', error);
  process.exit(1);
});
