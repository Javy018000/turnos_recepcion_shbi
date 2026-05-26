const { v4: uuidv4 } = require('uuid');
const { leerEstado, escribirEstado } = require('./persistencia');

const SERVICIOS_VALIDOS = ['check-in', 'check-out', 'informacion', 'concierge'];

function fechaHoyBogota() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

let estado = null;

async function inicializar() {
  estado = await leerEstado();
  const hoy = fechaHoyBogota();
  if (estado.fecha !== hoy) {
    console.log(`[turnos] Nuevo día detectado (${estado.fecha} → ${hoy}), reseteando estado`);
    estado.cola = [];
    estado.turnoActivo = null;
    estado.contadorServicios = { 'check-in': 0, 'check-out': 0, 'informacion': 0, 'concierge': 0 };
    estado.atendidosHoy = 0;
    estado.fecha = hoy;
    await escribirEstado(estado);
  }
  return estado;
}

function obtenerEstado() {
  return estado;
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

async function llamarSiguiente() {
  if (estado.cola.length === 0) {
    throw new Error('No hay turnos en espera');
  }

  if (estado.turnoActivo) {
    estado.atendidosHoy++;
    console.log(`[turnos] Turno anterior saltado: ${estado.turnoActivo.servicio} N° ${estado.turnoActivo.numero}`);
  }

  estado.turnoActivo = estado.cola.shift();
  await escribirEstado(estado);

  console.log(`[turnos] Llamando: ${estado.turnoActivo.servicio} N° ${estado.turnoActivo.numero}`);
  return estado.turnoActivo;
}

async function marcarAtendido() {
  if (!estado.turnoActivo) {
    throw new Error('No hay turno activo');
  }

  console.log(`[turnos] Atendido: ${estado.turnoActivo.servicio} N° ${estado.turnoActivo.numero}`);
  estado.atendidosHoy++;
  estado.turnoActivo = null;
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

module.exports = { inicializar, obtenerEstado, crearTurno, llamarSiguiente, marcarAtendido, cancelarTurno };
