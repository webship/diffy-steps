'use strict';

// A small PNG decoder for the mock Diffy API, so it can compare two uploaded
// images by their pixels instead of their bytes. It reads the PNGs that
// browsers and screenshot tools write: 8-bit, not interlaced, grey, grey with
// alpha, RGB, RGBA or palette. Anything else is reported as unreadable and the
// caller falls back to comparing the bytes.

const zlib = require('zlib');

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Decode a PNG to RGBA pixels.
 *
 * @param {Buffer} buffer
 * @returns {{width: number, height: number, data: Uint8Array}|null} Null when the file is not a PNG this decoder reads.
 */
function decodePng(buffer) {
  if (buffer.length < 33 || !buffer.slice(0, 8).equals(SIGNATURE)) return null;
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = -1;
  let interlace = 0;
  let palette = null;
  const parts = [];
  for (let at = 8; at + 8 <= buffer.length;) {
    const length = buffer.readUInt32BE(at);
    const kind = buffer.slice(at + 4, at + 8).toString('latin1');
    const data = buffer.slice(at + 8, at + 8 + length);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (kind === 'PLTE') {
      palette = data;
    } else if (kind === 'IDAT') {
      parts.push(data);
    } else if (kind === 'IEND') {
      break;
    }
    at += 12 + length;
  }
  if (!width || !height || depth !== 8 || interlace !== 0 || !CHANNELS[type] || (type === 3 && !palette)) return null;

  const channels = CHANNELS[type];
  const stride = width * channels;
  let raw;
  try {
    raw = zlib.inflateSync(Buffer.concat(parts));
  } catch (e) {
    return null;
  }
  if (raw.length < (stride + 1) * height) return null;

  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = rows.subarray(y * stride, (y + 1) * stride);
    const up = y ? rows.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? out[x - channels] : 0;
      const above = up ? up[x] : 0;
      const corner = up && x >= channels ? up[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += above;
      else if (filter === 3) value += (left + above) >> 1;
      else if (filter === 4) {
        const p = left + above - corner;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - above);
        const pc = Math.abs(p - corner);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? above : corner;
      } else if (filter !== 0) {
        return null;
      }
      out[x] = value & 0xff;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    let r;
    let g;
    let b;
    let a = 255;
    if (type === 6) [r, g, b, a] = [rows[s], rows[s + 1], rows[s + 2], rows[s + 3]];
    else if (type === 2) [r, g, b] = [rows[s], rows[s + 1], rows[s + 2]];
    else if (type === 0) r = g = b = rows[s];
    else if (type === 4) { r = g = b = rows[s]; a = rows[s + 1]; } else [r, g, b] = [palette[rows[s] * 3], palette[rows[s] * 3 + 1], palette[rows[s] * 3 + 2]];
    rgba.set([r, g, b, a], i * 4);
  }
  return { width, height, data: rgba };
}

/**
 * Share of pixels, in percent, that differ between two decoded images by more
 * than a small tolerance per channel. A difference in size counts the pixels
 * of the larger image that the smaller one does not cover.
 *
 * @param {{width: number, height: number, data: Uint8Array}} a
 * @param {{width: number, height: number, data: Uint8Array}} b
 * @param {number} [tolerance=8] - Allowed difference per channel, 0 to 255.
 * @returns {number}
 */
function pixelDifference(a, b, tolerance = 8) {
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  let different = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= a.width || y >= a.height || x >= b.width || y >= b.height) {
        different++;
        continue;
      }
      const i = (y * a.width + x) * 4;
      const j = (y * b.width + x) * 4;
      if (Math.abs(a.data[i] - b.data[j]) > tolerance || Math.abs(a.data[i + 1] - b.data[j + 1]) > tolerance
        || Math.abs(a.data[i + 2] - b.data[j + 2]) > tolerance || Math.abs(a.data[i + 3] - b.data[j + 3]) > tolerance) {
        different++;
      }
    }
  }
  return (100 * different) / (width * height);
}

/**
 * A solid-colour PNG, for tests.
 *
 * @param {number} width
 * @param {number} height
 * @param {number[]} rgb
 * @returns {Buffer}
 */
function solidPng(width, height, rgb) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const check = Buffer.alloc(4);
    check.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, check]);
  };
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array(height).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { decodePng, pixelDifference, solidPng };
