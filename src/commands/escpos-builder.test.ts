import { describe, it, expect } from 'vitest';
import { buildESCPOSData } from './escpos-builder';
import type { PrintContent, PaperWidth, BarcodeType } from '../types';

/**
 * Wrapper around buildESCPOSData so the signature change in the next task
 * touches one line instead of every call site.
 */
const build = (contents: PrintContent[], paperWidth: PaperWidth = 80): Buffer =>
  buildESCPOSData(contents, { paperWidth });

/** Offset of a byte sequence, or -1. */
const seqAt = (data: Buffer, ...bytes: number[]): number => data.indexOf(Buffer.from(bytes));

/** Asserts the sequences appear in this order, each after the previous. */
function expectOrder(data: Buffer, sequences: number[][]): void {
  let cursor = 0;
  for (const sequence of sequences) {
    const found = data.indexOf(Buffer.from(sequence), cursor);
    expect(
      found,
      `sequence ${sequence.map((b) => b.toString(16)).join(' ')} not found after offset ${cursor}`
    ).toBeGreaterThanOrEqual(0);
    cursor = found + sequence.length;
  }
}

describe('buildESCPOSData framing', () => {
  it('starts with ESC @ at offset zero', () => {
    const data = build([]);
    expect(seqAt(data, 0x1b, 0x40)).toBe(0);
  });
});

describe('text content', () => {
  it('emits left alignment, the text, a line feed, then left alignment again', () => {
    const data = build([{ type: 'text', value: 'Hi' }]);
    expectOrder(data, [
      [0x1b, 0x61, 0x00], // ESC a 0
      [0x48, 0x69], // "Hi"
      [0x0a], // LF
      [0x1b, 0x61, 0x00], // ESC a 0
    ]);
  });

  it('emits centre alignment before centred text', () => {
    const data = build([{ type: 'text', value: 'Hi', style: { align: 'center' } }]);
    expectOrder(data, [[0x1b, 0x61, 0x01], [0x48, 0x69]]);
  });

  it('emits right alignment before right-aligned text', () => {
    const data = build([{ type: 'text', value: 'Hi', style: { align: 'right' } }]);
    expectOrder(data, [[0x1b, 0x61, 0x02], [0x48, 0x69]]);
  });

  it('wraps bold text in ESC E 1 and ESC E 0', () => {
    const data = build([{ type: 'text', value: 'Hi', style: { bold: true } }]);
    expectOrder(data, [[0x1b, 0x45, 0x01], [0x48, 0x69], [0x1b, 0x45, 0x00]]);
  });

  it('wraps underlined text in ESC - 1 and ESC - 0', () => {
    const data = build([{ type: 'text', value: 'Hi', style: { underline: true } }]);
    expectOrder(data, [[0x1b, 0x2d, 0x01], [0x48, 0x69], [0x1b, 0x2d, 0x00]]);
  });

  it('wraps inverted text in GS B 1 and GS B 0', () => {
    const data = build([{ type: 'text', value: 'Hi', style: { invert: true } }]);
    expectOrder(data, [[0x1d, 0x42, 0x01], [0x48, 0x69], [0x1d, 0x42, 0x00]]);
  });

  it('selects double size and resets it afterwards', () => {
    const data = build([{ type: 'text', value: 'Hi', style: { size: 'double' } }]);
    expectOrder(data, [[0x1b, 0x21, 0x30], [0x48, 0x69], [0x1b, 0x21, 0x00]]);
  });

  it('selects double height and double width separately', () => {
    expect(seqAt(build([{ type: 'text', value: 'x', style: { size: 'double-height' } }]), 0x1b, 0x21, 0x10)).toBeGreaterThan(0);
    expect(seqAt(build([{ type: 'text', value: 'x', style: { size: 'double-width' } }]), 0x1b, 0x21, 0x20)).toBeGreaterThan(0);
  });
});

describe('line content', () => {
  it('fills the whole line for 80mm paper', () => {
    const data = build([{ type: 'line', character: '-' }]);
    expect([...data].filter((b) => b === 0x2d)).toHaveLength(48);
  });

  it('fills the whole line for 58mm paper', () => {
    const data = build([{ type: 'line' }], 58);
    expect([...data].filter((b) => b === 0x2d)).toHaveLength(32);
  });

  it('uses the given separator character', () => {
    const data = build([{ type: 'line', character: '=' }]);
    expect([...data].filter((b) => b === 0x3d)).toHaveLength(48);
  });
});

describe('feed and cut', () => {
  it('emits ESC d n for a feed', () => {
    expect(seqAt(build([{ type: 'feed', lines: 5 }]), 0x1b, 0x64, 0x05)).toBeGreaterThan(0);
  });

  it('feeds three lines then cuts fully by default', () => {
    const data = build([{ type: 'cut' }]);
    expectOrder(data, [[0x1b, 0x64, 0x03], [0x1d, 0x56, 0x00]]);
  });
});

describe('table content', () => {
  it('pads two flexible columns to exactly half the line each', () => {
    const data = build([
      {
        type: 'table',
        rows: [[{ text: 'Item', align: 'left' }, { text: '100', align: 'right' }]],
      },
    ]);
    const expected = 'Item'.padEnd(24) + '100'.padStart(24);
    expect(data.toString('ascii')).toContain(expected);
  });

  it('honours percentage widths', () => {
    const data = build([
      {
        type: 'table',
        rows: [[{ text: 'A', width: '25%' }, { text: 'B', width: '75%' }]],
      },
    ]);
    const expected = 'A'.padEnd(12) + 'B'.padEnd(36);
    expect(data.toString('ascii')).toContain(expected);
  });

  it('centres text inside a column', () => {
    const data = build([
      { type: 'table', rows: [[{ text: 'AB', width: 6, align: 'center' }]] },
    ]);
    expect(data.toString('ascii')).toContain('  AB  ');
  });

  it('truncates text that does not fit its column', () => {
    const data = build([
      { type: 'table', rows: [[{ text: 'ABCDEF', width: 3 }]] },
    ]);
    const text = data.toString('ascii');
    expect(text).toContain('ABC');
    expect(text).not.toContain('ABCD');
  });

  it('wraps a row containing a bold column in bold on/off', () => {
    const data = build([
      { type: 'table', rows: [[{ text: 'Total', bold: true }, { text: '9', align: 'right' }]] },
    ]);
    expectOrder(data, [[0x1b, 0x45, 0x01], [0x54, 0x6f, 0x74], [0x1b, 0x45, 0x00]]);
  });
});

describe('qrcode content', () => {
  it('emits size, error correction, store and print in order', () => {
    const data = build([
      { type: 'qrcode', value: 'hi', options: { size: 6, errorCorrection: 'M', align: 'center' } },
    ]);
    expectOrder(data, [
      [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06], // size 6
      [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31], // EC level M
      [0x1d, 0x28, 0x6b, 0x05, 0x00, 0x31, 0x50, 0x30], // store, pL = 2 + 3
      [0x68, 0x69], // "hi"
      [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30], // print
    ]);
  });
});

describe('barcode content', () => {
  it('emits height, module width, HRI position then the barcode', () => {
    const data = build([
      {
        type: 'barcode',
        value: '123456',
        options: { type: 'CODE128', height: 80, width: 2, textPosition: 'below', align: 'center' },
      },
    ]);
    expectOrder(data, [
      [0x1d, 0x68, 0x50], // GS h 80
      [0x1d, 0x77, 0x02], // GS w 2
      [0x1d, 0x48, 0x02], // GS H 2 (below)
      [0x1d, 0x6b, 0x49], // GS k 73 (CODE128)
    ]);
  });

  it('prefixes CODE128 payloads with the code-set B selector', () => {
    const data = build([
      { type: 'barcode', value: 'AB', options: { type: 'CODE128' } },
    ]);
    expectOrder(data, [[0x7b, 0x42], [0x41, 0x42]]);
  });

  it('omits the HRI text when textPosition is none', () => {
    const data = build([
      { type: 'barcode', value: 'AB', options: { type: 'CODE128', textPosition: 'none' } },
    ]);
    expect(seqAt(data, 0x1d, 0x48, 0x00)).toBeGreaterThan(0);
  });
});

describe('image content', () => {
  it('emits nothing until real image support lands in milestone 2', () => {
    const withImage = buildESCPOSData([{ type: 'image', source: 'logo.png' }]);
    const withoutImage = buildESCPOSData([]);
    expect([...withImage]).toEqual([...withoutImage]);
  });

  it('never prints a placeholder on the receipt', () => {
    const data = buildESCPOSData([{ type: 'image', source: 'logo.png' }]);
    expect(data.toString('ascii')).not.toContain('IMAGE');
  });

  it('does not break a receipt built from data with a logo', () => {
    expect(() =>
      buildESCPOSData([
        { type: 'image', source: 'logo.png' },
        { type: 'text', value: 'Shop' },
      ])
    ).not.toThrow();
  });
});

describe('codepage selection', () => {
  it('emits ESC t immediately after ESC @', () => {
    const data = buildESCPOSData([], { codepage: 'PC866' });
    expect([...data]).toEqual([0x1b, 0x40, 0x1b, 0x74, 0x11]);
  });

  it('defaults to PC437, which is ESC t 0', () => {
    const data = buildESCPOSData([]);
    expect([...data]).toEqual([0x1b, 0x40, 0x1b, 0x74, 0x00]);
  });

  it('sends a numeric codepage verbatim', () => {
    const data = buildESCPOSData([], { codepage: 73, codepageTable: 'CP1251' });
    expect([...data]).toEqual([0x1b, 0x40, 0x1b, 0x74, 0x49]);
  });
});

describe('text encoding', () => {
  it('encodes Cyrillic through the selected table', () => {
    const data = buildESCPOSData([{ type: 'text', value: 'Привет' }], { codepage: 'PC866' });
    expect(seqAt(data, 0x8f, 0xe0, 0xa8, 0xa2, 0xa5, 0xe2)).toBeGreaterThan(0);
  });

  it('encodes the same text differently under CP1251', () => {
    const data = buildESCPOSData([{ type: 'text', value: 'Привет' }], {
      codepage: 73,
      codepageTable: 'CP1251',
    });
    expect(seqAt(data, 0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2)).toBeGreaterThan(0);
  });

  it('transliterates Uzbek Latin turned commas', () => {
    const data = buildESCPOSData([{ type: 'text', value: 'Toʻxta' }], { codepage: 'PC437' });
    expect(data.toString('ascii')).toContain("To'xta");
  });

  it('does not emit UTF-8 bytes for Cyrillic', () => {
    const data = buildESCPOSData([{ type: 'text', value: 'П' }], { codepage: 'PC866' });
    // UTF-8 for П is D0 9F; the printer must receive the single byte 8F
    expect(seqAt(data, 0xd0, 0x9f)).toBe(-1);
  });
});

describe('layout runs after transliteration', () => {
  it('keeps column widths correct when an ellipsis expands to three dots', () => {
    const data = buildESCPOSData(
      [{ type: 'table', rows: [[{ text: 'a…', width: 6 }, { text: 'b', width: 6 }]] }],
      { codepage: 'PC437' }
    );
    // 'a…' normalizes to 'a...' (4 chars) and is then padded to 6
    expect(data.toString('ascii')).toContain('a...  b     ');
  });

  it('pads an unencodable character as a single question mark', () => {
    const data = buildESCPOSData(
      [{ type: 'table', rows: [[{ text: '日x', width: 4 }]] }],
      { codepage: 'PC437' }
    );
    expect(data.toString('ascii')).toContain('?x  ');
  });

  it('fills a separator line with encodable bytes only', () => {
    const data = buildESCPOSData([{ type: 'line', character: '—' }], { codepage: 'PC437' });
    // em dash transliterates to '-'
    expect([...data].filter((b) => b === 0x2d)).toHaveLength(48);
  });
});

describe('charsPerLine override', () => {
  it('uses an explicit charsPerLine instead of deriving it from paperWidth', () => {
    const data = buildESCPOSData([{ type: 'line' }], { paperWidth: 80, charsPerLine: 42 });
    expect([...data].filter((b) => b === 0x2d)).toHaveLength(42);
  });
});

describe('qrcode model', () => {
  it('selects QR model 2 before setting the size', () => {
    const data = buildESCPOSData([{ type: 'qrcode', value: 'hi' }]);
    expectOrder(data, [
      [0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00],
      [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43],
    ]);
  });
});

describe('partial cut', () => {
  it('uses GS V 1, not the feed-and-full-cut form', () => {
    const data = buildESCPOSData([{ type: 'cut', partial: true }]);
    expect(seqAt(data, 0x1d, 0x56, 0x01)).toBeGreaterThan(0);
    expect(seqAt(data, 0x1d, 0x56, 0x41, 0x00)).toBe(-1);
  });
});

describe('barcode validation', () => {
  const barcode = (type: BarcodeType, value: string): PrintContent[] => [
    { type: 'barcode', value, options: { type } },
  ];

  it('accepts a 12-digit EAN13', () => {
    expect(() => buildESCPOSData(barcode('EAN13', '123456789012'))).not.toThrow();
  });

  it('accepts a 13-digit EAN13', () => {
    expect(() => buildESCPOSData(barcode('EAN13', '1234567890128'))).not.toThrow();
  });

  it('rejects an EAN13 of the wrong length', () => {
    expect(() => buildESCPOSData(barcode('EAN13', '12345'))).toThrow(/EAN13/);
  });

  it('rejects a non-numeric EAN13', () => {
    expect(() => buildESCPOSData(barcode('EAN13', '12345678901A'))).toThrow(/EAN13/);
  });

  it('rejects an EAN8 of the wrong length', () => {
    expect(() => buildESCPOSData(barcode('EAN8', '12345'))).toThrow(/EAN8/);
  });

  it('rejects a UPC-A of the wrong length', () => {
    expect(() => buildESCPOSData(barcode('UPC-A', '123'))).toThrow(/UPC-A/);
  });

  it('rejects an ITF with an odd digit count', () => {
    expect(() => buildESCPOSData(barcode('ITF', '12345'))).toThrow(/even/);
    expect(() => buildESCPOSData(barcode('ITF', '123456'))).not.toThrow();
  });

  it('rejects lowercase in CODE39', () => {
    expect(() => buildESCPOSData(barcode('CODE39', 'abc'))).toThrow(/CODE39/);
    expect(() => buildESCPOSData(barcode('CODE39', 'ABC-123'))).not.toThrow();
  });

  it('requires CODABAR to be delimited by A-D', () => {
    expect(() => buildESCPOSData(barcode('CODABAR', '1234'))).toThrow(/CODABAR/);
    expect(() => buildESCPOSData(barcode('CODABAR', 'A1234B'))).not.toThrow();
  });

  it('rejects non-ASCII in CODE128', () => {
    expect(() => buildESCPOSData(barcode('CODE128', 'Привет'))).toThrow(/CODE128/);
  });

  it('rejects an empty value', () => {
    expect(() => buildESCPOSData(barcode('CODE128', ''))).toThrow();
  });

  it('doubles a literal brace in a CODE128 payload', () => {
    const data = buildESCPOSData(barcode('CODE128', 'a{b'));
    // '{B' selector, then 'a', '{', '{', 'b'
    expectOrder(data, [[0x7b, 0x42], [0x61, 0x7b, 0x7b, 0x62]]);
  });

  it('counts the escaped brace in the length byte', () => {
    const data = buildESCPOSData(barcode('CODE128', 'a{b'));
    const at = data.indexOf(Buffer.from([0x1d, 0x6b, 0x49]));
    // payload is '{B' + 'a{{b' = 6 bytes
    expect(data[at + 3]).toBe(6);
  });
});
