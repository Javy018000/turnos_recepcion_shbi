const socket = io({ reconnection: true });

const elNumero   = document.getElementById('turno-activo-numero');
const elServicio = document.getElementById('turno-activo-servicio');
const elNombre   = document.getElementById('turno-activo-nombre');
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

function anunciarVoz(turno) {
  const num    = parseInt(turno.numero, 10);
  const nombre = turno.nombre ? `, ${turno.nombre},` : ',';
  const svc    = ETIQUETAS_SERVICIO[turno.servicio] || turno.servicio;
  const texto  = `Turno número ${num}${nombre} ${svc}, por favor acérquese a recepción`;

  audioTurno.src = '/tts?texto=' + encodeURIComponent(texto) + '&t=' + Date.now();
  audioTurno.play().catch(e => console.error('[tv] play bloqueado:', e));
}

function animarCambio(numero, servicio, nombre) {
  elNumero.classList.add('animando');
  setTimeout(() => {
    elNumero.textContent  = numero;
    elServicio.textContent= servicio;
    elNombre.textContent  = nombre || '';
    elNumero.classList.remove('animando');
  }, 400);
}

function renderizarEstado(estado) {
  if (estado.turnoActivo) {
    const t = estado.turnoActivo;
    animarCambio(t.numero, ETIQUETAS_SERVICIO[t.servicio] || t.servicio, t.nombre);
  } else {
    animarCambio('--', 'Esperando llamado', '');
  }

  elEspera.textContent = estado.cola.length;

  const siguientes = estado.cola.slice(0, 4);
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
  if (turno) anunciarVoz(turno);
});
