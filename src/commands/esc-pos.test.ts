import { describe, it, expect } from 'vitest';
import { Commands, toBuffer, concat, ESC, GS, LF } from './esc-pos';

const hex = (b: Buffer) => [...b].map((n) => n.toString(16).toUpperCase().padStart(2, '0')).join(' ');

describe('control characters', () => {
  it('exposes the codes the builder relies on', () => {
    expect(ESC).toBe(0x1b);
    expect(GS).toBe(0x1d);
    expect(LF).toBe(0x0a);
  });
});

describe('Commands are Buffers', () => {
  it('returns a Buffer for INIT', () => {
    expect(Buffer.isBuffer(Commands.INIT)).toBe(true);
    expect(hex(Commands.INIT)).toBe('1B 40');
  });

  it('returns Buffers for alignment', () => {
    expect(hex(Commands.ALIGN.LEFT)).toBe('1B 61 00');
    expect(hex(Commands.ALIGN.CENTER)).toBe('1B 61 01');
    expect(hex(Commands.ALIGN.RIGHT)).toBe('1B 61 02');
  });

  it('returns Buffers for text styles', () => {
    expect(hex(Commands.TEXT.BOLD_ON)).toBe('1B 45 01');
    expect(hex(Commands.TEXT.DOUBLE_SIZE)).toBe('1B 21 30');
    expect(hex(Commands.TEXT.INVERT_ON)).toBe('1D 42 01');
  });
});

describe('Commands.PAPER', () => {
  it('uses GS V 1 for a partial cut', () => {
    expect(hex(Commands.PAPER.CUT_PARTIAL)).toBe('1D 56 01');
  });

  it('uses GS V 0 for a full cut', () => {
    expect(hex(Commands.PAPER.CUT_FULL)).toBe('1D 56 00');
  });

  it('distinguishes feed-then-full-cut from feed-then-partial-cut', () => {
    expect(hex(Commands.PAPER.CUT_FEED_FULL(3))).toBe('1D 56 41 03');
    expect(hex(Commands.PAPER.CUT_FEED_PARTIAL(3))).toBe('1D 56 42 03');
  });

  it('clamps the feed count into one byte', () => {
    expect(hex(Commands.PAPER.FEED_N(5))).toBe('1B 64 05');
    expect(hex(Commands.PAPER.FEED_N(999))).toBe('1B 64 FF');
    expect(hex(Commands.PAPER.FEED_N(-1))).toBe('1B 64 00');
  });
});

describe('Commands.BARCODE.PRINT', () => {
  it('uses the length-prefixed form, not NUL termination', () => {
    const out = Commands.BARCODE.PRINT(Commands.BARCODE.TYPE.CODE128, Buffer.from('AB', 'ascii'));
    // GS k 73 2 'A' 'B' — no trailing NUL
    expect(hex(out)).toBe('1D 6B 49 02 41 42');
  });

  it('reports the data length in the n byte', () => {
    const out = Commands.BARCODE.PRINT(Commands.BARCODE.TYPE.EAN13, Buffer.from('123456789012', 'ascii'));
    expect(out[3]).toBe(12);
  });

  it('rejects data longer than one length byte can express', () => {
    expect(() =>
      Commands.BARCODE.PRINT(Commands.BARCODE.TYPE.CODE128, Buffer.alloc(256))
    ).toThrow(/256 bytes/);
  });

  it('exposes the documented type codes', () => {
    expect(Commands.BARCODE.TYPE.CODE128).toBe(0x49);
    expect(Commands.BARCODE.TYPE.EAN13).toBe(0x43);
    expect(Commands.BARCODE.TYPE['UPC-A']).toBe(0x41);
  });

  it('clamps barcode height and width to their legal ranges', () => {
    expect(hex(Commands.BARCODE.HEIGHT(0))).toBe('1D 68 01');
    expect(hex(Commands.BARCODE.HEIGHT(300))).toBe('1D 68 FF');
    expect(hex(Commands.BARCODE.WIDTH(1))).toBe('1D 77 02');
    expect(hex(Commands.BARCODE.WIDTH(9))).toBe('1D 77 06');
  });
});

describe('Commands.QRCODE', () => {
  it('sends the model as a character code, not a raw number', () => {
    // GS ( k 4 0 49 65 50 0 — 50 is '2', the model-2 selector
    expect(hex(Commands.QRCODE.MODEL(2))).toBe('1D 28 6B 04 00 31 41 32 00');
    expect(hex(Commands.QRCODE.MODEL(1))).toBe('1D 28 6B 04 00 31 41 31 00');
  });

  it('clamps the module size', () => {
    expect(hex(Commands.QRCODE.SIZE(6))).toBe('1D 28 6B 03 00 31 43 06');
    expect(hex(Commands.QRCODE.SIZE(99))).toBe('1D 28 6B 03 00 31 43 10');
    expect(hex(Commands.QRCODE.SIZE(0))).toBe('1D 28 6B 03 00 31 43 01');
  });

  it('computes pL/pH from the data length plus three', () => {
    const out = Commands.QRCODE.STORE(Buffer.from('hi', 'utf8'));
    // len = 2 + 3 = 5
    expect(out[3]).toBe(5);
    expect(out[4]).toBe(0);
    expect(hex(out.subarray(0, 8))).toBe('1D 28 6B 05 00 31 50 30');
  });

  it('splits pL/pH correctly for data over 255 bytes', () => {
    const out = Commands.QRCODE.STORE(Buffer.alloc(300, 0x41));
    expect(out[3]).toBe((303) & 0xff);
    expect(out[4]).toBe((303 >> 8) & 0xff);
  });
});

describe('Commands.IMAGE.RASTER', () => {
  it('rounds the width up to whole bytes', () => {
    // width 10 -> 2 bytes per row
    const out = Commands.IMAGE.RASTER(10, 1, Buffer.alloc(2));
    expect(out[4]).toBe(2);
    expect(out[5]).toBe(0);
  });

  it('keeps an exact width unchanged', () => {
    const out = Commands.IMAGE.RASTER(16, 1, Buffer.alloc(2));
    expect(out[4]).toBe(2);
  });

  it('emits the raster header followed by the data', () => {
    const out = Commands.IMAGE.RASTER(8, 2, Buffer.from([0xff, 0x00]));
    expect(hex(out)).toBe('1D 76 30 00 01 00 02 00 FF 00');
  });

  it('rejects data whose length does not match the dimensions', () => {
    expect(() => Commands.IMAGE.RASTER(10, 2, Buffer.alloc(3))).toThrow(/does not match/);
  });
});

describe('helpers', () => {
  it('toBuffer converts a byte array', () => {
    expect(hex(toBuffer([0x1b, 0x40]))).toBe('1B 40');
  });

  it('concat joins arrays and Buffers', () => {
    expect(hex(concat([0x01], Buffer.from([0x02]), [0x03]))).toBe('01 02 03');
  });
});

describe('removed APIs', () => {
  it('no longer exposes CHARSET (superseded by selectCodepage)', () => {
    expect('CHARSET' in Commands).toBe(false);
  });
});
