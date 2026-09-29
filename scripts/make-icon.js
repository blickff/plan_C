/* Draws the app icon and writes build/icon.ico plus build/icon.png.

   The mark is the completion ring the panel already uses, on the dark
   card colour: the one shape a person who has used the app for a day
   already recognises. Drawn by hand because the project has no image
   tooling and does not need any for one file. */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SS = 4; // supersampling factor, for edges that are not staircases

const BG = [20, 20, 20];
const TRACK = [255, 255, 255, 0.16];
const ARC = [34, 197, 94]; // --ok on the dark theme

function mix(base, over, alpha) {
  return [
    Math.round(base[0] * (1 - alpha) + over[0] * alpha),
    Math.round(base[1] * (1 - alpha) + over[1] * alpha),
    Math.round(base[2] * (1 - alpha) + over[2] * alpha)
  ];
}

/* One sample: returns [r,g,b,a] at a point in a size×size icon. */
function sample(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;

  // Rounded square, Windows-ish corner radius.
  const r = size * 0.22;
  const half = size / 2;
  const dx = Math.abs(x - cx) - (half - r);
  const dy = Math.abs(y - cy) - (half - r);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - r;
  if (outside > 0) return [0, 0, 0, 0];

  let colour = BG;

  // The ring.
  const dist = Math.hypot(x - cx, y - cy);
  const outer = size * 0.34;
  const inner = size * 0.24;

  if (dist <= outer && dist >= inner) {
    // Angle from twelve o'clock, clockwise, 0..1
    let a = Math.atan2(x - cx, cy - y) / (Math.PI * 2);
    if (a < 0) a += 1;
    const filled = a <= 0.72;
    colour = filled ? mix(colour, ARC, 1) : mix(colour, [255, 255, 255], TRACK[3]);
  }

  return [colour[0], colour[1], colour[2], 255];
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const s = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, size);
          r += s[0] * s[3]; g += s[1] * s[3]; b += s[2] * s[3]; a += s[3];
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      if (a > 0) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
      }
      px[i + 3] = Math.round(a / n);
    }
  }

  return px;
}

/* PNG ---------------------------------------------------------------- */

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function toPng(px, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ICO ----------------------------------------------------------------
   PNG-compressed entries, which Windows has accepted since Vista and
   which electron-builder expects for the 256 pixel size. */

function toIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);            // type: icon
  header.writeUInt16LE(images.length, 4);

  const dir = Buffer.alloc(16 * images.length);
  let offset = header.length + dir.length;
  const blobs = [];

  images.forEach((img, i) => {
    const at = i * 16;
    dir[at] = img.size >= 256 ? 0 : img.size;      // 0 means 256
    dir[at + 1] = img.size >= 256 ? 0 : img.size;
    dir[at + 2] = 0;                                // palette
    dir[at + 3] = 0;                                // reserved
    dir.writeUInt16LE(1, at + 4);                   // colour planes
    dir.writeUInt16LE(32, at + 6);                  // bits per pixel
    dir.writeUInt32LE(img.png.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += img.png.length;
    blobs.push(img.png);
  });

  return Buffer.concat([header, dir, ...blobs]);
}

/* The tray / menu-bar icon: just the ring, a white band with a dark
   edge on either side, so it reads on a light taskbar and a dark one
   without needing a separate image for each. */
function renderTray(size) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const scale = size / 32;
  const bands = [
    { from: 7.9 * scale, to: 9.2 * scale, rgba: [20, 20, 20, 235] },
    { from: 9.2 * scale, to: 12.2 * scale, rgba: [255, 255, 255, 255] },
    { from: 12.2 * scale, to: 13.6 * scale, rgba: [20, 20, 20, 235] }
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const d = Math.hypot(x + (sx + 0.5) / SS - c, y + (sy + 0.5) / SS - c);
          const band = bands.find((k) => d >= k.from && d < k.to);
          if (!band) continue;
          const al = band.rgba[3] / 255;
          r += band.rgba[0] * al; g += band.rgba[1] * al; b += band.rgba[2] * al; a += al;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      if (a > 0) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
      }
      px[i + 3] = Math.round((a / n) * 255);
    }
  }
  return px;
}

const out = path.join(process.cwd(), 'build');
fs.mkdirSync(out, { recursive: true });

const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = sizes.map((size) => ({ size, png: toPng(render(size), size) }));

fs.writeFileSync(path.join(out, 'icon.ico'), toIco(images));

/* 1024 for macOS: the Mac build turns it into an .icns and refuses
   anything under 512. Windows uses the .ico above and never reads this. */
fs.writeFileSync(path.join(out, 'icon.png'), toPng(render(1024), 1024));

/* The tray icon at its real size and at double, for sharp screens.
   Electron picks up the @2x file on its own when it loads tray.png — and
   on a Mac, where the menu bar is 22 points tall, the old 32 pixel
   single image came out twice the height of everything beside it. */
const desk = path.join(process.cwd(), 'desktop');
fs.writeFileSync(path.join(desk, 'tray.png'), toPng(renderTray(16), 16));
fs.writeFileSync(path.join(desk, 'tray@2x.png'), toPng(renderTray(32), 32));

['build/icon.ico', 'build/icon.png', 'desktop/tray.png', 'desktop/tray@2x.png'].forEach((f) => {
  console.log(f, fs.statSync(path.join(process.cwd(), f)).size, 'bytes');
});
