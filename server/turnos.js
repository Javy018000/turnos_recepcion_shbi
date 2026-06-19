const { v4: uuidv4 } = require('uuid');
const { leerEstado, escribirEstado } = require('./persistencia');

const SERVICIOS_VALIDOS = ['check-in', 'check-out', 'informacion', 'concierge'];
const NUM_PUESTOS = 3;

function fechaHoyBogota() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

function puestosVacios() {
  const puestos = {};
  for (let i = 1; i <= NUM_PUESTOS; i++) {
    puestos[String(i)] = { turnoActivo: null };
  }
  return puestos;
}

// Garantiza que el estado leído tenga la forma esperada (migra estados antiguos)
function normalizar(est) {
  if (!est.puestos || typeof est.puestos !== 'object') {
    est.puestos = puestosVacios();
  }
  for (let i = 1; i <= NUM_PUESTOS; i++) {
    const clave = String(i);
    if (!est.puestos[clave]) est.puestos[clave] = { turnoActivo: null };
  }
  if (typeof est.ausentesHoy !== 'number') est.ausentesHoy = 0;
  return est;
}

let estado = null;

async function inicializar() {
  estado = normalizar(await leerEstado());
  await verificarReset();
  return estado;
}

// Reinicia el estado si cambió el día (zona horaria America/Bogota).
// Devuelve true si hubo reseteo. Se llama al arrancar y periódicamente.
async function verificarReset() {
  const hoy = fechaHoyBogota();
  if (estado.fecha === hoy) return false;

  console.log(`[turnos] Nuevo día detectado (${estado.fecha} → ${hoy}), reseteando estado`);
  estado.cola = [];
  estado.puestos = puestosVacios();
  estado.contadorServicios = { 'check-in': 0, 'check-out': 0, 'informacion': 0, 'concierge': 0 };
  estado.atendidosHoy = 0;
  estado.ausentesHoy = 0;
  estado.fecha = hoy;
  await escribirEstado(estado);
  return true;
}

function obtenerEstado() {
  return estado;
}

function validarPuesto(puesto) {
  const clave = String(puesto);
  if (!estado.puestos[clave]) {
    throw new Error(`Puesto inválido: ${puesto}`);
  }
  return clave;
}

async function crearTurno(servicio, nombre, observacion = '') {
  if (!SERVICIOS_VALIDOS.includes(servicio)) {
    throw new Error(`Servicio inválido: ${servicio}`);
  }
  if (!nombre || !nombre.trim()) {
    throw new Error('El nombre es requerido');
  }

  estado.contadorServicios[servicio]++;
  if (estado.contadorServicios[servicio] > 99) {
    estado.contadorServicios[servicio] = 1;
  }

  const numero = String(estado.contadorServicios[servicio]).padStart(2, '0');

  const turno = {
    id: uuidv4(),
    numero,
    servicio,
    nombre: nombre.trim(),
    observacion: observacion.trim(),
    creadoEn: new Date().toISOString()
  };

  estado.cola.push(turno);
  await escribirEstado(estado);

  console.log(`[turnos] Turno creado: ${servicio} N° ${numero} — ${turno.nombre}`);
  return turno;
}

async function llamarSiguiente(puesto) {
  const clave = validarPuesto(puesto);

  if (estado.cola.length === 0) {
    throw new Error('No hay turnos en espera');
  }

  // Si este puesto ya tenía un turno activo, se da por atendido al llamar al siguiente
  if (estado.puestos[clave].turnoActivo) {
    estado.atendidosHoy++;
    console.log(`[turnos] Recepción ${clave} cierra turno previo: ${estado.puestos[clave].turnoActivo.servicio} N° ${estado.puestos[clave].turnoActivo.numero}`);
  }

  const turno = estado.cola.shift();
  turno.puesto = Number(clave);
  turno.activadoEn = new Date().toISOString();
  turno.anuncio = 'encolado'; // encolado → anunciando → anunciado
  estado.puestos[clave].turnoActivo = turno;
  await escribirEstado(estado);

  console.log(`[turnos] Recepción ${clave} llama: ${turno.servicio} N° ${turno.numero}`);
  return turno;
}

async function marcarAtendido(puesto) {
  const clave = validarPuesto(puesto);

  if (!estado.puestos[clave].turnoActivo) {
    throw new Error('No hay turno activo en este puesto');
  }

  const turno = estado.puestos[clave].turnoActivo;
  console.log(`[turnos] Recepción ${clave} atiende: ${turno.servicio} N° ${turno.numero}`);
  estado.atendidosHoy++;
  estado.puestos[clave].turnoActivo = null;
  await escribirEstado(estado);
}

// Actualiza la fase del anuncio de un turno activo (lo reporta la TV).
// No persiste a disco: es estado efímero de UI.
function actualizarAnuncio(id, fase) {
  for (const clave of Object.keys(estado.puestos)) {
    const t = estado.puestos[clave].turnoActivo;
    if (t && t.id === id) {
      t.anuncio = fase;
      return true;
    }
  }
  return false;
}

async function marcarAusente(puesto) {
  const clave = validarPuesto(puesto);

  if (!estado.puestos[clave].turnoActivo) {
    throw new Error('No hay turno activo en este puesto');
  }

  const turno = estado.puestos[clave].turnoActivo;
  console.log(`[turnos] Recepción ${clave} marca AUSENTE: ${turno.servicio} N° ${turno.numero} — ${turno.nombre}`);
  estado.ausentesHoy++;
  estado.puestos[clave].turnoActivo = null;
  await escribirEstado(estado);
}

async function cancelarTurno(id) {
  const indice = estado.cola.findIndex(t => t.id === id);
  if (indice === -1) {
    throw new Error('Turno no encontrado');
  }

  const [turno] = estado.cola.splice(indice, 1);
  await escribirEstado(estado);

  console.log(`[turnos] Cancelado: ${turno.servicio} N° ${turno.numero}`);
  return turno;
}

module.exports = { inicializar, verificarReset, obtenerEstado, crearTurno, llamarSiguiente, marcarAtendido, marcarAusente, actualizarAnuncio, cancelarTurno, NUM_PUESTOS };
