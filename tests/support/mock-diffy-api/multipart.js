'use strict';

// Minimal multipart/form-data parser for the mock Diffy API. It returns every
// part as { name, filename, contentType, data }, which is all the upload
// endpoints need.

/**
 * Split a multipart body into its parts.
 *
 * @param {Buffer} body
 * @param {string} contentType - The request Content-Type header.
 * @returns {{name: string, filename: (string|null), contentType: (string|null), data: Buffer}[]}
 */
function parseMultipart(body, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!match) return [];
  const delimiter = Buffer.from('--' + (match[1] || match[2]));
  const parts = [];
  let start = body.indexOf(delimiter);
  while (start !== -1) {
    const from = start + delimiter.length;
    if (body.slice(from, from + 2).toString() === '--') break;
    const next = body.indexOf(delimiter, from);
    if (next === -1) break;
    // Each part is "\r\n<headers>\r\n\r\n<data>\r\n" between two delimiters.
    const part = body.slice(from + 2, next - 2);
    const split = part.indexOf('\r\n\r\n');
    if (split !== -1) {
      const head = part.slice(0, split).toString('utf8');
      const disposition = /content-disposition:[^\r\n]*/i.exec(head);
      const name = disposition && /\bname="([^"]*)"/.exec(disposition[0]);
      const filename = disposition && /\bfilename="([^"]*)"/.exec(disposition[0]);
      const type = /content-type:\s*([^\r\n]+)/i.exec(head);
      parts.push({
        name: name ? name[1] : '',
        filename: filename ? filename[1] : null,
        contentType: type ? type[1].trim() : null,
        data: part.slice(split + 4),
      });
    }
    start = next;
  }
  return parts;
}

module.exports = { parseMultipart };
