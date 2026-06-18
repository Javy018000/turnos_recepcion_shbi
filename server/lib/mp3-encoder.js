// Conversor WAV (PCM 16-bit) → MP3 en JavaScript puro.
// Usa lamejs vendorizado (server/lib/lame.min.js) para no depender de ffmpeg
// ni de binarios externos: viaja con el repo y funciona tras un git pull.

const lamejs = require('./lame.min.js');

// Recorre los chunks del WAV y devuelve { audioFormat, channels, sampleRate,
// bitsPerSample, dataOffset, dataLen }. No asume cabecera de 44 bytes porque
// SAPI escribe un chunk "fmt " de 18 bytes (datos a partir del offset 46).
function leerCabeceraWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('No es un archivo WAV válido');
  }
  let fmt = null;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const sz = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      fmt = {
        audioFormat:   buf.readUInt16LE(off + 8),
        channels:      buf.readUInt16LE(off + 10),
        sampleRate:    buf.readUInt32LE(off + 12),
        bitsPerSample: buf.readUInt16LE(off + 22)
      };
    } else if (id === 'data') {
      if (!fmt) throw new Error('Chunk "data" antes de "fmt "');
      return Object.assign(fmt, { dataOffset: off + 8, dataLen: sz });
    }
    off += 8 + sz + (sz % 2); // los chunks se alinean a byte par
  }
  throw new Error('No se encontró el chunk "data"');
}

// Convierte un Buffer WAV a un Buffer MP3. kbps por defecto 64 (suficiente
// para voz). Soporta mono y estéreo PCM de 16 bits.
function wavABuferMp3(wavBuf, kbps = 64) {
  const h = leerCabeceraWav(wavBuf);
  if (h.audioFormat !== 1 || h.bitsPerSample !== 16) {
    throw new Error(`Formato no soportado (fmt=${h.audioFormat}, bits=${h.bitsPerSample})`);
  }

  // Vista Int16 sobre la región de datos, copiada a un buffer alineado.
  const dataLen = Math.min(h.dataLen, wavBuf.length - h.dataOffset);
  const pcm = new Int16Array(dataLen >> 1);
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] = wavBuf.readInt16LE(h.dataOffset + i * 2);
  }

  const encoder = new lamejs.Mp3Encoder(h.channels, h.sampleRate, kbps);
  const partes = [];
  const BLOQUE = 1152;

  if (h.channels === 1) {
    for (let i = 0; i < pcm.length; i += BLOQUE) {
      const chunk = pcm.subarray(i, i + BLOQUE);
      const mp3 = encoder.encodeBuffer(chunk);
      if (mp3.length > 0) partes.push(Buffer.from(mp3));
    }
  } else {
    // Estéreo intercalado L/R → separar canales por bloque
    const muestrasPorCanal = pcm.length / h.channels;
    const left  = new Int16Array(BLOQUE);
    const right = new Int16Array(BLOQUE);
    for (let i = 0; i < muestrasPorCanal; i += BLOQUE) {
      const n = Math.min(BLOQUE, muestrasPorCanal - i);
      for (let j = 0; j < n; j++) {
        left[j]  = pcm[(i + j) * 2];
        right[j] = pcm[(i + j) * 2 + 1];
      }
      const mp3 = encoder.encodeBuffer(left.subarray(0, n), right.subarray(0, n));
      if (mp3.length > 0) partes.push(Buffer.from(mp3));
    }
  }

  const fin = encoder.flush();
  if (fin.length > 0) partes.push(Buffer.from(fin));

  return Buffer.concat(partes);
}

module.exports = { wavABuferMp3, leerCabeceraWav };
