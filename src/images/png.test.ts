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
