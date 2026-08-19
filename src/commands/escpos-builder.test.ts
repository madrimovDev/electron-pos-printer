import { describe, it, expect } from 'vitest';
import { buildESCPOSData, ESCPOSCommands } from './escpos-builder';
import type { PrintContent, PaperWidth } from '../types';

/**
 * Wrapper around buildESCPOSData so the signature change in the next task
 * touches one line instead of every call site.
 */
const build = (contents: PrintContent[], paperWidth: PaperWidth = 80): Buffer =>
  buildESCPOSData(contents, paperWidth);

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

describe('image content (interim behaviour)', () => {
  it('currently prints a placeholder — replaced in a later task', () => {
    const data = build([{ type: 'image', source: 'logo.png' }]);
    expect(data.toString('ascii')).toContain('[IMAGE]');
  });
});

describe('ESCPOSCommands (removed in a later task)', () => {
  it('exposes INIT as raw bytes', () => {
    expect([...ESCPOSCommands.INIT]).toEqual([0x1b, 0x40]);
  });
});
