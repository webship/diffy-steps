'use strict';

// Image helpers for the Diffy steps: read the width of a PNG or WebP file (the
// width is the breakpoint Diffy files the image under), derive the URL Diffy
// files it under from its path, and collect the images of a folder the way
// Diffy's own CLI does (`diffy screenshot:create-folder`).

const fs = require('fs');
const path = require('path');

/**
 * Width in pixels of a PNG or WebP image, or 0 when the buffer is neither.
 *
 * @param {Buffer} buffer
 * @returns {number}
 */
function imageWidth(buffer) {
  if (buffer.length >= 24 && buffer[0] === 0x89 && buffer.slice(1, 4).toString() === 'PNG') {
    return buffer.readUInt32BE(16);
  }
  if (buffer.length >= 30 && buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') {
    const kind = buffer.slice(12, 16).toString();
    if (kind === 'VP8 ') return buffer.readUInt16LE(26) & 0x3fff;
    if (kind === 'VP8L') return 1 + (((buffer[22] & 0x3f) << 8) | buffer[21]);
    if (kind === 'VP8X') return 1 + buffer.readUIntLE(24, 3);
  }
  return 0;
}

/**
 * Media type of an image file, by its extension.
 *
 * @param {string} file
 * @returns {string}
 */
function mediaType(file) {
  return /\.webp$/i.test(file) ? 'image/webp' : 'image/png';
}

/**
 * The URL Diffy files an image under: the path inside the folder with
 * separators turned into dashes, the extension dropped, lower-cased and made
 * URL-safe. `home/Page One.png` becomes `/home-page-one`.
 *
 * @param {string} relativePath
 * @returns {string}
 */
function slugFor(relativePath) {
  const name = path.parse(relativePath.replace(/[\\/]/g, '-')).name;
  return '/' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Every PNG and WebP file under a folder, in a stable order, with its Diffy
 * URL, width and media type.
 *
 * @param {string} folder
 * @returns {{file: string, filename: string, url: string, breakpoint: number, contentType: string, buffer: Buffer}[]}
 *   Empty when the folder holds no image.
 * @throws {Error} With the offending path when the folder is missing or an image has no readable width.
 */
function collectFolderImages(folder) {
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    const error = new Error(`Folder not found: ${folder}`);
    error.code = 'NO_FOLDER';
    throw error;
  }
  const found = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(png|webp)$/i.test(entry.name)) found.push(full);
    }
  })(folder);
  const relative = (file) => path.relative(folder, file);
  found.sort((a, b) => (relative(a) < relative(b) ? -1 : relative(a) > relative(b) ? 1 : 0));
  return found.map((file) => {
    const buffer = fs.readFileSync(file);
    const breakpoint = imageWidth(buffer);
    if (!breakpoint) {
      const error = new Error(`Cannot read the width of ${file}`);
      error.code = 'NO_WIDTH';
      throw error;
    }
    return { file, filename: path.basename(file), url: slugFor(relative(file)), breakpoint, contentType: mediaType(file), buffer };
  });
}

module.exports = { imageWidth, mediaType, slugFor, collectFolderImages };
