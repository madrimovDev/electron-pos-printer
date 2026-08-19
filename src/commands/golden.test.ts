import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReceipt } from '../utils/receipt-builder';
import { buildESCPOSData } from './escpos-builder';
import { dumpESCPOS } from '../utils/hex-dump';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'receipt-pc866.golden.txt');

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
