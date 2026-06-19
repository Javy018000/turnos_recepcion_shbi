const socket = io({ reconnection: true });

const elLlamados = document.getElementById('llamados');
const elCola     = document.getElementById('lista-cola');
const elEspera   = document.getElementById('count-espera');
const elConexion = document.getElementById('estado-conexion');
const elReloj    = document.getElementById('reloj');

const ETIQUETAS_SERVICIO = {
  'check-in':   'Check-In',
  'check-out':  'Check-Out',
  'informacion':'Información',
  'concierge':  'Concierge'
};

function escapar(texto) {
  return String(texto == null ? '' : texto).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function actualizarReloj() {
  elReloj.textContent = new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota' });
}
setInterval(actualizarReloj, 1000);
actualizarReloj();

const audioTurno = new Audio();
const SILENCIO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
let audioDesbloqueado = false;

function desbloquearAudio() {
  if (audioDesbloqueado) return;
  audioDesbloqueado = true;
  audioTurno.src = SILENCIO;
  audioTurno.play().catch(() => {});
  const overlay = document.getElementById('overlay-sonido');
  if (overlay) overlay.classList.add('oculto');
}
document.addEventListener('click', desbloquearAudio);
document.addEventListener('keydown', desbloquearAudio);

function textoAnuncio(turno) {
  const num    = parseInt(turno.numero, 10);
  const nombre = turno.nombre ? `, ${turno.nombre},` : ',';
  const svc    = ETIQUETAS_SERVICIO[turno.servicio] || turno.servicio;
  const destino = turno.puesto ? `, diríjase a Recepción ${turno.puesto}` : ', por favor acérquese a recepción';
  return `Turno ${svc} número ${num}${nombre}${destino}`;
}

// ── Cola de audio: descarga cada anuncio completo y lo reproduce uno tras
//    otro con 1s de pausa. Al usar blob, los errores de red ocurren en la
//    descarga (no durante la reproducción), así #2 nunca interrumpe a #1. ──
const PAUSA_ENTRE_ANUNCIOS = 1000;
let colaAudio = [];
let reproduciendo = false;

function encolarAnuncio(turno) {
  colaAudio.push(turno);
  reproducirSiguiente();
}

// Reproduce una URL (object URL del blob) y resuelve SOLO cuando termina
function reproducirHasta(url) {
  return new Promise((resolve) => {
    let listo = false;
    const fin = () => { if (listo) return; listo = true; resolve(); };
    audioTurno.onended = fin;
    audioTurno.onerror = fin;
    audioTurno.src = url;
    audioTurno.play().catch(e => { console.error('[tv] play bloqueado:', e); fin(); });
  });
}

async function reproducirSiguiente() {
  if (reproduciendo) return;
  const turno = colaAudio.shift();
  if (!turno) return;

  reproduciendo = true;
  let url = null;
  try {
    const resp = await fetch('/tts?texto=' + encodeURIComponent(textoAnuncio(turno)));
    if (!resp.ok) throw new Error('TTS ' + resp.status);
    url = URL.createObjectURL(await resp.blob());
    socket.emit('anuncio:estado', { id: turno.id, fase: 'anunciando' });
    await reproducirHasta(url);
  } catch (e) {
    console.error('[tv] anuncio falló:', e);
  } finally {
    if (url) URL.revokeObjectURL(url);
    audioTurno.onended = null;
    audioTurno.onerror = null;
    socket.emit('anuncio:estado', { id: turno.id, fase: 'anunciado' });
    setTimeout(() => { reproduciendo = false; reproducirSiguiente(); }, PAUSA_ENTRE_ANUNCIOS);
  }
}

let estadoActual = null;
let ultimoLlamadoId = null;
let timerDestacado = null;

function renderizarEstado(estado) {
  estadoActual = estado;

  // ── Panel de llamados (turnos activos por puesto) ──
  const claves = estado.puestos ? Object.keys(estado.puestos) : [];
  const llamados = claves
    .map(clave => estado.puestos[clave].turnoActivo)
    .filter(Boolean);

  if (llamados.length === 0) {
    elLlamados.innerHTML = '<li class="llamado-vacio">Esperando llamado</li>';
  } else {
    elLlamados.innerHTML = llamados.map(t => `
      <li class="llamado ${t.id === ultimoLlamadoId ? 'destacado' : ''}">
        <div class="llamado-num">${t.numero}</div>
        <div class="llamado-info">
          <span class="llamado-servicio">${ETIQUETAS_SERVICIO[t.servicio] || t.servicio}</span>
          ${t.nombre ? `<span class="llamado-nombre">${escapar(t.nombre)}</span>` : ''}
        </div>
        <div class="llamado-destino">
          <span class="destino-label">DIRÍJASE A</span>
          <span class="destino-puesto">RECEPCIÓN ${t.puesto || '—'}</span>
        </div>
      </li>
    `).join('');
  }

  // ── Próximos turnos en cola ──
  elEspera.textContent = estado.cola.length;

  const siguientes = estado.cola.slice(0, 5);
  if (siguientes.length === 0) {
    elCola.innerHTML = '<li class="cola-vacia">Sin turnos en espera</li>';
  } else {
    elCola.innerHTML = siguientes.map(t => `
      <li>
        <span class="cola-numero">${t.numero}</span>
        <span class="cola-servicio">${ETIQUETAS_SERVICIO[t.servicio] || t.servicio}</span>
      </li>
    `).join('');
  }
}

socket.on('connect', () => {
  elConexion.textContent = 'Conectado';
  elConexion.className   = 'estado-conectado';
  socket.emit('estado:pedir');
});

socket.on('disconnect', () => {
  elConexion.textContent = 'Reconectando...';
  elConexion.className   = 'estado-desconectado';
});

socket.on('estado:sync', (estado) => {
  renderizarEstado(estado);
});

socket.on('turno:activo', (turno) => {
  if (!turno) return;
  ultimoLlamadoId = turno.id;
  encolarAnuncio(turno);
  if (estadoActual) renderizarEstado(estadoActual);
  clearTimeout(timerDestacado);
  timerDestacado = setTimeout(() => {
    ultimoLlamadoId = null;
    if (estadoActual) renderizarEstado(estadoActual);
  }, 8000);
});
