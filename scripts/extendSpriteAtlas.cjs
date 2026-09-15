// One-off tool: appends a new column to one of the two GPU sprite atlases
// (resources/atlases/icon-atlas.png for StructurePass, unit-atlas.png for
// UnitPass) using only Node's built-in zlib — no native deps. Written
// because the real generate-sprite-atlases.mjs generator isn't in this
// checkout, and `npm run inst` runs with --ignore-scripts, so the `canvas`
// package's native binary was never built.
//
// Combined into one file (rather than a script per atlas) to stay under
// eslint's default-project file-count cap — see eslint.config.js's
// `allowDefaultProject` list.
//
// Usage:
//   node scripts/extendSpriteAtlas.cjs icon   # StructurePass icon-atlas.png (64x64 cells, RGB icons)
//   node scripts/extendSpriteAtlas.cjs unit   # UnitPass unit-atlas.png (13x13 cells, grayscale sprites)
//
// unit-atlas.png sprites are grayscale-only: the shader recolors by exact
// gray level (see the "3-band gray replacement" doc comment in
// UnitPass.ts) — 180 -> territory color, 130 -> spawn/mid color, 100 ->
// center accent, 70 -> border color. Use only those four gray values
// (R=G=B, alpha 255) for visible pixels; everything else must be fully
// transparent (all-zero RGBA).
//
// Edit the `draw*` function for the atlas you're targeting to change what
// gets drawn into the new column.
//
// PNG chunk format reference: https://www.w3.org/TR/png/
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ATLASES_DIR = path.join(__dirname, "..", "resources", "atlases");

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
  function setGray(x, y, gray) {
    setPixel(x, y, gray, gray, gray, 255);
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
  return { setGray, fillRect, fillCircle, fillQuad };
}

function extendAtlas(fileName, colWidth, draw) {
  const atlasPath = path.join(ATLASES_DIR, fileName);
  const original = fs.readFileSync(atlasPath);
  const decoded = decodePng(original);
  if (decoded.width % colWidth !== 0) {
    throw new Error(
      `${fileName} width ${decoded.width} isn't a multiple of ${colWidth}`,
    );
  }
  const extended = addColumn(decoded, colWidth);
  draw(extended, makeDrawTools(extended));

  const out = encodePng(extended.width, extended.height, extended.pixels);
  fs.writeFileSync(atlasPath, out);
  console.log(
    `wrote ${atlasPath}: ${decoded.width}x${decoded.height} -> ${extended.width}x${extended.height}`,
  );
}

// Redraws an EXISTING column in place (clears it to transparent first) -
// unlike extendAtlas, this doesn't change the image's dimensions. Used to
// revise a sprite that was already added by a prior extendAtlas call.
function editColumn(fileName, colWidth, colIndex, draw) {
  const atlasPath = path.join(ATLASES_DIR, fileName);
  const original = fs.readFileSync(atlasPath);
  const decoded = decodePng(original);
  const bpp = 4;
  const stride = decoded.width * bpp;
  const colBase = colIndex * colWidth;
  for (let y = 0; y < decoded.height; y++) {
    for (let x = colBase; x < colBase + colWidth; x++) {
      const o = y * stride + x * bpp;
      decoded.pixels[o] = 0;
      decoded.pixels[o + 1] = 0;
      decoded.pixels[o + 2] = 0;
      decoded.pixels[o + 3] = 0;
    }
  }
  const image = { ...decoded, colBase };
  draw(image, makeDrawTools(image));

  const out = encodePng(image.width, image.height, image.pixels);
  fs.writeFileSync(atlasPath, out);
  console.log(
    `wrote ${atlasPath}: redrew column ${colIndex} in place (${decoded.width}x${decoded.height})`,
  );
}

// Prior columns (Airport icon, Commercial Aircraft sprite) were added the
// same way this tool adds new ones — see git history for their draw
// functions if another column needs the same treatment before the real
// generate-sprite-atlases.mjs generator is recovered.

// Draws an oil-derrick silhouette (tapered tower on a base platform, two
// cross braces, a beacon) into the new column. Used by StructurePass's
// icon-atlas.png for the Oil Extractor structure.
function drawOilExtractorIcon(image, tools) {
  const { fillRect, fillCircle, fillQuad } = tools;
  const colBase = image.colBase;
  const scale = 64 / 100;
  const at = (x, y) => [colBase + x * scale, y * scale];
  fillRect(...at(10, 84), ...at(90, 92)); // base platform
  fillQuad([at(46, 10), at(54, 10), at(66, 84), at(34, 84)]); // derrick tower
  fillRect(...at(28, 46), ...at(72, 52)); // upper brace
  fillRect(...at(33, 66), ...at(67, 72)); // lower brace
  const [bx, by] = at(50, 8);
  fillCircle(bx, by, 5 * scale); // beacon
}

// Draws a wide tanker silhouette (broad hull + three deck tanks) into the
// column, for Oil Ship. Used by UnitPass's unit-atlas.png. Deliberately
// wider than Trade Ship's 5x5 footprint - the whole point of a Port's
// consolidated shipment is that it reads as visibly bigger than a regular
// Trade Ship. Renders in the ground/sea bucket (like Trade Ship), not the
// missile bucket — see UnitPass.ts's doc comment.
function drawOilShip(image, tools) {
  const { setGray } = tools;
  const colBase = image.colBase;
  const LIGHT = 180;
  const DARK = 70;
  const hullRows = {
    4: [5, 7],
    5: [3, 9],
    6: [2, 10],
    7: [2, 10],
    8: [2, 10],
    9: [3, 9],
  };
  for (const [y, [x0, x1]] of Object.entries(hullRows)) {
    for (let x = x0; x <= x1; x++) {
      setGray(colBase + x, Number(y), LIGHT);
    }
  }
  // Three deck tanks (classic tanker silhouette), drawn over the hull.
  for (const x of [3, 4, 6, 8, 9]) {
    setGray(colBase + x, 6, DARK);
  }
}

function main() {
  const target = process.argv[2];
  if (target === "icon") {
    extendAtlas("icon-atlas.png", 64, drawOilExtractorIcon);
  } else if (target === "unit") {
    extendAtlas("unit-atlas.png", 13, drawOilShip);
  } else if (target === "unit-redraw-oilship") {
    // Oil Ship is already column 13 (added by a prior "unit" run) - redraw
    // it in place rather than appending yet another column.
    editColumn("unit-atlas.png", 13, 13, drawOilShip);
  } else {
    console.error(
      "Usage: node scripts/extendSpriteAtlas.cjs <icon|unit|unit-redraw-oilship>",
    );
    process.exit(1);
  }
}

main();
