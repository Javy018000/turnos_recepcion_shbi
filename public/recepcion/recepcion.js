const socket = io({ reconnection: true });

const elListaCola = document.getElementById('lista-cola');
const elBadgeEspera = document.getElementById('badge-espera');
const elActivoNumero = document.getElementById('activo-numero');
const elActivoServicio = document.getElementById('activo-servicio');
const elActivoAnuncio = document.getElementById('activo-anuncio');
const elActivoTiempo = document.getElementById('activo-tiempo');
const elBtnLlamar = document.getElementById('btn-llamar');
const elBtnRepetir = document.getElementById('btn-repetir');
const elBtnAtendido = document.getElementById('btn-atendido');
const elBtnAusente = document.getElementById('btn-ausente');
const elStatAtendidos = document.getElementById('stat-atendidos');
const elStatEspera = document.getElementById('stat-espera');
const elStatAusentes = document.getElementById('stat-ausentes');
const elConexion = document.getElementById('estado-conexion');
const elBanner = document.getElementById('banner-conexion');
const elModal = document.getElementById('modal-cancelar');
const elModalInfo = document.getElementById('modal-turno-info');
const elModalConfirmar = document.getElementById('modal-confirmar');
const elModalCancelarBtn = document.getElementById('modal-cancelar-btn');
const elOverlayPuesto = document.getElementById('overlay-puesto');
const elPuestoChip = document.getElementById('mi-puesto-chip');
const elPuestoTexto = document.getElementById('mi-puesto-texto');
const elPuestosGrid = document.getElementById('puestos-grid');
const elPinZona = document.getElementById('puesto-pin-zona');
const elPinLabel = document.getElementById('pin-label');
const elInputPin = document.getElementById('input-pin');
const elBtnEntrarPuesto = document.getElementById('btn-entrar-puesto');
const elPinError = document.getElementById('pin-error');
const botonesPuesto = Array.from(document.querySelectorAll('.btn-puesto'));

const ETIQUETAS_SERVICIO = {
  'check-in': 'Check-In',
  'check-out': 'Check-Out',
  'informacion': 'Información',
  'concierge': 'Concierge'
};

const ANUNCIO_INFO = {
  encolado:   { txt: 'En espera de anuncio',  cls: 'anuncio-espera',   icon: 'ti-clock-hour-3' },
  anunciando: { txt: 'Anunciando por TV',     cls: 'anuncio-llamando', icon: 'ti-volume' },
  anunciado:  { txt: 'Anunciado por TV',      cls: 'anuncio-listo',    icon: 'ti-user-check' }
};
function infoAnuncio(fase) {
  return ANUNCIO_INFO[fase] || ANUNCIO_INFO.encolado;
}

const CLAVE_PUESTO = 'recepcion_puesto';
const CLAVE_PIN = 'recepcion_pin';

let estadoActual = null;
let turnoActivoDesde = null;
let idCancelando = null;
let miPuesto = null;            // puesto confirmado por el servidor
let puestoElegido = null;       // puesto seleccionado en el overlay (aún sin PIN)
let ocupacion = {};             // { '1': true/false }
let credPuesto = localStorage.getItem(CLAVE_PUESTO);
let credPin = localStorage.getItem(CLAVE_PIN);
let reclamoAuto = false;
let reintentos = 0;

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

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

// ── Overlay de selección de puesto + PIN ──
function abrirSelectorPuesto() {
  elOverlayPuesto.classList.remove('oculto');
  elPinZona.classList.add('oculto');
  puestoElegido = null;
  botonesPuesto.forEach(b => b.classList.remove('seleccionado'));
}

function mostrarPinError(msg) {
  elPinError.textContent = msg;
  elPinError.classList.remove('oculto');
}
function ocultarPinError() {
  elPinError.classList.add('oculto');
}

function renderOcupacion() {
  botonesPuesto.forEach(btn => {
    const clave = btn.dataset.puesto;
    const ocupado = !!ocupacion[clave] && clave !== miPuesto;
    const estadoSpan = btn.querySelector('.btn-puesto-estado');
    btn.disabled = ocupado;
    btn.classList.toggle('ocupado', ocupado);
    if (estadoSpan) estadoSpan.textContent = ocupado ? 'En uso' : 'Disponible';
  });
}

botonesPuesto.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    puestoElegido = btn.dataset.puesto;
    botonesPuesto.forEach(b => b.classList.toggle('seleccionado', b === btn));
    elPinLabel.textContent = `PIN de Recepción ${puestoElegido}`;
    elInputPin.value = '';
    ocultarPinError();
    elPinZona.classList.remove('oculto');
    setTimeout(() => elInputPin.focus(), 100);
  });
});

function enviarPin() {
  if (!puestoElegido) return;
  const pin = elInputPin.value.trim();
  if (!pin) { mostrarPinError('Ingresa el PIN'); elInputPin.focus(); return; }
  credPuesto = puestoElegido;
  credPin = pin;
  reclamoAuto = false;
  reintentos = 0;
  ocultarPinError();
  socket.emit('puesto:reclamar', { puesto: puestoElegido, pin });
}

elBtnEntrarPuesto.addEventListener('click', enviarPin);
elInputPin.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviarPin(); });

elPuestoChip.addEventListener('click', () => {
  socket.emit('puesto:liberar');
  miPuesto = null;
  credPuesto = null;
  credPin = null;
  localStorage.removeItem(CLAVE_PUESTO);
  localStorage.removeItem(CLAVE_PIN);
  elPuestoTexto.textContent = 'Recepción —';
  if (estadoActual) renderizarEstado(estadoActual);
  abrirSelectorPuesto();
});

socket.on('puestos:ocupacion', (mapa) => {
  ocupacion = mapa || {};
  renderOcupacion();
});

socket.on('puesto:reclamado', ({ puesto }) => {
  miPuesto = String(puesto);
  credPuesto = miPuesto;
  reclamoAuto = false;
  reintentos = 0;
  localStorage.setItem(CLAVE_PUESTO, miPuesto);
  if (credPin) localStorage.setItem(CLAVE_PIN, credPin);
  elPuestoTexto.textContent = `Recepción ${miPuesto}`;
  elOverlayPuesto.classList.add('oculto');
  ocultarPinError();
  if (estadoActual) renderizarEstado(estadoActual);
});

socket.on('puesto:rechazado', ({ motivo }) => {
  // Si fue un re-reclamo automático por "en uso" (típico al reconectar), reintentar
  if (reclamoAuto && /uso/i.test(motivo) && reintentos < 2) {
    reintentos++;
    setTimeout(() => socket.emit('puesto:reclamar', { puesto: credPuesto, pin: credPin }), 1500);
    return;
  }
  reclamoAuto = false;
  reintentos = 0;
  miPuesto = null;
  if (estadoActual) renderizarEstado(estadoActual);
  abrirSelectorPuesto();
  if (puestoElegido) {
    botonesPuesto.forEach(b => b.classList.toggle('seleccionado', b.dataset.puesto === puestoElegido));
    elPinZona.classList.remove('oculto');
  }
  mostrarPinError(motivo || 'No se pudo tomar el puesto');
});

// ── Estado / render ──
function miTurnoActivo() {
  if (!miPuesto || !estadoActual || !estadoActual.puestos) return null;
  const p = estadoActual.puestos[miPuesto];
  return p ? p.turnoActivo : null;
}

function renderizarPuestos(estado) {
  if (!estado.puestos) { elPuestosGrid.innerHTML = ''; return; }
  elPuestosGrid.innerHTML = Object.keys(estado.puestos).map(clave => {
    const t = estado.puestos[clave].turnoActivo;
    const esMio = clave === miPuesto;
    let contenido;
    if (t) {
      const a = infoAnuncio(t.anuncio);
      contenido = `<span class="puesto-card-num">${t.numero}</span>
        <span class="puesto-card-svc">${ETIQUETAS_SERVICIO[t.servicio] || t.servicio}</span>
        <span class="puesto-card-anuncio ${a.cls}"><i class="ti ${a.icon}"></i> ${a.txt}</span>`;
    } else {
      contenido = `<span class="puesto-card-libre">Libre</span>`;
    }
    return `
      <div class="puesto-card ${esMio ? 'puesto-card-mio' : ''} ${t ? 'puesto-card-ocupado' : ''}">
        <span class="puesto-card-titulo">Recepción ${clave}${esMio ? ' (tú)' : ''}</span>
        ${contenido}
      </div>`;
  }).join('');
}

function renderizarEstado(estado) {
  estadoActual = estado;

  elStatAtendidos.textContent = estado.atendidosHoy;
  elStatEspera.textContent = estado.cola.length;
  elStatAusentes.textContent = estado.ausentesHoy || 0;
  elBadgeEspera.textContent = estado.cola.length;

  renderizarPuestos(estado);

  const activo = miTurnoActivo();
  const tieneActivo = !!activo;

  if (tieneActivo) {
    if (!turnoActivoDesde) {
      turnoActivoDesde = activo.activadoEn ? new Date(activo.activadoEn).getTime() : Date.now();
    }
    elActivoNumero.textContent   = activo.numero;
    elActivoServicio.textContent = (activo.nombre ? `${activo.nombre} — ` : '') + (ETIQUETAS_SERVICIO[activo.servicio] || activo.servicio);
    const a = infoAnuncio(activo.anuncio);
    elActivoAnuncio.className = `activo-anuncio ${a.cls}`;
    elActivoAnuncio.innerHTML = `<i class="ti ${a.icon}"></i> ${a.txt}`;
    actualizarTiempoActivo();
  } else {
    turnoActivoDesde = null;
    elActivoNumero.textContent = '--';
    elActivoServicio.textContent = miPuesto ? 'Sin turno activo' : 'Selecciona tu puesto';
    elActivoAnuncio.className = 'activo-anuncio oculto';
    elActivoAnuncio.textContent = '';
    elActivoTiempo.textContent = '';
  }

  // Repetir solo cuando el anuncio anterior ya terminó (evita encolar duplicados en la TV)
  elBtnRepetir.disabled  = !tieneActivo || activo.anuncio !== 'anunciado';
  elBtnAtendido.disabled = !tieneActivo;
  elBtnAusente.disabled  = !tieneActivo;
  elBtnLlamar.disabled   = !miPuesto || tieneActivo || estado.cola.length === 0;

  if (estado.cola.length === 0) {
    elListaCola.innerHTML = '<li class="cola-vacia">No hay turnos en espera</li>';
    return;
  }

  elListaCola.innerHTML = estado.cola.map(t => `
    <li class="cola-item" data-id="${t.id}">
      <div class="cola-item-info">
        <span class="cola-numero-badge">${t.numero}</span>
        <div class="cola-detalle">
          <span class="cola-nombre">${escapar(t.nombre) || '—'}</span>
          <span class="cola-servicio">${ETIQUETAS_SERVICIO[t.servicio] || t.servicio}</span>
          ${t.observacion ? `<span class="cola-observacion"><i class="ti ti-eye"></i> ${escapar(t.observacion)}</span>` : ''}
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
  if (!miPuesto) { abrirSelectorPuesto(); return; }
  socket.emit('turno:llamar');
});

elBtnRepetir.addEventListener('click', () => {
  if (!miPuesto) return;
  elBtnRepetir.disabled = true; // bloqueo inmediato hasta que la TV vuelva a terminar
  socket.emit('turno:rellamar');
});

elBtnAtendido.addEventListener('click', () => {
  if (miPuesto) socket.emit('turno:atendido');
});

elBtnAusente.addEventListener('click', () => {
  if (miPuesto) socket.emit('turno:ausente');
});

socket.on('connect', () => {
  elConexion.textContent = 'Conectado';
  elConexion.className = 'estado-conectado';
  elBanner.classList.add('oculto');
  socket.emit('estado:pedir');

  // Re-reclamar el puesto guardado (al cargar o al reconectar)
  if (credPuesto && credPin) {
    reclamoAuto = true;
    reintentos = 0;
    socket.emit('puesto:reclamar', { puesto: credPuesto, pin: credPin });
  } else {
    abrirSelectorPuesto();
  }
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
