# Rasm chop etish, cash drawer va beeper — implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@madrimov/electron-pos-printer` v2.1.0 — PNG logotiplarni chop etish, cash drawer va beeper kontent turlari, hamda 1-bosqichdan kechiktirilgan ikkita qarz.

**Architecture:** Ikkita yangi modul. `src/images/png.ts` PNG konteynerini `node:zlib` yordamida RGBA piksellarga aylantiradi. `src/images/raster.ts` piksellarni printer baytlariga aylantiradi: oq fon ustiga alpha kompozitsiya → luminance grayscale → box-average kichraytirish → dithering → MSB-first bit qadoqlash. Ular alohida, chunki boshqacha yiqiladi — PNG bugi «oʻqilmadi», dithering bugi «xunuk chiqdi». `escpos-builder.ts` ikkisini chaqiradi va natijani band’larga boʻlib chiqaradi.

**Tech Stack:** TypeScript 5.7 (strict), vitest 2, tsup 8, `node:zlib` (Node ichida). Runtime dependency **yoʻq** va qoʻshilmaydi.

**Spec:** `docs/superpowers/specs/2026-08-19-image-cashdrawer-beeper-design.md`

## Global Constraints

- **Zero runtime dependency.** `package.json` ning `dependencies` boʻlimi boʻsh qoladi. Faqat `node:` bilan boshlanadigan oʻrnatilgan modullar ishlatiladi.
- **`/usr/bin/npm` va `/usr/bin/node` ishlatiladi, hech qachon yalangʻoch `npm` yoki `node` emas.** Bu mashinaning zsh profili ularni buzadi: yalangʻoch buyruq `compdef:153: _comps: assignment to invalid subscript range` chiqarib **hech narsa qilmasdan** tugaydi, yaʻni siz hech qanday test ishlatmasdan «oʻtdi» deb xabar berishingiz mumkin. Fokuslangan test uchun `/usr/bin/npx vitest run <path>`.
- **Versiya:** `2.1.0`.
- **TDD majburiy.** Har bir xatti-harakat uchun avval yiqiladigan test.
- **Darvoza:** har bir task oxirida `/usr/bin/npm run test:run`, `/usr/bin/npm run typecheck` va `/usr/bin/npm run build` — uchalasi ham toza. 1-bosqichdan kelgan **227 test** buzilmasligi kerak.
- `tsconfig.json` `**/*.test.ts` ni exclude qiladi — test fayllaridagi tip xatolari na `typecheck` da, na vitest’da koʻrinadi.
- **`__testutils__/*.ts` fayllari `.test.ts` emas, shuning uchun `typecheck` ularni tekshiradi.** Bu foydali — test yordamchilaridagi tip xatolari tutiladi — lekin ular test fayllari kabi erkin yozilmaydi: `noUnusedLocals` va strict rejim ularga ham tegishli. Ular `src/index.ts` dan yetib borilmaydi, shuning uchun `dist` ga chiqmaydi.
- `noUnusedLocals` va `noUnusedParameters` yoniq.
- **Barcha kod izohlari, JSDoc va xato xabarlari ingliz tilida.**
- **Bosiladigan kenglik:** 58mm → `384` nuqta, 80mm → `576` nuqta. Mavjud `getPageWidthPixels()` **ishlatilmaydi** — u qogʻozning toʻliq kengligini qaytaradi (464 va 640).
- **Kirish rasmi chegarasi:** 4096×4096.
- **Band balandligi:** 128 qator, ichki konstanta, sozlanmaydi.
- **Dithering default:** `threshold`, chegara 128.

## Tekshirilgan faktlar

Bu rejadagi barcha kod reja yozilishidan **oldin** ishlaydigan prototip sifatida yozilib, 33 ta tasdiq bilan sinovdan oʻtkazildi (dekoder boʻyicha 22 ta, rasterizatsiya boʻyicha yana 11 ta). Bu son prototip qamrovini bildiradi, quyidagi tasklardagi test sonini emas — Task 1 da 17, Task 2 da 17 test bor. Quyidagilar oʻlchangan, eslab qolingan emas:

| Tekshiruv | Natija |
|---|---|
| Shaffof qora piksel `(0,0,0,0)` rasterizatsiyadan keyin | **oq** (bit 0) — alpha tuzogʻi yoʻq |
| `8x1`, piksel 0 va 7 qora, qolgani oq | `0x81` — MSB-first tasdiqlandi |
| `9x1`, faqat oxirgi piksel qora | `[0x00, 0x80]` — toʻldiruvchi bitlar 0 |
| 800 px keng rasm, `maxWidth: 576` | 576 ga kichraytirildi |
| 8 px keng rasm, `maxWidth: 576` | 8 boʻlib qoldi — kattalashtirish yoʻq |
| 300 qatorli raster | 3 band: 128 + 128 + 44 |
| Rang tiplari 0/2/3/4/6, chuqurliklar 1/4/8 | hammasi dekodlandi |
| Filtr turlari 0/1/2/3/4 | hammasi dekodlandi |
| 16-bit, buzilgan imzo, buzilgan CRC | rad etildi |
| Buzilgan IDAT | `PNG chunk IDAT failed CRC check` |
| `declaredWidth: 5000` | `PNG is 5000x5000; the maximum is 4096x4096` |
| `Магазин` PC866 (1-bosqichdan) | `8C A0 A3 A0 A7 A8 AD` |

## Fayl strukturasi

### Yangi

| Fayl | Javobgarligi |
|---|---|
| `src/images/png.ts` | PNG → RGBA. Chunk parse, CRC, inflate, unfilter, bit chuqurligi kengaytirish, palette |
| `src/images/png.test.ts` | |
| `src/images/raster.ts` | RGBA → 1-bit raster. Alpha, grayscale, oʻlcham, dithering, qadoqlash, band’lar |
| `src/images/raster.test.ts` | |
| `src/images/index.ts` | Barrel |
| `src/images/__testutils__/make-png.ts` | Test uchun PNG generatori — fixture’lar git’da binar blob emas |
| `src/images/__testutils__/ascii-art.ts` | 1-bit rasterni koʻrish uchun |

### Oʻzgartiriladi

`src/types/index.ts`, `src/commands/escpos-builder.ts` (+test), `src/commands/esc-pos.ts` (+test), `src/utils/receipt-builder.ts` (+test), `src/commands/golden.test.ts` va fixture, `src/index.ts`, `README.md`, `CHANGELOG.md`, `CLAUDE.md`, `package.json`, `example/index.html`, `example/main.js`.

### Spec’dagi bir noaniqlikning yechimi

Spec §7.4 `PRINTABLE_WIDTH_58`/`PRINTABLE_WIDTH_80` ni ommaviy eksport deb, §11 esa ularni `src/types/index.ts` da deb koʻrsatadi, prototip esa ularni `raster.ts` da saqlagan edi.

**Yechim:** konstantalar `src/types/index.ts` ga boradi, `DEFAULTS.CHARS_PER_LINE_58` yonidagi konfiguratsiya qiymatlari qatoriga. `raster.ts` ularni **umuman bilmaydi** — u `maxWidth` ni parametr sifatida oladi va sof funksiya boʻlib qoladi. Qogʻoz kengligini bosiladigan kenglikka aylantirish builder’ning ishi.

---

### Task 1: PNG dekoder

**Files:**
- Create: `src/images/png.ts`
- Create: `src/images/__testutils__/make-png.ts`
- Test: `src/images/png.test.ts`

**Interfaces:**
- Consumes: `node:zlib` (`inflateSync`)
- Produces:
  - `interface DecodedImage { width: number; height: number; pixels: Buffer }` — `pixels` har doim `width * height * 4` bayt, RGBA tartibida
  - `function decodePNG(data: Buffer): DecodedImage`
  - `const MAX_IMAGE_DIMENSION = 4096`
  - Test yordamchisi: `makePNG(spec): Buffer` va `pngChunk(type: string, data: Buffer): Buffer`

**Nima uchun `decodePNG` har doim RGBA qaytaradi:** grayscale, palette va RGB kirishlar ham shu shaklga keltiriladi, shunda `raster.ts` da bitta kod yoʻli qoladi va rang tipi uchun alohida shox kerak boʻlmaydi.

- [ ] **Step 1: Test generatorini yozish**

`src/images/__testutils__/make-png.ts` — bu **test yordamchisi**, kutubxona kodi emas. U git’ga binar PNG fayllari qoʻyishning oʻrniga fixture’larni kod bilan yasaydi, shunda diff’da nima sinalayotgani oʻqiladi.

```ts
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
```

- [ ] **Step 2: Failing testni yozish**

`src/images/png.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decodePNG } from './png';
import { makePNG } from './__testutils__/make-png';

/** 4x2 RGBA where the left half is fully transparent black. */
const transparentRows = (): number[][] => {
  const rows: number[][] = [];
  for (let y = 0; y < 2; y++) {
    const row: number[] = [];
    for (let x = 0; x < 4; x++) row.push(0, 0, 0, x < 2 ? 0 : 255);
    rows.push(row);
  }
  return rows;
};

describe('decodePNG colour types', () => {
  it('decodes 8-bit RGBA and preserves alpha', () => {
    const image = decodePNG(makePNG({ width: 4, height: 2, colorType: 6, rows: transparentRows() }));
    expect(image.width).toBe(4);
    expect(image.height).toBe(2);
    expect(image.pixels).toHaveLength(4 * 2 * 4);
    expect(image.pixels[3]).toBe(0); // first pixel transparent
    expect(image.pixels[11]).toBe(255); // third pixel opaque
  });

  it('decodes 8-bit RGB as fully opaque', () => {
    const rows = [
      [0, 0, 0, 255, 255, 255, 0, 0, 0, 255, 255, 255],
      [255, 255, 255, 0, 0, 0, 255, 255, 255, 0, 0, 0],
    ];
    const image = decodePNG(makePNG({ width: 4, height: 2, colorType: 2, rows }));
    expect(image.pixels[3]).toBe(255);
    expect([...image.pixels.subarray(0, 4)]).toEqual([0, 0, 0, 255]);
  });

  it('decodes 8-bit grayscale into all three channels', () => {
    const image = decodePNG(makePNG({ width: 4, height: 2, colorType: 0, rows: [[0, 255, 0, 255], [255, 0, 255, 0]] }));
    expect([...image.pixels.subarray(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...image.pixels.subarray(4, 8)]).toEqual([255, 255, 255, 255]);
  });

  it('decodes 8-bit grayscale with alpha', () => {
    const rows = [
      [0, 255, 255, 0, 0, 255, 255, 0],
      [255, 0, 0, 255, 255, 0, 0, 255],
    ];
    const image = decodePNG(makePNG({ width: 4, height: 2, colorType: 4, rows }));
    expect(image.pixels[3]).toBe(255);
    expect(image.pixels[7]).toBe(0);
  });

  it('decodes 1-bit grayscale', () => {
    // 0b10101010 — pixel 0 white, pixel 1 black, alternating
    const image = decodePNG(makePNG({ width: 8, height: 1, bitDepth: 1, colorType: 0, rows: [[0b10101010]] }));
    expect(image.pixels[0]).toBe(255);
    expect(image.pixels[4]).toBe(0);
  });

  it('decodes 4-bit palette, the form image optimisers emit', () => {
    // Two pixels per byte: indices 0,1 then 1,0
    const image = decodePNG(
      makePNG({ width: 4, height: 1, bitDepth: 4, colorType: 3, rows: [[0x01, 0x10]], plte: [255, 0, 0, 0, 0, 255] })
    );
    expect([...image.pixels.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...image.pixels.subarray(4, 8)]).toEqual([0, 0, 255, 255]);
  });

  it('applies tRNS alpha to palette entries', () => {
    const image = decodePNG(
      makePNG({ width: 2, height: 1, colorType: 3, rows: [[0, 1]], plte: [0, 0, 0, 255, 255, 255], trns: [0, 255] })
    );
    expect(image.pixels[3]).toBe(0);
    expect(image.pixels[7]).toBe(255);
  });
});

describe('decodePNG filters', () => {
  const rows = [
    [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120],
    [15, 25, 35, 45, 55, 65, 75, 85, 95, 105, 115, 125],
    [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130],
  ];

  it.each([0, 1, 2, 3, 4])('reverses filter type %i', (filter) => {
    const image = decodePNG(makePNG({ width: 4, height: 3, colorType: 2, rows, filter }));
    expect(image.pixels[0]).toBe(10);
    expect(image.pixels[4]).toBe(40);
    expect(image.pixels[4 * 4]).toBe(15); // first pixel of row 1
  });
});

describe('decodePNG rejections', () => {
  it('rejects a non-PNG buffer', () => {
    expect(() => decodePNG(Buffer.from('not a png at all'))).toThrow(/signature/i);
  });

  it('rejects 16-bit depth with a fix suggestion', () => {
    expect(() =>
      decodePNG(makePNG({ width: 2, height: 1, bitDepth: 16, colorType: 0, rows: [[0, 0, 255, 255]] }))
    ).toThrow(/16-bit/);
  });

  it('rejects a corrupted chunk', () => {
    const png = makePNG({ width: 4, height: 2, colorType: 6, rows: transparentRows() });
    // Flip a byte inside the IDAT payload rather than near the end, so the
    // failing chunk is named in the message.
    const idatStart = png.indexOf(Buffer.from('IDAT', 'ascii'));
    png[idatStart + 6] ^= 0xff;
    expect(() => decodePNG(png)).toThrow(/chunk IDAT failed CRC/);
  });

  it('rejects an oversized image before decoding it', () => {
    // declaredWidth/Height keep the IHDR CRC valid, so the decoder reaches the
    // dimension check instead of failing on the checksum first.
    const png = makePNG({
      width: 1,
      height: 1,
      colorType: 6,
      rows: [[0, 0, 0, 255]],
      declaredWidth: 5000,
      declaredHeight: 5000,
    });
    expect(() => decodePNG(png)).toThrow(/4096/);
  });

  it('rejects a zero dimension', () => {
    const png = makePNG({
      width: 1,
      height: 1,
      colorType: 6,
      rows: [[0, 0, 0, 255]],
      declaredWidth: 0,
    });
    expect(() => decodePNG(png)).toThrow(/zero dimension/);
  });
});
```

- [ ] **Step 3: Testni ishga tushirib yiqilishini tasdiqlash**

```bash
/usr/bin/npx vitest run src/images/png.test.ts
```

Kutilgan: FAIL — `Failed to resolve import "./png"`.

- [ ] **Step 4: `src/images/png.ts` ni yozish**

Bu kod ishlaydigan prototipdan koʻchirilgan va 22 test bilan tasdiqlangan. Uni oʻzgartirmang.

```ts
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

/** Reverses the per-scanline filters, returning the raw sample bytes. */
function unfilter(inflated: Buffer, height: number, stride: number, bytesPerPixel: number): Buffer {
  const expected = (stride + 1) * height;
  if (inflated.length < expected) {
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
  const raw = unfilter(inflateSync(Buffer.concat(idat)), height, stride, bytesPerPixel);

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
```

- [ ] **Step 5: Testni ishga tushirib oʻtishini tasdiqlash**

```bash
/usr/bin/npx vitest run src/images/png.test.ts
```

Kutilgan: barcha testlar PASS.

- [ ] **Step 6: Butun toʻplam, typecheck va build**

```bash
/usr/bin/npm run test:run && /usr/bin/npm run typecheck && /usr/bin/npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/images/png.ts src/images/png.test.ts src/images/__testutils__/make-png.ts
git commit -m "feat(images): decode PNG with no dependency beyond node:zlib

Handles colour types 0, 2, 3, 4 and 6, bit depths 1/2/4/8 for greyscale and
palette, all five scanline filters, PLTE and tRNS. Everything decodes to
8-bit RGBA so the rasteriser has one shape to handle.

4-bit palette matters in particular: image optimisers emit logos in that form
routinely, and rejecting it would fail on files users actually have.

16-bit and interlaced inputs are rejected with a message that says what to do
instead. Input is capped at 4096x4096 because decoding is synchronous and runs
on Electron's main process.

Test fixtures are generated in code rather than committed as binary blobs, so
the diff shows what is being tested."
```

---

### Task 2: Rasterizatsiya quvuri

**Files:**
- Create: `src/images/raster.ts`
- Create: `src/images/__testutils__/ascii-art.ts`
- Create: `src/images/index.ts`
- Test: `src/images/raster.test.ts`

**Interfaces:**
- Consumes: `DecodedImage` (Task 1)
- Produces:
  - `interface RasterImage { width: number; height: number; data: Buffer }` — `data` har bir qator uchun `ceil(width/8)` bayt, MSB-first, qora = 1
  - `interface RasterizeOptions { maxWidth: number; width?: number; dither?: 'threshold' | 'floyd-steinberg'; threshold?: number }`
  - `function rasterize(image: DecodedImage, options: RasterizeOptions): RasterImage`
  - `function toBands(raster: RasterImage): RasterImage[]`
  - `const BAND_HEIGHT = 128`
  - Test yordamchisi: `toAscii(raster: RasterImage): string`

**`raster.ts` bosiladigan kenglik konstantalarini bilmaydi.** U `maxWidth` ni parametr sifatida oladi va sof funksiya boʻlib qoladi; qogʻoz kengligini bosiladigan kenglikka aylantirish Task 4 dagi builder’ning ishi.

- [ ] **Step 1: ASCII yordamchisini yozish**

`src/images/__testutils__/ascii-art.ts`:

```ts
import type { RasterImage } from '../raster';

/**
 * Renders a 1-bit raster as text, so a dithering result can be judged by eye.
 *
 * dumpESCPOS shows that a raster command was emitted and how large it is, but
 * not what it looks like — and with no thermal printer available, looking at
 * the image is the only way to catch a rasteriser that is wrong in a way the
 * byte assertions do not describe.
 */
export function toAscii(raster: RasterImage): string {
  const rowBytes = Math.ceil(raster.width / 8);
  const lines: string[] = [];
  for (let y = 0; y < raster.height; y++) {
    let line = '';
    for (let x = 0; x < raster.width; x++) {
      line += raster.data[y * rowBytes + (x >> 3)] & (0x80 >> (x & 7)) ? '#' : '.';
    }
    lines.push(line);
  }
  return lines.join('\n');
}
```

- [ ] **Step 2: Failing testni yozish**

`src/images/raster.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rasterize, toBands, BAND_HEIGHT } from './raster';
import { decodePNG } from './png';
import { makePNG } from './__testutils__/make-png';
import { toAscii } from './__testutils__/ascii-art';

/** Decodes a greyscale PNG built from the given sample rows. */
const grayImage = (width: number, height: number, rows: number[][]) =>
  decodePNG(makePNG({ width, height, colorType: 0, rows }));

describe('alpha handling', () => {
  it('composites transparent pixels over white, not black', () => {
    // 4x2 RGBA. The left two pixels are fully transparent BLACK — the exact
    // shape of a logo with a cut-out background. Dropping alpha would make
    // them black and print the whole logo as a filled rectangle.
    const rows: number[][] = [];
    for (let y = 0; y < 2; y++) {
      const row: number[] = [];
      for (let x = 0; x < 4; x++) row.push(0, 0, 0, x < 2 ? 0 : 255);
      rows.push(row);
    }
    const raster = rasterize(decodePNG(makePNG({ width: 4, height: 2, colorType: 6, rows })), {
      maxWidth: 100,
    });
    // bits, MSB first: white white black black -> 0b00110000
    expect(raster.data[0]).toBe(0x30);
  });

  it('treats a half-transparent black pixel as mid grey', () => {
    const rows = [[0, 0, 0, 128, 0, 0, 0, 255]];
    const raster = rasterize(decodePNG(makePNG({ width: 2, height: 1, colorType: 6, rows })), {
      maxWidth: 100,
      threshold: 100,
    });
    // 0*0.5 + 255*0.5 = 127.5, above the threshold of 100 -> white
    expect(raster.data[0]).toBe(0x40);
  });
});

describe('greyscale conversion', () => {
  it('uses luminance weights rather than a channel average', () => {
    // Green and blue have the same channel average (85) but very different
    // luminance: green 150, blue 29. An average would make both black.
    const raster = rasterize(decodePNG(makePNG({ width: 2, height: 1, colorType: 2, rows: [[0, 255, 0, 0, 0, 255]] })), {
      maxWidth: 100,
    });
    expect(raster.data[0]).toBe(0x40); // green white, blue black
  });
});

describe('bit packing', () => {
  it('packs MSB first, with bit 7 as the leftmost pixel', () => {
    const row = [];
    for (let x = 0; x < 8; x++) row.push(x === 0 || x === 7 ? 0 : 255);
    const raster = rasterize(grayImage(8, 1, [row]), { maxWidth: 100 });
    expect(raster.data).toHaveLength(1);
    expect(raster.data[0]).toBe(0x81);
  });

  it('pads the last byte of a row with zero bits', () => {
    const row = [];
    for (let x = 0; x < 9; x++) row.push(x === 8 ? 0 : 255);
    const raster = rasterize(grayImage(9, 1, [row]), { maxWidth: 100 });
    expect([...raster.data]).toEqual([0x00, 0x80]);
  });

  it('sizes the buffer as ceil(width/8) per row', () => {
    const rows = [new Array(20).fill(0), new Array(20).fill(255), new Array(20).fill(0)];
    const raster = rasterize(grayImage(20, 3, rows), { maxWidth: 100 });
    expect(raster.data).toHaveLength(3 * 3);
  });
});

describe('resizing', () => {
  it('downscales an image wider than maxWidth', () => {
    const rows: number[][] = [];
    for (let y = 0; y < 4; y++) {
      const row: number[] = [];
      for (let x = 0; x < 800; x++) row.push(x < 400 ? 0 : 255);
      rows.push(row);
    }
    const raster = rasterize(grayImage(800, 4, rows), { maxWidth: 576 });
    expect(raster.width).toBe(576);
  });

  it('never upscales a small image', () => {
    const rows = [[0, 0, 0, 0, 255, 255, 255, 255], [0, 0, 0, 0, 255, 255, 255, 255]];
    const raster = rasterize(grayImage(8, 2, rows), { maxWidth: 576 });
    expect(raster.width).toBe(8);
  });

  it('clamps an explicit width to maxWidth', () => {
    const rows: number[][] = [];
    for (let y = 0; y < 2; y++) rows.push(new Array(800).fill(0));
    const raster = rasterize(grayImage(800, 2, rows), { maxWidth: 384, width: 600 });
    expect(raster.width).toBe(384);
  });

  it('scales height in proportion', () => {
    const rows: number[][] = [];
    for (let y = 0; y < 40; y++) rows.push(new Array(80).fill(0));
    const raster = rasterize(grayImage(80, 40, rows), { maxWidth: 40 });
    expect(raster.width).toBe(40);
    expect(raster.height).toBe(20);
  });
});

describe('dithering', () => {
  it('threshold produces a hard edge and loses a gradient', () => {
    const row = [];
    for (let x = 0; x < 16; x++) row.push(Math.round((x / 15) * 255));
    const raster = rasterize(grayImage(16, 1, [row]), { maxWidth: 100, dither: 'threshold' });
    // Every pixel below the threshold is black, every one above is white —
    // one transition, no interior structure.
    expect(toAscii(raster)).toBe('########........');
  });

  it('honours a custom threshold', () => {
    const row = [100, 100, 200, 200];
    expect(toAscii(rasterize(grayImage(4, 1, [row]), { maxWidth: 100, threshold: 150 }))).toBe('##..');
    expect(toAscii(rasterize(grayImage(4, 1, [row]), { maxWidth: 100, threshold: 50 }))).toBe('....');
  });

  it('floyd-steinberg keeps interior structure a threshold would flatten', () => {
    const row = [];
    for (let x = 0; x < 16; x++) row.push(Math.round((x / 15) * 255));
    const dithered = toAscii(rasterize(grayImage(16, 1, [row]), { maxWidth: 100, dither: 'floyd-steinberg' }));
    const plain = toAscii(rasterize(grayImage(16, 1, [row]), { maxWidth: 100, dither: 'threshold' }));
    expect(dithered).not.toBe(plain);
    // The dithered row alternates rather than switching once.
    const transitions = [...dithered].filter((c, i, a) => i > 0 && c !== a[i - 1]).length;
    expect(transitions).toBeGreaterThan(1);
  });

  it('leaves pure black and pure white untouched in either mode', () => {
    const row = [0, 0, 255, 255];
    for (const dither of ['threshold', 'floyd-steinberg'] as const) {
      expect(toAscii(rasterize(grayImage(4, 1, [row]), { maxWidth: 100, dither }))).toBe('##..');
    }
  });
});

describe('banding', () => {
  it('splits a tall raster into bands of at most BAND_HEIGHT rows', () => {
    const rows: number[][] = [];
    for (let y = 0; y < 300; y++) rows.push(new Array(8).fill(0));
    const bands = toBands(rasterize(grayImage(8, 300, rows), { maxWidth: 576 }));
    expect(bands.map((b) => b.height)).toEqual([BAND_HEIGHT, BAND_HEIGHT, 44]);
  });

  it('gives each band a data buffer matching its own height', () => {
    const rows: number[][] = [];
    for (let y = 0; y < 300; y++) rows.push(new Array(8).fill(0));
    const bands = toBands(rasterize(grayImage(8, 300, rows), { maxWidth: 576 }));
    for (const band of bands) {
      expect(band.data).toHaveLength(Math.ceil(band.width / 8) * band.height);
    }
  });

  it('returns a single band for a short raster', () => {
    const rows = [new Array(8).fill(0)];
    expect(toBands(rasterize(grayImage(8, 1, rows), { maxWidth: 576 }))).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Testni ishga tushirib yiqilishini tasdiqlash**

```bash
/usr/bin/npx vitest run src/images/raster.test.ts
```

Kutilgan: FAIL — `Failed to resolve import "./raster"`.

- [ ] **Step 4: `src/images/raster.ts` ni yozish**

Ishlaydigan prototipdan koʻchirilgan.

```ts
/**
 * Turns decoded pixels into the 1-bit raster an ESC/POS printer expects.
 *
 * The order matters and is not stylistic:
 *
 *   alpha over white -> luminance -> resize -> dither -> pack
 *
 * Resizing must precede dithering. Dithering first and resizing after would
 * average away the dot pattern that carries the tone, leaving mud — the same
 * shape of mistake as computing column widths before transliteration.
 */
import type { DecodedImage } from './png';

/** Rows are packed MSB first — bit 7 is the leftmost pixel. Black is 1. */
export interface RasterImage {
  width: number;
  height: number;
  /** `ceil(width / 8) * height` bytes. */
  data: Buffer;
}

export interface RasterizeOptions {
  /** Hard ceiling on output width, in printer dots. */
  maxWidth: number;
  /** Requested width. Clamped to maxWidth and to the source width. */
  width?: number;
  /** Defaults to 'threshold'. */
  dither?: 'threshold' | 'floyd-steinberg';
  /** Cutoff for 'threshold', 0-255. Defaults to 128. */
  threshold?: number;
}

/**
 * Rows per `GS v 0` command.
 *
 * Cheap printers have small buffers and drop a tall raster silently — the logo
 * simply never appears, with nothing to diagnose. Not configurable: a caller
 * has no information with which to choose a better value, and a wrong one
 * would only hide the problem.
 */
export const BAND_HEIGHT = 128;

interface Grayscale {
  gray: Float64Array;
  width: number;
  height: number;
}

/** Composites over white and converts to luminance in one pass. */
function toGrayscale({ width, height, pixels }: DecodedImage): Float64Array {
  const gray = new Float64Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const alpha = pixels[p + 3] / 255;
    const r = pixels[p] * alpha + 255 * (1 - alpha);
    const g = pixels[p + 1] * alpha + 255 * (1 - alpha);
    const b = pixels[p + 2] * alpha + 255 * (1 - alpha);
    // Luminance weights, not a channel average: an average renders pure green
    // as dark as pure blue, and a green logo would vanish.
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

/** Box-average downscale. Returns the input untouched when no shrink is needed. */
function resize(gray: Float64Array, width: number, height: number, target: number): Grayscale {
  if (target >= width) return { gray, width, height };
  const outHeight = Math.max(1, Math.round(height / (width / target)));
  const out = new Float64Array(target * outHeight);
  for (let y = 0; y < outHeight; y++) {
    const y0 = Math.floor((y * height) / outHeight);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / outHeight));
    for (let x = 0; x < target; x++) {
      const x0 = Math.floor((x * width) / target);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / target));
      let sum = 0;
      let count = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          sum += gray[yy * width + xx];
          count++;
        }
      }
      out[y * target + x] = sum / count;
    }
  }
  return { gray: out, width: target, height: outHeight };
}

function ditherToBits(
  gray: Float64Array,
  width: number,
  height: number,
  mode: 'threshold' | 'floyd-steinberg',
  threshold: number
): Uint8Array {
  const bits = new Uint8Array(width * height);
  if (mode !== 'floyd-steinberg') {
    for (let i = 0; i < bits.length; i++) bits[i] = gray[i] < threshold ? 1 : 0;
    return bits;
  }
  const buffer = Float64Array.from(gray);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = buffer[i];
      const next = old < threshold ? 0 : 255;
      bits[i] = next === 0 ? 1 : 0;
      const error = old - next;
      const spread = (dx: number, dy: number, factor: number): void => {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < width && yy < height) buffer[yy * width + xx] += error * factor;
      };
      spread(1, 0, 7 / 16);
      spread(-1, 1, 3 / 16);
      spread(0, 1, 5 / 16);
      spread(1, 1, 1 / 16);
    }
  }
  return bits;
}

function pack(bits: Uint8Array, width: number, height: number): RasterImage {
  const rowBytes = Math.ceil(width / 8);
  const data = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (bits[y * width + x]) data[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { width, height, data };
}

/** Converts decoded pixels into a 1-bit raster no wider than `maxWidth`. */
export function rasterize(image: DecodedImage, options: RasterizeOptions): RasterImage {
  const { maxWidth, dither = 'threshold', threshold = 128 } = options;
  // Never upscales: stretching a small logo to the paper width only makes it
  // blocky. The source width is part of the minimum for exactly that reason.
  const target = Math.min(options.width ?? image.width, maxWidth, image.width);
  const { gray, width, height } = resize(toGrayscale(image), image.width, image.height, target);
  return pack(ditherToBits(gray, width, height, dither, threshold), width, height);
}

/** Splits a raster into bands of at most BAND_HEIGHT rows. */
export function toBands(raster: RasterImage): RasterImage[] {
  const rowBytes = Math.ceil(raster.width / 8);
  const bands: RasterImage[] = [];
  for (let y = 0; y < raster.height; y += BAND_HEIGHT) {
    const height = Math.min(BAND_HEIGHT, raster.height - y);
    bands.push({
      width: raster.width,
      height,
      data: raster.data.subarray(y * rowBytes, (y + height) * rowBytes),
    });
  }
  return bands;
}
```

- [ ] **Step 5: Barrel faylni yozish**

`src/images/index.ts`:

```ts
export * from './png';
export * from './raster';
```

- [ ] **Step 6: Testni ishga tushirib oʻtishini tasdiqlash**

```bash
/usr/bin/npx vitest run src/images/raster.test.ts
```

Agar `scales height in proportion` yiqilsa: `resize` balandlikni `Math.round(height / (width / target))` bilan hisoblaydi, yaʻni 40 qator 80→40 kichraytirishda 20 boʻladi. Kutilgan qiymatni emas, hisobni tekshiring.

- [ ] **Step 7: Butun toʻplam, typecheck va build**

```bash
/usr/bin/npm run test:run && /usr/bin/npm run typecheck && /usr/bin/npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/images/raster.ts src/images/raster.test.ts src/images/__testutils__/ascii-art.ts src/images/index.ts
git commit -m "feat(images): rasterise decoded pixels to a 1-bit ESC/POS image

Pipeline order is load-bearing: alpha over white, luminance, resize, dither,
pack. Resizing must precede dithering, or the shrink averages away the dot
pattern that carries the tone.

Alpha is composited over white rather than discarded, because a logo with a
cut-out background is the common case and dropping alpha would print it as a
filled black rectangle. Greyscale uses luminance weights rather than a channel
average, which would render pure green as dark as pure blue.

Never upscales — stretching a small logo to the paper width only makes it
blocky. Splits tall rasters into 128-row bands, since cheap printers drop a
tall single raster silently.

Adds a toAscii test helper: with no thermal printer available, looking at the
image is the only way to catch a rasteriser that is wrong in a way the byte
assertions do not describe."
```

---

### Task 3: Tiplar

**Files:**
- Modify: `src/types/index.ts`

**Interfaces:**
- Produces: `CashDrawerContent`, `BeepContent`, kengaytirilgan `ImageOptions`, `PRINTABLE_WIDTH_58`, `PRINTABLE_WIDTH_80`, kengaytirilgan `PrintContentType` va `PrintContent`

Bu task sof tip qoʻshimchasi — yangi ishlash xatti-harakati yoʻq, shuning uchun oʻz testi boʻlmaydi. Toʻgʻriligini `npm run typecheck` va Task 4 ning testlari tasdiqlaydi.

- [ ] **Step 1: Bosiladigan kenglik konstantalarini qoʻshish**

`DEFAULTS` eʻlonidan **oldin**:

```ts
/**
 * Printable width in printer dots, by paper size.
 *
 * This is not the paper's full width: a 58mm roll is 464 dots edge to edge but
 * only 384 are printable, and 80mm is 640 against 576. `getPageWidthPixels()`
 * returns the former and must not be used to size an image, or every logo
 * overruns the printable area.
 *
 * Cross-checked three ways: charsPerLine x 12, the 48mm/72mm widths the HTML
 * renderer uses, and the standard for 203 DPI thermal printers.
 */
export const PRINTABLE_WIDTH_58 = 384;
export const PRINTABLE_WIDTH_80 = 576;
```

- [ ] **Step 2: `ImageOptions` ni kengaytirish**

```ts
export interface ImageOptions {
  /**
   * Target width in printer dots. Clamped to the printable width and to the
   * source width — a small logo is never stretched, only shrunk if oversized.
   */
  width?: number;
  /** Alignment. */
  align?: TextAlign;
  /**
   * How to reduce to one bit per pixel. Defaults to `'threshold'`, which keeps
   * an already-black-and-white logo crisp; `'floyd-steinberg'` preserves the
   * tone of a photograph or a gradient at the cost of a dot pattern that
   * thermal dot bloom can smear.
   */
  dither?: 'threshold' | 'floyd-steinberg';
  /** Cutoff for `dither: 'threshold'`, 0-255. Defaults to 128. */
  threshold?: number;
}
```

- [ ] **Step 3: `ImageContent.source` ning JSDoc'ini tuzatish**

```ts
export interface ImageContent extends PrintContentBase {
  type: 'image';
  /**
   * PNG image as base64, or as a `data:image/png;base64,...` URL.
   *
   * File paths are not accepted. Content can arrive from a renderer over IPC,
   * and reading an arbitrary path on its behalf would hand it a capability it
   * should not have; the builder stays a pure function that never touches the
   * filesystem. A main-process caller reads its own file in one line:
   * `readFileSync(path).toString('base64')`.
   */
  source: string;
  options?: ImageOptions;
}
```

- [ ] **Step 4: Ikkita yangi kontent turini qoʻshish**

`PrintContentType` ga `'cashdraw'` va `'beep'` qoʻshing, va `CutContent` dan keyin:

```ts
/**
 * Cash drawer pulse.
 *
 * A content item rather than a method, so the caller controls where in the
 * sequence it fires — before the cut or after it is a real choice.
 */
export interface CashDrawerContent extends PrintContentBase {
  type: 'cashdraw';
  /** Connector pin. Defaults to 2, the common wiring. */
  pin?: 2 | 5;
}

/**
 * Beeper.
 *
 * Not universally supported: many printers ignore `ESC B` entirely. Nothing in
 * this package can detect that, so a silent beeper is a hardware answer rather
 * than a bug.
 */
export interface BeepContent extends PrintContentBase {
  type: 'beep';
  /** Number of beeps, 1-9. Defaults to 1. */
  times?: number;
  /** Duration of each beep, 1-9. Defaults to 3. */
  duration?: number;
}
```

`PrintContent` union'iga ikkisini ham qoʻshing.

- [ ] **Step 5: Darvoza**

```bash
/usr/bin/npm run typecheck && /usr/bin/npm run test:run
```

Kutilgan: typecheck toza. **Testlar yiqilishi mumkin emas** — barcha yangi maydonlar opsional va yangi variantlar hech qayerda ishlatilmayapti. Agar yiqilsa, toʻxtang va xabar bering.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add cash drawer and beeper content, extend ImageOptions

Adds PRINTABLE_WIDTH_58 and PRINTABLE_WIDTH_80. These are deliberately not
getPageWidthPixels(), which returns the paper's full width (464 and 640)
rather than the printable area, and would overrun it for every image.

Corrects ImageContent.source, which claimed to accept a file path. It does
not: content can arrive from a renderer over IPC, and reading an arbitrary
path on its behalf would hand it a capability it should not have."
```

---

### Task 4: Builder — rasm, cash drawer, beeper, exhaustiveness

**Files:**
- Modify: `src/commands/escpos-builder.ts`
- Modify: `src/commands/escpos-builder.test.ts`

**Interfaces:**
- Consumes: `decodePNG`, `rasterize`, `toBands` (Tasks 1–2); `PRINTABLE_WIDTH_58/80`, `CashDrawerContent`, `BeepContent` (Task 3); `Commands.IMAGE.RASTER`, `Commands.CASH_DRAWER`, `Commands.BEEP`, `Commands.LINE_SPACING` (1-bosqichdan)
- Produces: `image`, `cashdraw`, `beep` kontenti uchun baytlar; `BuildContext` ga `printableWidth`

- [ ] **Step 1: Failing testlarni yozish**

`src/commands/escpos-builder.test.ts` ning importlariga qoʻshing:

```ts
import { makePNG } from '../images/__testutils__/make-png';
```

Mavjud `describe('image content')` blokini **almashtiring** — u 1-bosqichda rasm hech narsa chiqarmasligini muhrlagan edi va endi u xatti-harakat oʻzgaryapti:

```ts
/** A 4x2 PNG whose left half is transparent and right half is solid black. */
function logoPNG(): string {
  const rows: number[][] = [];
  for (let y = 0; y < 2; y++) {
    const row: number[] = [];
    for (let x = 0; x < 4; x++) row.push(0, 0, 0, x < 2 ? 0 : 255);
    rows.push(row);
  }
  return makePNG({ width: 4, height: 2, colorType: 6, rows }).toString('base64');
}

describe('image content', () => {
  it('emits a raster command', () => {
    const data = buildESCPOSData([{ type: 'image', source: logoPNG() }]);
    // GS v 0 0
    expect(seqAt(data, 0x1d, 0x76, 0x30, 0x00)).toBeGreaterThan(0);
  });

  it('wraps the raster in zero line spacing and restores the default', () => {
    const data = buildESCPOSData([{ type: 'image', source: logoPNG() }]);
    expectOrder(data, [
      [0x1b, 0x33, 0x00], // ESC 3 0
      [0x1d, 0x76, 0x30, 0x00], // GS v 0 0
      [0x1b, 0x32], // ESC 2
    ]);
  });

  it('composites transparency over white rather than printing a black block', () => {
    const data = buildESCPOSData([{ type: 'image', source: logoPNG() }]);
    const at = data.indexOf(Buffer.from([0x1d, 0x76, 0x30, 0x00]));
    // header is 8 bytes: GS v 0 m xL xH yL yH, then one byte per row
    expect(data[at + 8]).toBe(0x30);
  });

  it('accepts a data URL as well as bare base64', () => {
    const bare = buildESCPOSData([{ type: 'image', source: logoPNG() }]);
    const url = buildESCPOSData([
      { type: 'image', source: `data:image/png;base64,${logoPNG()}` },
    ]);
    expect([...url]).toEqual([...bare]);
  });

  it('honours the alignment option', () => {
    const data = buildESCPOSData([
      { type: 'image', source: logoPNG(), options: { align: 'center' } },
    ]);
    expectOrder(data, [[0x1b, 0x61, 0x01], [0x1d, 0x76, 0x30, 0x00]]);
  });

  it('rejects a file path with a message naming the real requirement', () => {
    expect(() => buildESCPOSData([{ type: 'image', source: '/home/user/logo.png' }])).toThrow(
      /base64/
    );
    expect(() => buildESCPOSData([{ type: 'image', source: './logo.png' }])).toThrow(/base64/);
    expect(() => buildESCPOSData([{ type: 'image', source: 'C:\\logos\\shop.png' }])).toThrow(
      /base64/
    );
  });

  it('does not add a line feed of its own after the raster', () => {
    // GS v 0 already advances to the next line; anything more is the caller's
    // to add with feed content, consistent with every other content type.
    const data = buildESCPOSData([{ type: 'image', source: logoPNG() }]);
    const restore = data.indexOf(Buffer.from([0x1b, 0x32])); // ESC 2
    // What follows the spacing restore is the alignment reset and nothing else.
    expect([...data.subarray(restore + 2)]).toEqual([0x1b, 0x61, 0x00]);
  });

  it('surfaces a decode failure rather than skipping the image', () => {
    expect(() =>
      buildESCPOSData([{ type: 'image', source: Buffer.from('nonsense').toString('base64') }])
    ).toThrow(/signature/i);
  });
});

describe('cash drawer content', () => {
  it('pulses pin 2 by default', () => {
    const data = buildESCPOSData([{ type: 'cashdraw' }]);
    expect(seqAt(data, 0x1b, 0x70, 0x00, 0x19, 0xfa)).toBeGreaterThan(0);
  });

  it('pulses pin 5 when asked', () => {
    const data = buildESCPOSData([{ type: 'cashdraw', pin: 5 }]);
    expect(seqAt(data, 0x1b, 0x70, 0x01, 0x19, 0xfa)).toBeGreaterThan(0);
  });
});

describe('beep content', () => {
  it('beeps once by default', () => {
    const data = buildESCPOSData([{ type: 'beep' }]);
    expect(seqAt(data, 0x1b, 0x42, 0x01, 0x03)).toBeGreaterThan(0);
  });

  it('honours times and duration', () => {
    const data = buildESCPOSData([{ type: 'beep', times: 3, duration: 5 }]);
    expect(seqAt(data, 0x1b, 0x42, 0x03, 0x05)).toBeGreaterThan(0);
  });

  it('clamps out-of-range values', () => {
    const data = buildESCPOSData([{ type: 'beep', times: 99, duration: 0 }]);
    expect(seqAt(data, 0x1b, 0x42, 0x09, 0x01)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini tasdiqlash**

```bash
/usr/bin/npx vitest run src/commands/escpos-builder.test.ts
```

Kutilgan: `image content` bloki toʻliq yiqiladi (hozir hech narsa chiqarilmaydi), `cash drawer` va `beep` bloklari ham (variantlar `default` shoxiga tushadi).

- [ ] **Step 3: `escpos-builder.ts` ni oʻzgartirish**

Importlarga qoʻshing:

```ts
import { decodePNG } from '../images/png';
import { rasterize, toBands } from '../images/raster';
import { PRINTABLE_WIDTH_58, PRINTABLE_WIDTH_80 } from '../types';
import type { ImageOptions } from '../types';
```

`BuildContext` ga maydon qoʻshing va uni `buildESCPOSData` da toʻldiring:

```ts
interface BuildContext {
  charsPerLine: number;
  table: Codepage;
  /** Printable width in dots, for image content. */
  printableWidth: number;
}
```

```ts
  const printableWidth = paperWidth === 58 ? PRINTABLE_WIDTH_58 : PRINTABLE_WIDTH_80;
  const context: BuildContext = { charsPerLine, table, printableWidth };
```

Yordamchilarni qoʻshing:

```ts
/**
 * Paths a caller is likely to pass by mistake, now that only base64 is accepted.
 *
 * Safe against false positives despite `/` being a base64 character: every PNG
 * begins with the same 8-byte signature, so its base64 always starts `iVBOR`.
 */
const LOOKS_LIKE_PATH = /^(\.{0,2}\/|[A-Za-z]:[\\/]|\\\\)/;
const PNG_DATA_URL = /^data:image\/png;base64,/i;

/** Turns an image source into PNG bytes. Base64 or a data URL only. */
function decodeImageSource(source: string): Buffer {
  if (LOOKS_LIKE_PATH.test(source)) {
    throw new Error(
      'Image source must be base64 or a data:image/png;base64 URL — file paths are not accepted. ' +
        'Read the file yourself: readFileSync(path).toString("base64")'
    );
  }
  const base64 = PNG_DATA_URL.test(source) ? source.slice(source.indexOf(',') + 1) : source;
  return Buffer.from(base64, 'base64');
}

function buildImage(
  source: string,
  options: ImageOptions | undefined,
  context: BuildContext
): Buffer[] {
  const raster = rasterize(decodePNG(decodeImageSource(source)), {
    maxWidth: context.printableWidth,
    width: options?.width,
    dither: options?.dither,
    threshold: options?.threshold,
  });

  const buffers: Buffer[] = [alignmentCommand(options?.align)];
  // GS v 0 advances to the next line after printing, so consecutive bands
  // would be separated by a line-spacing gap and the image would come out
  // striped. Zero spacing makes the bands butt together.
  buffers.push(Commands.LINE_SPACING.SET(0));
  for (const band of toBands(raster)) {
    buffers.push(Commands.IMAGE.RASTER(band.width, band.height, band.data));
  }
  buffers.push(Commands.LINE_SPACING.DEFAULT, Commands.ALIGN.LEFT);
  return buffers;
}

/**
 * Compile-time guard: adding a PrintContent variant without a case for it
 * becomes a type error here rather than a receipt that silently omits it.
 */
function assertNever(value: never): never {
  throw new Error(`Unhandled print content: ${JSON.stringify(value)}`);
}
```

`buildContent` ning `image` shoxini almashtiring va ikkita yangisini qoʻshing:

```ts
    case 'image':
      return buildImage(content.source, content.options, context);
    case 'cashdraw':
      return [
        content.pin === 5 ? Commands.CASH_DRAWER.OPEN_PIN5 : Commands.CASH_DRAWER.OPEN_PIN2,
      ];
    case 'beep':
      return [Commands.BEEP(content.times ?? 1, content.duration ?? 3)];
    default:
      return assertNever(content);
```

- [ ] **Step 4: Testni ishga tushirib oʻtishini tasdiqlash**

```bash
/usr/bin/npx vitest run src/commands/escpos-builder.test.ts
```

- [ ] **Step 5: Butun toʻplam, typecheck va build**

```bash
/usr/bin/npm run test:run && /usr/bin/npm run typecheck && /usr/bin/npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/commands/escpos-builder.ts src/commands/escpos-builder.test.ts
git commit -m "feat(escpos): print PNG images, pulse the cash drawer, sound the beeper

Image content produced no bytes at all before this — the previous milestone
skipped it deliberately, because at that point every image failed and throwing
would have broken any receipt built from data with a logo. Now only a malformed
image fails, so it throws, consistent with barcode validation.

Rasters are emitted as 128-row bands wrapped in zero line spacing. GS v 0
advances to the next line after printing, so without that the bands would be
separated by gaps and the image would come out striped.

The default branch of buildContent is now an exhaustiveness guard. It was
flagged in the previous milestone's final review as harmless until a new
PrintContent variant existed; these two variants are that event."
```

---

### Task 5: QR yuk hajmi validatsiyasi

1-bosqichning yakuniy koʻriki bu topilmani shu bosqichga kechiktirgan edi. `Commands.QRCODE.STORE` faqat 65532 baytdan oshganini rad etadi, haqiqiy sigʻim esa ancha kichik va xato tuzatish darajasiga bogʻliq.

**Files:**
- Modify: `src/commands/escpos-builder.ts`
- Modify: `src/commands/escpos-builder.test.ts`

**Interfaces:**
- Produces: `function validateQRCodeValue(value: string, errorCorrection: QRErrorCorrection): void`

Validatsiya builder’da yashaydi, `esc-pos.ts` da emas: sigʻim xato tuzatish darajasiga bogʻliq va bu darajani faqat builder biladi — `STORE` ga u uzatilmaydi.

- [ ] **Step 1: Failing testni yozish**

```ts
describe('QR code validation', () => {
  const qr = (value: string, errorCorrection: 'L' | 'M' | 'Q' | 'H' = 'M'): PrintContent[] => [
    { type: 'qrcode', value, options: { errorCorrection } },
  ];

  it('accepts a payload within the level capacity', () => {
    expect(() => buildESCPOSData(qr('x'.repeat(2331), 'M'))).not.toThrow();
  });

  it('rejects a payload one byte over the level capacity', () => {
    expect(() => buildESCPOSData(qr('x'.repeat(2332), 'M'))).toThrow(/2331/);
  });

  it('applies a different capacity per error-correction level', () => {
    expect(() => buildESCPOSData(qr('x'.repeat(2900), 'L'))).not.toThrow();
    expect(() => buildESCPOSData(qr('x'.repeat(2900), 'H'))).toThrow(/1273/);
  });

  it('counts UTF-8 bytes rather than characters', () => {
    // Each Cyrillic character is two bytes, so 700 characters is 1400 bytes —
    // over H's 1273 even though the character count is far below it.
    expect(() => buildESCPOSData(qr('П'.repeat(700), 'H'))).toThrow(/1273/);
  });

  it('rejects an empty value', () => {
    expect(() => buildESCPOSData(qr(''))).toThrow(/empty/);
  });
});
```

- [ ] **Step 2: Yiqilishini tasdiqlash**

```bash
/usr/bin/npx vitest run src/commands/escpos-builder.test.ts -t 'QR code validation'
```

- [ ] **Step 3: Implementatsiya**

`validateBarcodeValue` yoniga:

```ts
/**
 * Byte-mode capacity of a version-40 QR symbol, by error-correction level.
 *
 * Commands.QRCODE.STORE only rejects payloads above its 65532-byte length
 * field, which is far beyond what any symbol can hold. The real limit depends
 * on the error-correction level, and only the builder knows which level was
 * requested.
 */
const QR_CAPACITY: Record<QRErrorCorrection, number> = { L: 2953, M: 2331, Q: 1663, H: 1273 };

/** Throws when a value cannot fit a QR symbol at the given correction level. */
export function validateQRCodeValue(value: string, errorCorrection: QRErrorCorrection): void {
  if (value.length === 0) {
    throw new Error('QR code value is empty');
  }
  const bytes = Buffer.byteLength(value, 'utf8');
  const capacity = QR_CAPACITY[errorCorrection];
  if (bytes > capacity) {
    throw new Error(
      `QR code value is ${bytes} bytes; error correction level ${errorCorrection} holds at most ${capacity}`
    );
  }
}
```

`buildQRCode` ning birinchi satriga:

```ts
function buildQRCode(value: string, options?: QRCodeOptions): Buffer[] {
  const errorCorrection = options?.errorCorrection ?? DEFAULTS.QR_ERROR_CORRECTION;
  validateQRCodeValue(value, errorCorrection);
  // ... qolgani oʻzgarmaydi, faqat ERROR_CORRECTION[...] endi errorCorrection oʻzgaruvchisini ishlatadi
```

`QRErrorCorrection` tipini `../types` importiga qoʻshing.

- [ ] **Step 4: Oʻtishini tasdiqlash va darvoza**

```bash
/usr/bin/npx vitest run src/commands/escpos-builder.test.ts && /usr/bin/npm run test:run && /usr/bin/npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/commands/escpos-builder.ts src/commands/escpos-builder.test.ts
git commit -m "feat(escpos): validate QR payload against the symbol's real capacity

Commands.QRCODE.STORE only rejected payloads above its 65532-byte length
field, which no symbol can approach. The real limit is 2953 bytes at level L
down to 1273 at level H, and only the builder knows which level was asked for.

Carried over from the previous milestone's final review, which deferred it to
this one."
```

---

### Task 6: `ReceiptBuilder` metodlari

**Files:**
- Modify: `src/utils/receipt-builder.ts`
- Modify: `src/utils/receipt-builder.test.ts`

**Interfaces:**
- Produces: `openCashDrawer(pin?: 2 | 5): this`, `beep(times?: number, duration?: number): this`

- [ ] **Step 1: Failing testni yozish**

```ts
describe('cash drawer and beeper', () => {
  it('appends a cash drawer pulse defaulting to pin 2', () => {
    const contents = createReceipt(80).openCashDrawer().getContents();
    expect(contents).toEqual([{ type: 'cashdraw', pin: 2 }]);
  });

  it('appends a cash drawer pulse on pin 5', () => {
    expect(createReceipt(80).openCashDrawer(5).getContents()).toEqual([
      { type: 'cashdraw', pin: 5 },
    ]);
  });

  it('appends a beep with default times and duration', () => {
    expect(createReceipt(80).beep().getContents()).toEqual([
      { type: 'beep', times: 1, duration: 3 },
    ]);
  });

  it('appends a beep with explicit times and duration', () => {
    expect(createReceipt(80).beep(3, 5).getContents()).toEqual([
      { type: 'beep', times: 3, duration: 5 },
    ]);
  });

  it('keeps the sequence the caller wrote', () => {
    const contents = createReceipt(80).cut(true).openCashDrawer().beep().getContents();
    expect(contents.map((c) => c.type)).toEqual(['cut', 'cashdraw', 'beep']);
  });
});
```

Oxirgi test muhim: kassa qutisi chekni kesgandan **keyin** ochilishi kerakmi yoki oldin — bu foydalanuvchining qarori, va builder tartibni saqlashi shart.

- [ ] **Step 2: Yiqilishini tasdiqlash**

```bash
/usr/bin/npx vitest run src/utils/receipt-builder.test.ts
```

- [ ] **Step 3: Implementatsiya**

`cut()` metodidan keyin:

```ts
  /**
   * Add a cash drawer pulse.
   *
   * Position matters: place it before or after `cut()` depending on whether
   * the drawer should open while the receipt is still printing.
   */
  openCashDrawer(pin: 2 | 5 = 2): this {
    this.contents.push({ type: 'cashdraw', pin });
    return this;
  }

  /**
   * Add a beeper signal.
   *
   * Many printers ignore the beeper command entirely; a silent printer is a
   * hardware answer rather than a fault in this package.
   */
  beep(times: number = 1, duration: number = 3): this {
    this.contents.push({ type: 'beep', times, duration });
    return this;
  }
```

- [ ] **Step 4: Oʻtishini tasdiqlash va darvoza**

```bash
/usr/bin/npm run test:run && /usr/bin/npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/utils/receipt-builder.ts src/utils/receipt-builder.test.ts
git commit -m "feat(receipt): add openCashDrawer() and beep()

Both append content items rather than acting immediately, so the caller
controls where in the sequence they fire — a drawer that opens before the cut
and one that opens after are different behaviours, and only the caller knows
which they want."
```

---

### Task 7: Logotipli golden fixture

Mavjud golden fixture matn, jadval, QR va kesishni muhrlaydi. Rasm uchun **ikkinchi** fixture qoʻshiladi, mavjudini oʻzgartirmasdan: birinchisi matn yoʻlining regressiya himoyasi boʻlib qoladi, ikkinchisi rasm yoʻlini qoplaydi.

**Files:**
- Create: `src/commands/__fixtures__/receipt-with-logo.golden.txt`
- Modify: `src/commands/golden.test.ts`

- [ ] **Step 1: Testni yozish**

`golden.test.ts` ga qoʻshing:

```ts
import { makePNG } from '../images/__testutils__/make-png';

const LOGO_FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
  'receipt-with-logo.golden.txt'
);

/**
 * A deterministic 16x4 logo: a solid black bar over a transparent field.
 * Transparency is deliberate — it is the case that would print as a filled
 * rectangle if alpha were dropped.
 */
function logoBase64(): string {
  const rows: number[][] = [];
  for (let y = 0; y < 4; y++) {
    const row: number[] = [];
    for (let x = 0; x < 16; x++) {
      const solid = y < 2 && x >= 4 && x < 12;
      row.push(0, 0, 0, solid ? 255 : 0);
    }
    rows.push(row);
  }
  return makePNG({ width: 16, height: 4, colorType: 6, rows }).toString('base64');
}

function buildLogoReceipt(): Buffer {
  const receipt = createReceipt(80)
    .image(logoBase64(), { align: 'center' })
    .textCenter('Магазин', { bold: true })
    .openCashDrawer()
    .beep()
    .cut(true);

  return buildESCPOSData(receipt.getContents(), { paperWidth: 80, codepage: 'PC866' });
}

describe('golden receipt with a logo', () => {
  it('matches the committed dump', () => {
    const actual = dumpESCPOS(buildLogoReceipt(), { table: 'PC866' });
    expect(actual).toBe(readFileSync(LOGO_FIXTURE, 'utf8').trimEnd());
  });

  it('emits the raster inside zero line spacing', () => {
    const data = buildLogoReceipt();
    const spacing = data.indexOf(Buffer.from([0x1b, 0x33, 0x00]));
    const raster = data.indexOf(Buffer.from([0x1d, 0x76, 0x30, 0x00]));
    const restore = data.indexOf(Buffer.from([0x1b, 0x32]));
    expect(spacing).toBeGreaterThan(0);
    expect(raster).toBeGreaterThan(spacing);
    expect(restore).toBeGreaterThan(raster);
  });

  it('prints the transparent field as white', () => {
    const data = buildLogoReceipt();
    const at = data.indexOf(Buffer.from([0x1d, 0x76, 0x30, 0x00]));
    // 16 px wide -> 2 bytes per row. Row 0 is the solid bar: columns 4-11.
    expect(data[at + 8]).toBe(0x0f);
    expect(data[at + 9]).toBe(0xf0);
  });
});
```

- [ ] **Step 2: Yiqilishini tasdiqlash**

```bash
/usr/bin/npx vitest run src/commands/golden.test.ts
```

Kutilgan: birinchi test fixture yoʻqligidan yiqiladi (`ENOENT`); ikkinchi va uchinchi testlar **oʻtishi kerak**. Agar uchinchisi yiqilsa — alpha kompozitsiyasi buzuq, toʻxtang va xabar bering.

- [ ] **Step 3: Dump'ni ishlab chiqarish**

```bash
cat > src/commands/__dump-logo.test.ts <<'EOF'
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createReceipt } from '../utils/receipt-builder';
import { buildESCPOSData } from './escpos-builder';
import { dumpESCPOS } from '../utils/hex-dump';
import { makePNG } from '../images/__testutils__/make-png';

it('writes the logo golden dump', () => {
  const rows: number[][] = [];
  for (let y = 0; y < 4; y++) {
    const row: number[] = [];
    for (let x = 0; x < 16; x++) {
      const solid = y < 2 && x >= 4 && x < 12;
      row.push(0, 0, 0, solid ? 255 : 0);
    }
    rows.push(row);
  }
  const logo = makePNG({ width: 16, height: 4, colorType: 6, rows }).toString('base64');
  const receipt = createReceipt(80)
    .image(logo, { align: 'center' })
    .textCenter('Магазин', { bold: true })
    .openCashDrawer()
    .beep()
    .cut(true);
  const data = buildESCPOSData(receipt.getContents(), { paperWidth: 80, codepage: 'PC866' });
  writeFileSync(
    'src/commands/__fixtures__/receipt-with-logo.golden.txt',
    dumpESCPOS(data, { table: 'PC866' }) + '\n',
    'utf8'
  );
});
EOF
/usr/bin/npx vitest run src/commands/__dump-logo.test.ts
cat src/commands/__fixtures__/receipt-with-logo.golden.txt
```

**Chek mazmuni `golden.test.ts` dagi `buildLogoReceipt()` bilan aynan bir xil boʻlishi shart** — bir belgi farq qilsa test yiqiladi.

- [ ] **Step 4: Mnemonika ketma-ketligini QOʻLDA tekshirish**

Chiqishning mnemonika ustuni aynan shu tartibda boʻlishi kerak:

| # | Mnemonika | Izoh |
|---|---|---|
| 1 | `ESC @` | Initialize printer |
| 2 | `ESC t 17` | Select character table (PC866) |
| 3 | `ESC a 1` | rasm markazda |
| 4 | `ESC 3 0` | satr oraligʻi nol |
| 5 | `GS v 0` | Raster image 16x4 |
| 6 | `ESC 2` | satr oraligʻi default |
| 7 | `ESC a 0` | |
| 8 | `ESC a 1` | textCenter |
| 9 | `ESC E 1` | bold on |
| 10 | `"Магазин"` | |
| 11 | `LF` | |
| 12 | `ESC E 0` | |
| 13 | `ESC a 0` | |
| 14 | `ESC p 0` | Pulse cash drawer pin 2 |
| 15 | `ESC B 1 3` | Beep |
| 16 | `ESC d 3` | cut oldidagi feed |
| 17 | `GS V 1` | **Partial cut** |

Ayniqsa tekshiring:
- 4–6-satrlar: raster **`ESC 3 0` va `ESC 2` orasida**
- 5-satr: `Raster image 16x4` — kenglik 16 boʻlib qolgan, yaʻni kattalashtirilmagan
- 17-satr `GS V 1`, `GS V 65 0` emas
- Hech qayerda `unknown byte` yoʻq

Farq topsangiz — fixture’ni emas, **kodni** tuzating.

- [ ] **Step 5: Tasdiqlash, tozalash va commit**

```bash
rm -f src/commands/__dump-logo.test.ts
/usr/bin/npm run test:run && /usr/bin/npm run typecheck
git add src/commands/__fixtures__/receipt-with-logo.golden.txt src/commands/golden.test.ts
git commit -m "test(escpos): add a golden dump for a receipt with a logo

A second fixture rather than an edit to the first, so the existing one keeps
guarding the text, table, QR and cut path untouched while this one covers the
image path, the cash drawer and the beeper.

The logo is deliberately transparent-backed: that is the case that would print
as a filled black rectangle if alpha were dropped, and the fixture pins the
exact bytes that prove it is not."
```

---

### Task 8: Eksportlar, versiya va hujjatlar

**Files:**
- Modify: `src/index.ts`, `package.json`, `CHANGELOG.md`, `README.md`, `CLAUDE.md`

- [ ] **Step 1: `src/index.ts` ga eksportlarni qoʻshish**

**Takroriy eksport tuzogʻi, 1-bosqichdagi kabi:** `PRINTABLE_WIDTH_58` va `PRINTABLE_WIDTH_80` `src/types/index.ts` da eʻlon qilingan va `export * from './types'` orqali ildizga chiqadi. Ularni **qayta eksport qilmang** — `.d.ts` build’i yiqiladi.

`// HTML builder` boʻlimidan **oldin** qoʻshing:

```ts
// Image decoding and rasterisation
export { decodePNG, MAX_IMAGE_DIMENSION } from './images/png';
export type { DecodedImage } from './images/png';
export { rasterize, toBands, BAND_HEIGHT } from './images/raster';
export type { RasterImage, RasterizeOptions } from './images/raster';
```

`validateBarcodeValue` eksport satriga `validateQRCodeValue` ni qoʻshing.

- [ ] **Step 2: Build bilan tekshirish**

```bash
/usr/bin/npm run typecheck && /usr/bin/npm run build
```

`dts` bosqichi takroriy eksportni aniqlaydi. Xato boʻlsa, nomni faqat bitta manbadan eksport qiling.

- [ ] **Step 3: Versiyani koʻtarish**

```bash
/usr/bin/npm version 2.1.0 --no-git-tag-version
```

- [ ] **Step 4: `CHANGELOG.md` ga yozuv qoʻshish**

`## [2.0.0]` dan **oldin**:

```markdown
## [2.1.0] - 2026-08-19

### Added

- PNG image printing. Colour types 0, 2, 3, 4 and 6; bit depths 1, 2, 4 and 8
  for greyscale and palette; all five scanline filters; `PLTE` and `tRNS`.
  Decoded with Node's own zlib — the package still has no runtime dependency.
- `ImageOptions.dither` (`'threshold'` by default, or `'floyd-steinberg'`) and
  `ImageOptions.threshold`.
- `cashdraw` and `beep` content types, and `ReceiptBuilder.openCashDrawer()`
  and `.beep()`. Both are content items, so the caller controls where in the
  sequence they fire.
- `decodePNG()`, `rasterize()` and `toBands()` are exported for callers who
  want the raster without the receipt.
- `PRINTABLE_WIDTH_58` and `PRINTABLE_WIDTH_80`.
- `validateQRCodeValue()` rejects a payload larger than the symbol can hold at
  the requested error-correction level.

### Changed

- **Image content now throws on a malformed image instead of skipping it.**
  2.0.0 skipped every image silently, because at that point none could be
  printed and throwing would have broken any receipt built from data with a
  logo. Now only a malformed image fails, so failing loudly is the right
  behaviour and matches barcode validation. A valid image simply prints.
- `ImageContent.source` accepts base64 or a `data:image/png;base64,...` URL
  only. It previously documented file paths, which never worked; accepting one
  would let a renderer have the main process read an arbitrary file on its
  behalf. Read it yourself: `readFileSync(path).toString('base64')`.

### Fixed

- `buildContent` now fails to compile if a `PrintContent` variant has no case,
  rather than silently printing nothing for it.

### Notes

- Images are emitted as 128-row bands wrapped in zero line spacing, because
  cheap printers drop a tall single raster silently.
- Input images are capped at 4096x4096: decoding is synchronous and runs on
  Electron's main process.
- Many printers ignore the beeper command entirely.
```

- [ ] **Step 5: README ga «Images and logos» boʻlimini qoʻshish**

«Codepages and languages» boʻlimidan keyin:

```markdown
## Images and logos

Pass a PNG as base64, or as a `data:image/png;base64,...` URL:

```ts
import { readFileSync } from 'node:fs';

receipt.image(readFileSync('logo.png').toString('base64'), { align: 'center' });
```

File paths are not accepted. Print content can arrive from a renderer over
IPC, and reading an arbitrary path on its behalf would give it a capability it
should not have — so the caller reads its own file.

### Supported PNGs

| Colour type | Bit depths |
|---|---|
| Greyscale | 1, 2, 4, 8 |
| RGB | 8 |
| Palette (with `PLTE`, optional `tRNS`) | 1, 2, 4, 8 |
| Greyscale + alpha | 8 |
| RGBA | 8 |

All five scanline filters are handled. 16-bit and interlaced PNGs are rejected
with a message saying what to re-save. Input is capped at 4096×4096, because
decoding is synchronous and runs on the main process.

Transparency is composited over white, so a logo with a cut-out background
prints as the logo rather than as a filled black rectangle.

### Sizing

Images are scaled down to fit the printable width — 384 dots on 58mm paper,
576 on 80mm — and are never scaled up, since stretching a small logo only
makes it blocky. `ImageOptions.width` sets an explicit width, clamped to the
same limit.

### Dithering

`dither: 'threshold'` (the default) applies a single cutoff, which keeps an
already-black-and-white logo crisp. `dither: 'floyd-steinberg'` spreads the
error into a dot pattern, which preserves the tone of a photograph or a
gradient — at the cost of a pattern that thermal dot bloom can smear.

```ts
receipt.image(logo, { dither: 'floyd-steinberg' });
```

## Cash drawer and beeper

```ts
receipt.cut().openCashDrawer().beep();
```

Both are content items, so their position in the sequence is yours to choose:
a drawer that opens before the cut and one that opens after are different
behaviours.

`openCashDrawer(5)` uses pin 5 instead of the default pin 2.

Many printers ignore the beeper command entirely. Nothing in this package can
detect that, so a silent beeper is a hardware answer rather than a fault here.
```

README’ning «Print modes» jadvalidagi rasm qatorini tuzating — u hozir «skipped until raster support lands» deydi va bu endi notoʻgʻri. Yangi qiymat: raw rejimda chop etiladi, html rejimida `<img>` sifatida.

- [ ] **Step 6: `CLAUDE.md` ni yangilash**

`src/images/` katalogini `Directory Structure` ga qoʻshing, `Key Components` ga `decodePNG` va `rasterize` ni, va `Encoding pipeline` yonига rasterizatsiya quvuri tartibini yozing — ayniqsa «oʻlchamni moslash dithering’dan oldin» invariantini, chunki uni buzish oson va natija sekin sezuvchan.

- [ ] **Step 7: Toʻliq darvoza**

```bash
/usr/bin/npm run test:run && /usr/bin/npm run typecheck && /usr/bin/npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/index.ts package.json CHANGELOG.md README.md CLAUDE.md
git commit -m "docs: document 2.1.0 — images, cash drawer and beeper

Records the one behaviour reversal openly: image content threw nothing in
2.0.0 and now throws on a malformed image. The earlier choice was right when
no image could print at all; it is wrong now that only broken ones fail.

Corrects the print-modes table, which still said images were skipped."
```

---

### Task 9: `example/` ilovasi

**Files:**
- Modify: `example/index.html`, `example/main.js`

- [ ] **Step 1: Namuna logotipini qoʻshish**

`example/index.html` ga logotip generatorini qoʻshing. Binar fayl saqlamaymiz — logotip sahifada canvas bilan yasaladi va base64 ga aylantiriladi, bu esa bir vaqtning oʻzida haqiqiy foydalanish naqshini koʻrsatadi: renderer rasmni oladi va base64 sifatida uzatadi.

```js
/** Draws a simple shop mark and returns it as base64 PNG. */
function makeLogo() {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  // Transparent background on purpose: this is the case that would print as a
  // filled black rectangle if the library dropped the alpha channel.
  ctx.clearRect(0, 0, 240, 80);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 30, 240, 8);
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('DOʻKON', 120, 72);
  return canvas.toDataURL('image/png').split(',')[1];
}
```

- [ ] **Step 2: Namuna chekka logotip, kassa qutisi va signal qoʻshish**

`sampleContents()` ning boshiga rasmni, oxiriga kassa qutisi va signalni qoʻshing:

```js
function sampleContents() {
  return [
    { type: 'image', source: makeLogo(), options: { align: 'center' } },
    // ... mavjud kontent oʻzgarmaydi ...
    { type: 'cut', partial: true },
    { type: 'cashdraw' },
    { type: 'beep' },
  ];
}
```

Kassa qutisi kesishdan **keyin** — chek allaqachon chiqib boʻlgan va kassir uni olayotganda quti ochiladi.

- [ ] **Step 3: Dithering tanlash roʻyxatini qoʻshish**

Codepage roʻyxati yoniga:

```html
<label for="dither">Dithering</label>
<select id="dither">
  <option value="threshold" selected>threshold — crisp logos</option>
  <option value="floyd-steinberg">floyd-steinberg — photos and gradients</option>
</select>
```

`config()` ni oʻzgartirmang — dithering `ImageOptions` ga tegishli, `PrinterConfig` ga emas. Uning oʻrniga `sampleContents()` roʻyxatdan oʻqisin:

```js
{ type: 'image', source: makeLogo(), options: { align: 'center', dither: document.getElementById('dither').value } }
```

- [ ] **Step 4: Tekshirish**

Electron GUI’sini bu muhitda ishga tushirib boʻlmaydi va buni **yashirmang**. Oʻrniga:

```bash
/usr/bin/npm run build
cd example && /usr/bin/npm install && cd ..
/usr/bin/node --check example/main.js
/usr/bin/node -e "const p=require('./example/node_modules/@madrimov/electron-pos-printer'); console.log(['setupPrinterIPC','buildESCPOSData','dumpESCPOS','decodePNG','rasterize'].map(n=>n+'='+typeof p[n]).join(' '))"
```

Hisobotda GUI tekshiruvi **bajarilmaganini** ochiq yozing.

- [ ] **Step 5: Commit**

```bash
git add example/
git commit -m "feat(example): print a logo, open the drawer, sound the beeper

The logo is drawn on a canvas and passed as base64, which is both how a
renderer would really do it and a demonstration of why file paths are not
accepted. Its background is transparent on purpose: that is the case that
would print as a filled black rectangle if alpha were dropped.

The drawer pulse sits after the cut, where a cashier taking the receipt would
expect it."
```

---

## Yakuniy tekshiruv

- [ ] `/usr/bin/npm run test:run` — barcha testlar oʻtadi, shu jumladan 1-bosqichdan kelgan 227 tasi
- [ ] `/usr/bin/npm run typecheck` — xatosiz
- [ ] `/usr/bin/npm run build` — CJS, ESM va `.d.ts` toza
- [ ] Spec §13 dagi bajarilganlik mezonining oʻn bir punkti ham qanoatlantirilgan
- [ ] `git log --oneline` — har bir task oʻz commit’iga ega

Soʻng `superpowers:finishing-a-development-branch` bilan branch yakunlanadi. PR #1 hali ochiq boʻlsa, bu ikkinchi PR unga stacked boʻladi.
