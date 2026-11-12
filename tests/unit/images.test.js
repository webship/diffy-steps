'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { imageWidth, mediaType, slugFor, collectFolderImages } = require('../step-definitions/diffy-images');

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'images');

test('the width is read from PNG headers and from the three WebP formats', () => {
  const png = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47]).copy(png);
  png.writeUInt32BE(1200, 16);
  assert.strictEqual(imageWidth(png), 1200);

  const riff = (kind) => {
    const b = Buffer.alloc(40);
    b.write('RIFF', 0);
    b.write('WEBP', 8);
    b.write(kind, 12);
    return b;
  };
  const lossy = riff('VP8 ');
  lossy.writeUInt16LE(640, 26);
  assert.strictEqual(imageWidth(lossy), 640);
  const lossless = riff('VP8L');
  lossless[21] = (320 - 1) & 0xff;
  lossless[22] = ((320 - 1) >> 8) & 0x3f;
  assert.strictEqual(imageWidth(lossless), 320);
  const extended = riff('VP8X');
  extended.writeUIntLE(1920 - 1, 24, 3);
  assert.strictEqual(imageWidth(extended), 1920);

  assert.strictEqual(imageWidth(Buffer.from('not an image')), 0);
});

test('the media type follows the extension', () => {
  assert.strictEqual(mediaType('a.png'), 'image/png');
  assert.strictEqual(mediaType('a.WEBP'), 'image/webp');
});

test('the URL is made from the path inside the folder', () => {
  assert.strictEqual(slugFor('home.png'), '/home');
  assert.strictEqual(slugFor('about/Page One.png'), '/about-page-one');
  assert.strictEqual(slugFor('about\\team.webp'), '/about-team');
});

test('a folder is collected in a stable order, with width, URL and type', () => {
  const found = collectFolderImages(path.join(FIXTURES, 'baseline'));
  assert.deepStrictEqual(found.map((i) => [i.url, i.breakpoint, i.contentType]), [['/about-1200', 1200, 'image/png'], ['/home-640', 640, 'image/png']]);
  assert.throws(() => collectFolderImages(path.join(FIXTURES, 'missing')), (e) => e.code === 'NO_FOLDER');
  assert.deepStrictEqual(collectFolderImages(__dirname), [], 'a folder without images gives an empty list');
});
