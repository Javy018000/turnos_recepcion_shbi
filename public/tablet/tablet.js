const socket = io({ reconnection: true });

const pantallaInicio       = document.getElementById('pantalla-inicio');
const pantallaFormulario   = document.getElementById('pantalla-formulario');
const pantallaConfirmacion = document.getElementById('pantalla-confirmacion');
const pantallaError        = document.getElementById('pantalla-error');

const elConexion         = document.getElementById('estado-conexion-tablet');
const elFormServicioBadge= document.getElementById('form-servicio-badge');
const elInputNombre      = document.getElementById('input-nombre');
const elInputObservacion = document.getElementById('input-observacion');
const elErrorNombre      = document.getElementById('error-nombre');
const elBtnConfirmar     = document.getElementById('btn-confirmar-turno');
const elBtnVolverForm    = document.getElementById('btn-volver-form');

const elConfNumero       = document.getElementById('conf-numero');
const elConfServicioBadge= document.getElementById('conf-servicio-badge');
const elConfEsperaTexto  = document.getElementById('conf-espera-texto');
const elCuentaRegresiva  = document.getElementById('cuenta-regresiva');
const elBtnVolver        = document.getElementById('btn-volver');
const elBtnReintentar    = document.getElementById('btn-reintentar');

const ETIQUETAS_SERVICIO = {
  'check-in':   'Check-In',
  'check-out':  'Check-Out',
  'informacion':'Información',
  'concierge':  'Concierge'
};

let servicioSeleccionado = null;
let temporizadorVolver   = null;
let temporizadorTimeout  = null;
let estadoCola           = [];
let esperandoRespuesta   = false;

function mostrarPantalla(pantalla) {
  [pantallaInicio, pantallaFormulario, pantallaConfirmacion, pantallaError]
    .forEach(p => p.classList.remove('activa'));
  pantalla.classList.add('activa');
}

function iniciarCuentaRegresiva(segundos, callback) {
  elCuentaRegresiva.textContent = segundos;
  let restante = segundos;
  temporizadorVolver = setInterval(() => {
    restante--;
    elCuentaRegresiva.textContent = restante;
    if (restante <= 0) {
      clearInterval(temporizadorVolver);
      callback();
    }
  }, 1000);
}

function volverInicio() {
  clearInterval(temporizadorVolver);
  clearTimeout(temporizadorTimeout);
  servicioSeleccionado = null;
  esperandoRespuesta   = false;
  elInputNombre.value      = '';
  elInputObservacion.value = '';
  elInputNombre.classList.remove('error');
  elErrorNombre.classList.add('oculto');
  mostrarPantalla(pantallaInicio);
}

function anunciarVoz(numero, servicio) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const texto = `Su turno es el número ${parseInt(numero, 10)} para ${ETIQUETAS_SERVICIO[servicio] || servicio}`;
  const msg = new SpeechSynthesisUtterance(texto);
  msg.lang = 'es-CO';
  msg.rate = 0.85;
  speechSynthesis.speak(msg);
}

function mostrarConfirmacion({ numero, servicio }) {
  clearTimeout(temporizadorTimeout);

  const personasAntes = estadoCola.length;
  elConfNumero.textContent        = numero;
  elConfServicioBadge.textContent = ETIQUETAS_SERVICIO[servicio] || servicio;

  if (personasAntes === 0) {
    elConfEsperaTexto.textContent = 'Es el próximo en ser atendido';
  } else if (personasAntes === 1) {
    elConfEsperaTexto.textContent = 'Hay 1 persona antes que usted';
  } else {
    elConfEsperaTexto.textContent = `Hay ${personasAntes} personas antes que usted`;
  }

  mostrarPantalla(pantallaConfirmacion);
  anunciarVoz(numero, servicio);
  iniciarCuentaRegresiva(8, volverInicio);
  esperandoRespuesta = false;
}

// Al tocar un servicio → ir al formulario
document.querySelectorAll('.btn-servicio').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!socket.connected) { mostrarPantalla(pantallaError); return; }
    servicioSeleccionado = btn.dataset.servicio;
    elFormServicioBadge.textContent = ETIQUETAS_SERVICIO[servicioSeleccionado];
    elInputNombre.value      = '';
    elInputObservacion.value = '';
    elInputNombre.classList.remove('error');
    elErrorNombre.classList.add('oculto');
    mostrarPantalla(pantallaFormulario);
    setTimeout(() => elInputNombre.focus(), 350);
  });
});

// Confirmar turno desde formulario
elBtnConfirmar.addEventListener('click', () => {
  const nombre = elInputNombre.value.trim();

  if (!nombre) {
    elInputNombre.classList.add('error');
    elErrorNombre.classList.remove('oculto');
    elInputNombre.focus();
    return;
  }

  if (esperandoRespuesta) return;
  esperandoRespuesta = true;

  elInputNombre.classList.remove('error');
  elErrorNombre.classList.add('oculto');

  const observacion = elInputObservacion.value.trim();
  socket.emit('turno:crear', { servicio: servicioSeleccionado, nombre, observacion });

  temporizadorTimeout = setTimeout(() => {
    if (esperandoRespuesta) {
      esperandoRespuesta = false;
      mostrarPantalla(pantallaError);
    }
  }, 5000);
});

// Limpiar error al escribir en el campo nombre
elInputNombre.addEventListener('input', () => {
  if (elInputNombre.value.trim()) {
    elInputNombre.classList.remove('error');
    elErrorNombre.classList.add('oculto');
  }
});

elBtnVolverForm.addEventListener('click', volverInicio);
elBtnVolver.addEventListener('click', volverInicio);
elBtnReintentar.addEventListener('click', volverInicio);

document.addEventListener('touchmove', (e) => {
  if (!e.target.closest('.form-scroll')) e.preventDefault();
}, { passive: false });

socket.on('connect', () => {
  elConexion.textContent = 'Conectado';
  elConexion.className   = 'estado-conectado';
  socket.emit('estado:pedir');
});

socket.on('disconnect', () => {
  elConexion.textContent = 'Sin conexión';
  elConexion.className   = 'estado-desconectado';
});

socket.on('estado:sync', (estado) => {
  estadoCola = estado.cola || [];
});

socket.on('turno:confirmado', ({ numero, servicio }) => {
  mostrarConfirmacion({ numero, servicio });
});

socket.on('error', ({ mensaje }) => {
  clearTimeout(temporizadorTimeout);
  esperandoRespuesta = false;
  mostrarPantalla(pantallaError);
});
