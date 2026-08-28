import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const root = join(import.meta.dirname, "..");
const fixturesDir = join(root, "e2e", "fixtures");
mkdirSync(fixturesDir, { recursive: true });

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makePNG(w, h, pixels) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter none
    for (let x = 0; x < w; x++) {
      const off = y * (w * 4 + 1) + 1 + x * 4;
      const val = pixels[y * w + x] ?? 128;
      raw[off] = val; raw[off+1] = val; raw[off+2] = val; raw[off+3] = 255;
    }
  }
  const deflated = deflateSync(raw, { level: 6 });

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4);
  ihdr.writeUInt32BE(w, 8);
  ihdr.writeUInt32BE(h, 12);
  ihdr[16] = 8; // bit depth
  ihdr[17] = 6; // RGBA
  ihdr[18] = 0; ihdr[19] = 0; ihdr[20] = 0; // compression, filter, interlace
  ihdr.writeUInt32BE(crc32(ihdr.slice(4, 21)), 21);

  const idat = Buffer.alloc(8 + deflated.length + 4);
  idat.writeUInt32BE(deflated.length, 0);
  idat.write("IDAT", 4);
  deflated.copy(idat, 8);
  idat.writeUInt32BE(crc32(idat.slice(4, 8 + deflated.length)), 8 + deflated.length);

  const iend = Buffer.alloc(12);
  iend.writeUInt32BE(0, 0);
  iend.write("IEND", 4);
  iend.writeUInt32BE(crc32(iend.slice(4, 8)), 8);

  return Buffer.concat([sig, ihdr, idat, iend]);
}

function gradient(w, h) {
  const p = new Uint8Array(w * h);
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      p[y * w + x] = Math.min(255, Math.max(0, Math.round(80 + ((x - cx) ** 2 + (y - cy) ** 2) / 2000)));
  return p;
}

const SZ = 512;
const room = makePNG(SZ, SZ, gradient(SZ, SZ));
writeFileSync(join(fixturesDir, "room.png"), room);
console.log(`Created room.png (${room.length} bytes)`);

writeFileSync(join(fixturesDir, "floor-plan.png"), room);
console.log(`Created floor-plan.png (${room.length} bytes)`);

writeFileSync(join(fixturesDir, "facade.png"), room);
console.log(`Created facade.png (${room.length} bytes)`);

// JPEG — same content but with JPEG headers
function makeJPEG(w, h) {
  // Minimal baseline JPEG (JFIF)
  const q = 50;
  const buf = Buffer.alloc(2048);
  let off = 0;
  // SOI
  buf[off++] = 0xFF; buf[off++] = 0xD8;
  // APP0 JFIF
  buf[off++] = 0xFF; buf[off++] = 0xE0;
  buf.writeUInt16BE(16, off); off += 2;
  buf.write("JFIF\x00", off); off += 5;
  buf[off++] = 1; buf[off++] = 1; // version
  buf[off++] = 0; // units
  buf.writeUInt16BE(1, off); off += 2; // X density
  buf.writeUInt16BE(1, off); off += 2; // Y density
  buf[off++] = 0; buf[off++] = 0; // thumbnail
  // DQT
  buf[off++] = 0xFF; buf[off++] = 0xDB;
  buf.writeUInt16BE(67, off); off += 2;
  buf[off++] = 0; // precision 0 + table id 0
  for (let i = 0; i < 64; i++) buf[off++] = 16; // uniform quant
  // SOF0
  buf[off++] = 0xFF; buf[off++] = 0xC0;
  buf.writeUInt16BE(17, off); off += 2;
  buf[off++] = 8; // precision
  buf.writeUInt16BE(h, off); off += 2;
  buf.writeUInt16BE(w, off); off += 2;
  buf[off++] = 3; // components
  for (let c = 0; c < 3; c++) {
    buf[off++] = c + 1; // id
    buf[off++] = 0x11; // sampling
    buf[off++] = 0; // quant table
  }
  // SOS
  buf[off++] = 0xFF; buf[off++] = 0xDA;
  buf.writeUInt16BE(8, off); off += 2;
  buf[off++] = 3; // components
  for (let c = 0; c < 3; c++) { buf[off++] = c + 1; buf[off++] = 0; }
  buf[off++] = 0; buf[off++] = 63; buf[off++] = 0;
  // entropy-coded data (all zeros, minimal valid scan)
  buf[off++] = 0x00; buf[off++] = 0x3F; buf[off++] = 0x00;
  // EOI
  buf[off++] = 0xFF; buf[off++] = 0xD9;
  return buf.slice(0, off);
}

const house = makeJPEG(512, 512);
writeFileSync(join(fixturesDir, "house.jpg"), house);
console.log(`Created house.jpg (${house.length} bytes)`);