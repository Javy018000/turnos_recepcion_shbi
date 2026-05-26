const socket = io({ reconnection: true });

const elListaCola = document.getElementById('lista-cola');
const elBadgeEspera = document.getElementById('badge-espera');
const elActivoNumero = document.getElementById('activo-numero');
const elActivoServicio = document.getElementById('activo-servicio');
const elActivoTiempo = document.getElementById('activo-tiempo');
const elBtnLlamar = document.getElementById('btn-llamar');
const elBtnAtendido = document.getElementById('btn-atendido');
const elStatAtendidos = document.getElementById('stat-atendidos');
const elStatEspera = document.getElementById('stat-espera');
const elConexion = document.getElementById('estado-conexion');
const elBanner = document.getElementById('banner-conexion');
const elModal = document.getElementById('modal-cancelar');
const elModalInfo = document.getElementById('modal-turno-info');
const elModalConfirmar = document.getElementById('modal-confirmar');
const elModalCancelarBtn = document.getElementById('modal-cancelar-btn');

const ETIQUETAS_SERVICIO = {
  'check-in': 'Check-In',
  'check-out': 'Check-Out',
  'informacion': 'Información',
  'concierge': 'Concierge'
};

let estadoActual = null;
let turnoActivoDesde = null;
let idCancelando = null;

function formatearHora(iso) {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
}

function minutosDesde(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Ahora';
  return `${mins} min esperando`;
}

function actualizarTiempoActivo() {
  if (!turnoActivoDesde) { elActivoTiempo.textContent = ''; return; }
  const mins = Math.floor((Date.now() - turnoActivoDesde) / 60000);
  elActivoTiempo.textContent = mins < 1 ? 'En atención ahora' : `En atención hace ${mins} min`;
}

setInterval(() => {
  if (!estadoActual) return;
  actualizarTiempoActivo();
  elListaCola.querySelectorAll('.cola-espera').forEach((el, i) => {
    const turno = estadoActual.cola[i];
    if (turno) el.textContent = minutosDesde(turno.creadoEn);
  });
}, 30000);

function renderizarEstado(estado) {
  estadoActual = estado;

  elStatAtendidos.textContent = estado.atendidosHoy;
  elStatEspera.textContent = estado.cola.length;
  elBadgeEspera.textContent = estado.cola.length;

  if (estado.turnoActivo) {
    const t = estado.turnoActivo;
    if (!turnoActivoDesde) turnoActivoDesde = Date.now();
    elActivoNumero.textContent   = t.numero;
    elActivoServicio.textContent = (t.nombre ? `${t.nombre} — ` : '') + (ETIQUETAS_SERVICIO[t.servicio] || t.servicio);
    elBtnAtendido.disabled = false;
    actualizarTiempoActivo();
  } else {
    turnoActivoDesde = null;
    elActivoNumero.textContent = '--';
    elActivoServicio.textContent = 'Sin turno activo';
    elActivoTiempo.textContent = '';
    elBtnAtendido.disabled = true;
  }

  if (estado.cola.length === 0) {
    elListaCola.innerHTML = '<li class="cola-vacia">No hay turnos en espera</li>';
    return;
  }

  elListaCola.innerHTML = estado.cola.map(t => `
    <li class="cola-item" data-id="${t.id}">
      <div class="cola-item-info">
        <span class="cola-numero-badge">${t.numero}</span>
        <div class="cola-detalle">
          <span class="cola-nombre">${t.nombre || '—'}</span>
          <span class="cola-servicio">${ETIQUETAS_SERVICIO[t.servicio] || t.servicio}</span>
          ${t.observacion ? `<span class="cola-observacion"><i class="ti ti-eye"></i> ${t.observacion}</span>` : ''}
          <span class="cola-hora">${formatearHora(t.creadoEn)}</span>
          <span class="cola-espera">${minutosDesde(t.creadoEn)}</span>
        </div>
      </div>
      <button class="btn-cancelar" title="Cancelar turno" data-id="${t.id}">
        <i class="ti ti-trash"></i>
      </button>
    </li>
  `).join('');
}

elListaCola.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-cancelar');
  if (!btn) return;
  idCancelando = btn.dataset.id;
  const turno = estadoActual.cola.find(t => t.id === idCancelando);
  if (turno) {
    elModalInfo.textContent = `N° ${turno.numero} – ${ETIQUETAS_SERVICIO[turno.servicio] || turno.servicio}`;
    elModal.classList.remove('oculto');
  }
});

elModalConfirmar.addEventListener('click', () => {
  if (idCancelando) {
    socket.emit('turno:cancelar', { id: idCancelando });
    idCancelando = null;
  }
  elModal.classList.add('oculto');
});

elModalCancelarBtn.addEventListener('click', () => {
  idCancelando = null;
  elModal.classList.add('oculto');
});

elModal.addEventListener('click', (e) => {
  if (e.target === elModal) {
    idCancelando = null;
    elModal.classList.add('oculto');
  }
});

elBtnLlamar.addEventListener('click', () => {
  socket.emit('turno:llamar');
});

elBtnAtendido.addEventListener('click', () => {
  socket.emit('turno:atendido');
});

socket.on('connect', () => {
  elConexion.textContent = 'Conectado';
  elConexion.className = 'estado-conectado';
  elBanner.classList.add('oculto');
  socket.emit('estado:pedir');
});

socket.on('disconnect', () => {
  elConexion.textContent = 'Desconectado';
  elConexion.className = 'estado-desconectado';
  elBanner.classList.remove('oculto');
});

socket.on('estado:sync', (estado) => {
  renderizarEstado(estado);
});

socket.on('error', ({ mensaje }) => {
  alert(`Error: ${mensaje}`);
});
