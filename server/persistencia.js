const fs = require('fs').promises;
const path = require('path');

const RUTA_STATE = path.join(__dirname, '../data/state.json');
const RUTA_TMP = path.join(__dirname, '../data/state.tmp.json');
const RUTA_DATA = path.join(__dirname, '../data');

const ESTADO_VACIO = {
  cola: [],
  turnoActivo: null,
  contadorServicios: {
    'check-in': 0,
    'check-out': 0,
    'informacion': 0,
    'concierge': 0
  },
  atendidosHoy: 0,
  fecha: ''
};

async function leerEstado() {
  try {
    await fs.mkdir(RUTA_DATA, { recursive: true });
    const contenido = await fs.readFile(RUTA_STATE, 'utf8');
    return JSON.parse(contenido);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const estado = { ...ESTADO_VACIO };
      await escribirEstado(estado);
      return estado;
    }
    console.error('[persistencia] state.json corrupto, usando estado vacío:', error.message);
    const estado = { ...ESTADO_VACIO };
    await escribirEstado(estado);
    return estado;
  }
}

async function escribirEstado(estado) {
  await fs.mkdir(RUTA_DATA, { recursive: true });
  await fs.writeFile(RUTA_TMP, JSON.stringify(estado, null, 2), 'utf8');
  await fs.rename(RUTA_TMP, RUTA_STATE);
}

module.exports = { leerEstado, escribirEstado, ESTADO_VACIO };
