/**
 * PNG generator for tests.
 *
 * Fixtures are built in code rather than committed as binary blobs, so a
 * reader can see what is being tested from the diff alone, and so the
 * expected decode result can be derived from the same numbers.
 */
import { deflateSync } from 'node:zlib';

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

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

/** Builds one PNG chunk: length, type, data, CRC. */
export function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

export interface MakePNGSpec {
  width: number;
  height: number;
  /** Sample bytes per scanline, already packed for bitDepth. */
  rows: number[][];
  bitDepth?: number;
  colorType?: number;
  plte?: number[];
  trns?: number[];
  /** Filter type applied to every row. The encoder computes the residuals. */
  filter?: number;
  /**
   * Dimensions to write into IHDR, when they must differ from the actual row
   * data — the only way to build a rejection fixture whose CRC is still valid.
   * Patching IHDR bytes after the fact breaks its CRC, so the decoder would
   * reject on the checksum before ever reaching the dimension check.
   */
  declaredWidth?: number;
  declaredHeight?: number;
}

export function makePNG(spec: MakePNGSpec): Buffer {
  const { width, height, rows, bitDepth = 8, colorType = 6, plte, trns, filter = 0 } = spec;
  const { declaredWidth, declaredHeight } = spec;
  const stride = rows[0].length;
  const channels = CHANNELS[colorType];
  const bytesPerPixel = Math.max(1, Math.ceil((channels * bitDepth) / 8));

  const raw: number[] = [];
  for (let y = 0; y < height; y++) {
    raw.push(filter);
    const cur = rows[y];
    const prev = y > 0 ? rows[y - 1] : new Array<number>(stride).fill(0);
    for (let i = 0; i < stride; i++) {
      const a = i >= bytesPerPixel ? cur[i - bytesPerPixel] : 0;
      const b = prev[i];
      const c = i >= bytesPerPixel ? prev[i - bytesPerPixel] : 0;
      let v = cur[i];
      if (filter === 1) v -= a;
      else if (filter === 2) v -= b;
      else if (filter === 3) v -= (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v -= pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      raw.push(v & 0xff);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(declaredWidth ?? width, 0);
  ihdr.writeUInt32BE(declaredHeight ?? height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;

  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr)];
  if (plte) parts.push(pngChunk('PLTE', Buffer.from(plte)));
  if (trns) parts.push(pngChunk('tRNS', Buffer.from(trns)));
  // An ancillary chunk every fixture carries, so the decoder's skip path is
  // exercised by every test rather than by one dedicated case.
  parts.push(pngChunk('tEXt', Buffer.from('Comment\0ignored', 'ascii')));
  parts.push(pngChunk('IDAT', deflateSync(Buffer.from(raw))), pngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}
