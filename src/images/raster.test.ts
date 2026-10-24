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
