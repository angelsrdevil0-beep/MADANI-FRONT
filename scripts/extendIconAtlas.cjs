// One-off tool: appends a new column to resources/atlases/icon-atlas.png
// (the StructurePass sprite atlas) using only Node's built-in zlib — no
// native deps. Written because the real generate-sprite-atlases.mjs isn't
// in this checkout, and `npm run inst` runs with --ignore-scripts, so the
// `canvas` package's native binary was never built.
//
// Usage: node scripts/extendIconAtlas.cjs
// Edit the `draw()` call at the bottom to change what gets drawn into the
// new column — it currently draws the Airport control-tower icon,
// mirroring resources/images/AirportIconWhite.svg at 64x64.
//
// PNG chunk format reference: https://www.w3.org/TR/png/
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ATLAS_PATH = path.join(
  __dirname,
  "..",
  "resources",
  "atlases",
  "icon-atlas.png",
);

// --- CRC32 (PNG uses the standard zlib/gzip CRC32) ---
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function decodePng(buf) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf.readUInt8(24);
  const colorType = buf.readUInt8(25);
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(
      `unexpected PNG format bitDepth=${bitDepth} colorType=${colorType} (expected 8-bit RGBA)`,
    );
  }
  const bpp = 4;

  let off = 8;
  const idatParts = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    if (type === "IDAT") {
      idatParts.push(buf.subarray(off + 8, off + 8 + len));
    }
    off += 8 + len + 4;
  }
  const rawFiltered = zlib.inflateSync(Buffer.concat(idatParts));

  const stride = width * bpp;
  const pixels = Buffer.alloc(width * height * bpp);
  let prevRow = Buffer.alloc(stride);
  let srcOff = 0;
  for (let y = 0; y < height; y++) {
    const filterType = rawFiltered[srcOff];
    srcOff += 1;
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const raw = rawFiltered[srcOff + x];
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prevRow[x];
      const c = x >= bpp ? prevRow[x - bpp] : 0;
      let val;
      switch (filterType) {
        case 0:
          val = raw;
          break;
        case 1: // Sub
          val = (raw + a) & 0xff;
          break;
        case 2: // Up
          val = (raw + b) & 0xff;
          break;
        case 3: // Average
          val = (raw + ((a + b) >> 1)) & 0xff;
          break;
        case 4: {
          // Paeth
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          val = (raw + pred) & 0xff;
          break;
        }
        default:
          throw new Error(`unsupported filter type ${filterType}`);
      }
      row[x] = val;
    }
    row.copy(pixels, y * stride);
    prevRow = row;
    srcOff += stride;
  }
  return { width, height, pixels };
}

function encodePng(width, height, pixels) {
  const bpp = 4;
  const stride = width * bpp;
  const filtered = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    filtered[y * (stride + 1)] = 0; // filter type 0 (None)
    pixels.copy(
      filtered,
      y * (stride + 1) + 1,
      y * stride,
      y * stride + stride,
    );
  }
  const idat = zlib.deflateSync(filtered, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter method
  ihdr.writeUInt8(0, 12); // interlace

  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    PNG_SIG,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", idat),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Appends `colWidth` blank columns to the right of a decoded image. */
function addColumn(image, colWidth) {
  const bpp = 4;
  const newWidth = image.width + colWidth;
  const oldStride = image.width * bpp;
  const newStride = newWidth * bpp;
  const newPixels = Buffer.alloc(newWidth * image.height * bpp);
  for (let y = 0; y < image.height; y++) {
    image.pixels.copy(
      newPixels,
      y * newStride,
      y * oldStride,
      y * oldStride + oldStride,
    );
  }
  return {
    width: newWidth,
    height: image.height,
    pixels: newPixels,
    colBase: image.width,
  };
}

function makeDrawTools(image) {
  const bpp = 4;
  const stride = image.width * bpp;
  function setPixel(x, y, r, g, b, a) {
    if (x < 0 || x >= image.width || y < 0 || y >= image.height) return;
    const o = y * stride + x * bpp;
    image.pixels[o] = r;
    image.pixels[o + 1] = g;
    image.pixels[o + 2] = b;
    image.pixels[o + 3] = a;
  }
  function fillRect(x0, y0, x1, y1) {
    for (let y = Math.max(0, y0); y < Math.min(image.height, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(image.width, x1); x++) {
        setPixel(x, y, 255, 255, 255, 255);
      }
    }
  }
  function fillCircle(cx, cy, r) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) setPixel(x, y, 255, 255, 255, 255);
      }
    }
  }
  function sign(px, py, ax, ay, bx, by) {
    return (px - bx) * (ay - by) - (ax - bx) * (py - by);
  }
  function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
    const d1 = sign(px, py, ax, ay, bx, by);
    const d2 = sign(px, py, bx, by, cx, cy);
    const d3 = sign(px, py, cx, cy, ax, ay);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
  }
  /** Fills a convex quad given as 4 [x,y] points (already offset by caller). */
  function fillQuad(pts) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = Math.floor(Math.min(...xs));
    const maxX = Math.ceil(Math.max(...xs));
    const minY = Math.floor(Math.min(...ys));
    const maxY = Math.ceil(Math.max(...ys));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        if (
          inTriangle(px, py, xs[0], ys[0], xs[1], ys[1], xs[2], ys[2]) ||
          inTriangle(px, py, xs[0], ys[0], xs[2], ys[2], xs[3], ys[3])
        ) {
          setPixel(x, y, 255, 255, 255, 255);
        }
      }
    }
  }
  return { fillRect, fillCircle, fillQuad };
}

function main() {
  const original = fs.readFileSync(ATLAS_PATH);
  const decoded = decodePng(original);
  const colWidth = 64; // existing icon-atlas.png columns are all 64x64
  if (decoded.width % colWidth !== 0) {
    throw new Error(
      `atlas width ${decoded.width} isn't a multiple of ${colWidth}`,
    );
  }
  const extended = addColumn(decoded, colWidth);
  const { fillRect, fillCircle, fillQuad } = makeDrawTools(extended);

  // Draw the Airport icon (control tower) into the new column, scaled from
  // the 0..100 viewBox of resources/images/AirportIconWhite.svg to 64x64.
  const colBase = extended.colBase;
  const scale = colWidth / 100;
  const at = (x, y) => [colBase + x * scale, y * scale];
  fillRect(...at(10, 88), ...at(90, 94)); // runway
  fillQuad([at(46, 90), at(40, 46), at(60, 46), at(54, 90)]); // tower shaft
  fillRect(...at(32, 30), ...at(68, 48)); // cabin
  fillRect(...at(48, 10), ...at(52, 30)); // mast
  const [bx, by] = at(50, 8);
  fillCircle(bx, by, 5 * scale); // beacon

  const out = encodePng(extended.width, extended.height, extended.pixels);
  fs.writeFileSync(ATLAS_PATH, out);
  console.log(
    `wrote ${ATLAS_PATH}: ${decoded.width}x${decoded.height} -> ${extended.width}x${extended.height}`,
  );
}

main();
