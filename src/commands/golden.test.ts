import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReceipt } from '../utils/receipt-builder';
import { buildESCPOSData } from './escpos-builder';
import { dumpESCPOS } from '../utils/hex-dump';
import { makePNG } from '../images/__testutils__/make-png';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'receipt-pc866.golden.txt');
const LOGO_FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
  'receipt-with-logo.golden.txt'
);

/**
 * A deliberately small, fully deterministic receipt: no dates, no random ids.
 * It exercises Cyrillic text, Uzbek Latin transliteration, a separator line,
 * a two-column table, a QR code, a feed and a partial cut.
 */
function buildFixtureReceipt(): Buffer {
  const receipt = createReceipt(80)
    .textCenter('Магазин', { bold: true })
    .text('Toʻlov: naqd')
    .dashedLine()
    .row('Итого:', '12 000')
    .qrcode('https://example.com', { size: 6 })
    .feed(2)
    .cut(true);

  return buildESCPOSData(receipt.getContents(), { paperWidth: 80, codepage: 'PC866' });
}

describe('golden receipt', () => {
  it('matches the committed dump', () => {
    const actual = dumpESCPOS(buildFixtureReceipt(), { table: 'PC866' });
    const expected = readFileSync(FIXTURE, 'utf8').trimEnd();
    expect(actual).toBe(expected);
  });

  it('encodes the Cyrillic header with the verified PC866 bytes', () => {
    const data = buildFixtureReceipt();
    // Магазин in PC866: М=8C а=A0 г=A3 а=A0 з=A7 и=A8 н=AD (measured, not recalled)
    expect(data.indexOf(Buffer.from([0x8c, 0xa0, 0xa3, 0xa0, 0xa7, 0xa8, 0xad]))).toBeGreaterThan(0);
  });

  it('transliterates the Uzbek turned comma rather than dropping it', () => {
    expect(buildFixtureReceipt().toString('latin1')).toContain("To'lov: naqd");
  });
});

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
