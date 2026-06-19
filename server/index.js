const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { execFile } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const turnos = require('./turnos');
const { wavABuferMp3 } = require('./lib/mp3-encoder');

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

// ── Configuración de puestos (PIN por recepción) ──
const PUESTOS_DEFAULT = { '1': { pin: '1111' }, '2': { pin: '2222' }, '3': { pin: '3333' } };
function cargarConfigPuestos() {
  try {
    const ruta = path.join(__dirname, '../puestos.config.json');
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (e) {
    console.warn('[server] No se pudo leer puestos.config.json, usando PINs por defecto:', e.message);
    return PUESTOS_DEFAULT;
  }
}
const PUESTOS_CONFIG = cargarConfigPuestos();

// ── Control de ocupación: qué socket tiene tomado cada puesto ──
const puestoOcupado = {}; // { '1': socketId }

function ocupacionActual() {
  const r = {};
  for (const clave of Object.keys(PUESTOS_CONFIG)) {
    const holder = puestoOcupado[clave];
    r[clave] = !!(holder && io.sockets.sockets.has(holder));
  }
  return r;
}

function liberarPuestoDeSocket(socket) {
  const p = socket.data.puesto;
  if (p && puestoOcupado[p] === socket.id) {
    delete puestoOcupado[p];
    socket.data.puesto = null;
    io.emit('puestos:ocupacion', ocupacionActual());
    console.log(`[server] Recepción ${p} liberada (${socket.id})`);
  }
}

app.use('/recepcion', express.static(path.join(__dirname, '../public/recepcion')));
app.use('/tablet', express.static(path.join(__dirname, '../public/tablet')));
app.use('/tv', express.static(path.join(__dirname, '../public/tv')));
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));

// ── Caché de TTS: el MP3 es función pura del texto, así que los anuncios
//    repetidos (mismo número/recepción, o "Repetir") se sirven al instante. ──
const TTS_CACHE_MAX = 200;
const ttsCache = new Map();    // hash(texto) -> Buffer MP3
const ttsEnVuelo = new Map();  // hash(texto) -> Promise<Buffer> (dedupe concurrente)

function hashTexto(t) {
  return crypto.createHash('sha1').update(t).digest('hex');
}

// Genera el MP3 con SAPI (WAV) y lo convierte en memoria (Tizen no reproduce el WAV)
function generarMp3(texto) {
  return new Promise((resolve, reject) => {
    const id      = crypto.randomBytes(8).toString('hex');
    const txtPath = path.join(os.tmpdir(), `tts_${id}.txt`);
    const wavPath = path.join(os.tmpdir(), `tts_${id}.wav`);
    const limpiar = () => { fs.unlink(txtPath, () => {}); fs.unlink(wavPath, () => {}); };

    try { fs.writeFileSync(txtPath, texto, 'utf8'); }
    catch (e) { return reject(e); }

    const txtPs = txtPath.replace(/'/g, "''");
    const wavPs = wavPath.replace(/'/g, "''");
    const script = [
      "Add-Type -AssemblyName System.Speech",
      "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
      "$s.SelectVoice('Microsoft Helena Desktop')",
      "$s.Rate = -1",
      `$s.SetOutputToWaveFile('${wavPs}')`,
      `$texto = [System.IO.File]::ReadAllText('${txtPs}', [System.Text.Encoding]::UTF8)`,
      "$s.Speak($texto)",
      "$s.Dispose()"
    ].join('\n');
    const encoded = Buffer.from(script, 'utf16le').toString('base64');

    execFile('powershell.exe', ['-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { timeout: 10000 }, (errPs) => {
      fs.unlink(txtPath, () => {});
      if (!fs.existsSync(wavPath)) {
        limpiar();
        return reject(errPs || new Error('WAV no generado'));
      }
      try {
        const wav = fs.readFileSync(wavPath);
        const mp3 = wavABuferMp3(wav);
        fs.unlink(wavPath, () => {});
        resolve(mp3);
      } catch (e) {
        limpiar();
        reject(e);
      }
    });
  });
}

function obtenerMp3(texto) {
  const key = hashTexto(texto);

  if (ttsCache.has(key)) {
    const buf = ttsCache.get(key);   // refrescar orden LRU
    ttsCache.delete(key);
    ttsCache.set(key, buf);
    return Promise.resolve(buf);
  }
  if (ttsEnVuelo.has(key)) return ttsEnVuelo.get(key);

  const promesa = generarMp3(texto).then(mp3 => {
    ttsEnVuelo.delete(key);
    ttsCache.set(key, mp3);
    if (ttsCache.size > TTS_CACHE_MAX) {
      ttsCache.delete(ttsCache.keys().next().value); // descartar el más antiguo
    }
    return mp3;
  }).catch(e => {
    ttsEnVuelo.delete(key);
    throw e;
  });

  ttsEnVuelo.set(key, promesa);
  return promesa;
}

app.get('/tts', async (req, res) => {
  const texto = (req.query.texto || '').trim().slice(0, 400);
  if (!texto) return res.status(400).end();
  try {
    const mp3 = await obtenerMp3(texto);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(mp3);
  } catch (e) {
    console.error('[tts] Error generando audio:', e.message);
    res.status(500).end();
  }
});

app.get('/', (req, res) => res.redirect('/recepcion'));

io.on('connection', (socket) => {
  console.log(`[server] Cliente conectado: ${socket.id}`);
  socket.data.puesto = null;
  socket.emit('puestos:ocupacion', ocupacionActual());

  // ── Reclamar un puesto con PIN (exclusivo por equipo) ──
  socket.on('puesto:reclamar', ({ puesto, pin } = {}) => {
    const clave = String(puesto);
    const cfg = PUESTOS_CONFIG[clave];
    if (!cfg) {
      return socket.emit('puesto:rechazado', { motivo: 'Puesto inválido' });
    }
    if (String(pin || '') !== String(cfg.pin)) {
      return socket.emit('puesto:rechazado', { motivo: 'PIN incorrecto' });
    }
    const holder = puestoOcupado[clave];
    if (holder && holder !== socket.id && io.sockets.sockets.has(holder)) {
      return socket.emit('puesto:rechazado', { motivo: `Recepción ${clave} ya está en uso en otro equipo` });
    }
    // Soltar el puesto previo de este mismo socket, si tenía otro
    if (socket.data.puesto && socket.data.puesto !== clave && puestoOcupado[socket.data.puesto] === socket.id) {
      delete puestoOcupado[socket.data.puesto];
    }
    puestoOcupado[clave] = socket.id;
    socket.data.puesto = clave;
    socket.emit('puesto:reclamado', { puesto: clave });
    io.emit('puestos:ocupacion', ocupacionActual());
    console.log(`[server] Recepción ${clave} tomada por ${socket.id}`);
  });

  socket.on('puesto:liberar', () => liberarPuestoDeSocket(socket));

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
    const puesto = socket.data.puesto;
    if (!puesto) return socket.emit('error', { mensaje: 'Selecciona tu puesto primero' });
    try {
      const turno = await turnos.llamarSiguiente(puesto);
      io.emit('turno:activo', turno);
      io.emit('estado:sync', turnos.obtenerEstado());
    } catch (error) {
      console.error('[server] Error llamando turno:', error.message);
      socket.emit('error', { mensaje: error.message });
    }
  });

  // Volver a anunciar por voz el turno activo del puesto (el huésped no escuchó)
  socket.on('turno:rellamar', () => {
    const puesto = socket.data.puesto;
    if (!puesto) return socket.emit('error', { mensaje: 'Selecciona tu puesto primero' });
    const est = turnos.obtenerEstado();
    const turno = est.puestos[puesto] && est.puestos[puesto].turnoActivo;
    if (turno) {
      turnos.actualizarAnuncio(turno.id, 'encolado');
      io.emit('turno:activo', turno);
      io.emit('estado:sync', turnos.obtenerEstado());
      console.log(`[server] Recepción ${puesto} repite llamado: ${turno.servicio} N° ${turno.numero}`);
    } else {
      socket.emit('error', { mensaje: 'No hay turno activo para repetir' });
    }
  });

  // La TV reporta en qué fase va el anuncio de voz de un turno
  socket.on('anuncio:estado', ({ id, fase } = {}) => {
    if (!id || !['anunciando', 'anunciado'].includes(fase)) return;
    if (turnos.actualizarAnuncio(id, fase)) {
      io.emit('estado:sync', turnos.obtenerEstado());
    }
  });

  socket.on('turno:atendido', async () => {
    const puesto = socket.data.puesto;
    if (!puesto) return socket.emit('error', { mensaje: 'Selecciona tu puesto primero' });
    try {
      await turnos.marcarAtendido(puesto);
      io.emit('estado:sync', turnos.obtenerEstado());
    } catch (error) {
      console.error('[server] Error marcando atendido:', error.message);
      socket.emit('error', { mensaje: error.message });
    }
  });

  socket.on('turno:ausente', async () => {
    const puesto = socket.data.puesto;
    if (!puesto) return socket.emit('error', { mensaje: 'Selecciona tu puesto primero' });
    try {
      await turnos.marcarAusente(puesto);
      io.emit('estado:sync', turnos.obtenerEstado());
    } catch (error) {
      console.error('[server] Error marcando ausente:', error.message);
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
    liberarPuestoDeSocket(socket);
  });
});

const PORT = process.env.PORT || 3000;

// Chequeo periódico de cambio de día: resetea solo a la medianoche (Bogota)
// sin necesidad de reiniciar el servidor.
function programarResetDiario() {
  setInterval(async () => {
    try {
      if (await turnos.verificarReset()) {
        io.emit('estado:sync', turnos.obtenerEstado());
        console.log('[server] Estado reiniciado automáticamente por cambio de día');
      }
    } catch (e) {
      console.error('[server] Error en verificación de reset diario:', e.message);
    }
  }, 60000);
}

turnos.inicializar().then(() => {
  programarResetDiario();
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
