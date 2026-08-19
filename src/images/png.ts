/**
 * PNG decoding, with no dependency beyond Node's own zlib.
 *
 * The container is a chunk stream; the pixel data is a zlib-deflated sequence
 * of scanlines, each prefixed with a filter byte that must be reversed before
 * the samples mean anything. Everything decodes to 8-bit RGBA so that the
 * rasteriser downstream has exactly one shape to handle.
 */
import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Samples per pixel, by PNG colour type. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Largest input accepted, per side.
 *
 * Decoding is synchronous and runs on Electron's main process, so an
 * unbounded input is a stall the caller cannot interrupt. The rasterised
 * output is always small — no more than the paper's printable width.
 */
export const MAX_IMAGE_DIMENSION = 4096;

/** Decoded image. Always 8-bit RGBA, four bytes per pixel, R,G,B,A order. */
export interface DecodedImage {
  width: number;
  height: number;
  /** `width * height * 4` bytes. */
  pixels: Buffer;
}

let crcTable: Int32Array | null = null;

function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** The Paeth predictor from the PNG specification. */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

interface Chunks {
  ihdr: Buffer;
  plte: Buffer | null;
  trns: Buffer | null;
  idat: Buffer[];
}

/** Walks the chunk stream, verifying every CRC. Unknown chunks are skipped. */
function readChunks(data: Buffer): Chunks {
  if (data.length < 8 || !data.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('Not a PNG: signature mismatch');
  }
  let offset = 8;
  let ihdr: Buffer | null = null;
  let plte: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];

  while (offset + 8 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString('ascii', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > data.length) {
      throw new Error(`Truncated PNG: chunk ${type} claims ${length} bytes`);
    }
    const body = data.subarray(offset + 8, offset + 8 + length);
    const declared = data.readUInt32BE(offset + 8 + length);
    if (crc32(data.subarray(offset + 4, offset + 8 + length)) !== declared) {
      throw new Error(`PNG chunk ${type} failed CRC check`);
    }
    if (type === 'IHDR') ihdr = body;
    else if (type === 'PLTE') plte = body;
    else if (type === 'tRNS') trns = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    offset = end;
  }

  if (!ihdr) throw new Error('PNG has no IHDR chunk');
  if (idat.length === 0) throw new Error('PNG has no IDAT chunk');
  return { ihdr, plte, trns, idat };
}

/**
 * Inflates the IDAT stream, capped at the size the declared dimensions imply.
 *
 * Without a ceiling, `inflateSync` will happily allocate up to Node's default
 * `buffer.kMaxLength` regardless of what IHDR declared — a tiny declared
 * image with a maliciously large IDAT stalls the (synchronous, main-process)
 * call and can OOM the process before the dimension check ever gets a say.
 */
function inflate(idat: Buffer, maxOutputLength: number): Buffer {
  try {
    return inflateSync(idat, { maxOutputLength });
  } catch (error) {
    if (error instanceof Error && /Cannot create a Buffer larger than/.test(error.message)) {
      throw new Error(
        `PNG pixel data exceeds ${maxOutputLength} bytes, more than its declared dimensions allow`
      );
    }
    throw error;
  }
}

/** Reverses the per-scanline filters, returning the raw sample bytes. */
function unfilter(inflated: Buffer, height: number, stride: number, bytesPerPixel: number): Buffer {
  const expected = (stride + 1) * height;
  if (inflated.length !== expected) {
    throw new Error(`PNG pixel data is ${inflated.length} bytes; ${expected} expected`);
  }
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filterType = inflated[y * (stride + 1)];
    const src = inflated.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = raw.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? raw.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bytesPerPixel ? prev[i - bytesPerPixel] : 0;
      let v = src[i];
      if (filterType === 1) v += a;
      else if (filterType === 2) v += b;
      else if (filterType === 3) v += (a + b) >> 1;
      else if (filterType === 4) v += paeth(a, b, c);
      else if (filterType !== 0) throw new Error(`Unknown PNG filter type ${filterType} on row ${y}`);
      row[i] = v & 0xff;
    }
  }
  return raw;
}

/** Decodes a PNG into 8-bit RGBA pixels. */
export function decodePNG(data: Buffer): DecodedImage {
  const { ihdr, plte, trns, idat } = readChunks(data);

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];

  if (width === 0 || height === 0) {
    throw new Error(`PNG has a zero dimension: ${width}x${height}`);
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw new Error(
      `PNG is ${width}x${height}; the maximum is ${MAX_IMAGE_DIMENSION}x${MAX_IMAGE_DIMENSION}`
    );
  }
  if (interlace !== 0) {
    throw new Error('Interlaced PNG is not supported; re-save without interlacing');
  }
  if (bitDepth === 16) {
    throw new Error('16-bit PNG is not supported; re-save as 8-bit');
  }
  const channels = CHANNELS[colorType];
  if (channels === undefined) {
    throw new Error(`Unsupported PNG colour type ${colorType}`);
  }
  const allowedDepths = colorType === 0 || colorType === 3 ? [1, 2, 4, 8] : [8];
  if (!allowedDepths.includes(bitDepth)) {
    throw new Error(`Unsupported bit depth ${bitDepth} for PNG colour type ${colorType}`);
  }
  if (colorType === 3 && !plte) {
    throw new Error('Palette PNG has no PLTE chunk');
  }

  const stride = Math.ceil((width * channels * bitDepth) / 8);
  const bytesPerPixel = Math.max(1, Math.ceil((channels * bitDepth) / 8));
  // The filter byte that prefixes every scanline is not part of a pixel, so
  // the ceiling is one byte per row larger than the sample data itself.
  const expectedInflated = (stride + 1) * height;
  const raw = unfilter(inflate(Buffer.concat(idat), expectedInflated), height, stride, bytesPerPixel);

  const pixels = Buffer.alloc(width * height * 4);
  const maxValue = (1 << bitDepth) - 1;
  const palette = plte;

  /** Reads sample `index` from a row, honouring sub-byte bit depths. */
  const sampleAt = (row: Buffer, index: number): number => {
    if (bitDepth === 8) return row[index];
    const perByte = 8 / bitDepth;
    const shift = 8 - bitDepth * ((index % perByte) + 1);
    return (row[Math.floor(index / perByte)] >> shift) & maxValue;
  };

  for (let y = 0; y < height; y++) {
    const row = raw.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (colorType === 3 && palette) {
        const index = sampleAt(row, x);
        pixels[o] = palette[index * 3];
        pixels[o + 1] = palette[index * 3 + 1];
        pixels[o + 2] = palette[index * 3 + 2];
        pixels[o + 3] = trns && index < trns.length ? trns[index] : 255;
      } else if (colorType === 0) {
        const sample = sampleAt(row, x);
        const gray = Math.round((sample * 255) / maxValue);
        pixels[o] = gray;
        pixels[o + 1] = gray;
        pixels[o + 2] = gray;
        pixels[o + 3] = trns && trns.readUInt16BE(0) === sample ? 0 : 255;
      } else if (colorType === 4) {
        const gray = row[x * 2];
        pixels[o] = gray;
        pixels[o + 1] = gray;
        pixels[o + 2] = gray;
        pixels[o + 3] = row[x * 2 + 1];
      } else if (colorType === 2) {
        pixels[o] = row[x * 3];
        pixels[o + 1] = row[x * 3 + 1];
        pixels[o + 2] = row[x * 3 + 2];
        pixels[o + 3] = 255;
      } else {
        pixels[o] = row[x * 4];
        pixels[o + 1] = row[x * 4 + 1];
        pixels[o + 2] = row[x * 4 + 2];
        pixels[o + 3] = row[x * 4 + 3];
      }
    }
  }

  return { width, height, pixels };
}
