import { describe, it, expect } from 'vitest';
import { dumpESCPOS } from './hex-dump';
import { Commands } from '../commands/esc-pos';
import { encodeText, selectCodepage } from '../commands/codepage';

/** Returns the dump line whose text contains `needle`. */
const lineWith = (dump: string, needle: string): string =>
  dump.split('\n').find((l) => l.includes(needle)) ?? '';

describe('dumpESCPOS', () => {
  it('returns an empty string for empty input', () => {
    expect(dumpESCPOS(Buffer.alloc(0))).toBe('');
  });

  it('annotates the init command with its offset', () => {
    const dump = dumpESCPOS(Commands.INIT);
    expect(dump).toContain('0000');
    expect(dump).toContain('1B 40');
    expect(dump).toContain('ESC @');
    expect(dump).toContain('Initialize printer');
  });

  it('names the codepage behind an ESC t code', () => {
    const dump = dumpESCPOS(selectCodepage(17));
    expect(dump).toContain('ESC t 17');
    expect(dump).toContain('PC866');
  });

  it('marks an unknown ESC t code as vendor-specific', () => {
    expect(dumpESCPOS(selectCodepage(200))).toContain('vendor-specific');
  });

  it('names the alignment', () => {
    expect(dumpESCPOS(Commands.ALIGN.CENTER)).toContain('Align center');
    expect(dumpESCPOS(Commands.ALIGN.RIGHT)).toContain('Align right');
  });

  it('distinguishes a partial cut from a full cut', () => {
    expect(dumpESCPOS(Commands.PAPER.CUT_PARTIAL)).toContain('Partial cut');
    expect(dumpESCPOS(Commands.PAPER.CUT_FULL)).toContain('Full cut');
    expect(dumpESCPOS(Commands.PAPER.CUT_FEED_FULL(3))).toContain('full cut');
    expect(dumpESCPOS(Commands.PAPER.CUT_FEED_PARTIAL(3))).toContain('partial cut');
  });

  it('decodes an ASCII text run as a quoted string', () => {
    const dump = dumpESCPOS(Buffer.from('Hello', 'ascii'));
    expect(dump).toContain('"Hello"');
  });

  it('decodes a high-byte text run through the given table', () => {
    const dump = dumpESCPOS(encodeText('Привет', 'PC866'), { table: 'PC866' });
    expect(dump).toContain('"Привет"');
    expect(dump).toContain('PC866');
  });

  it('decodes the same bytes differently under another table', () => {
    const dump = dumpESCPOS(encodeText('Привет', 'PC866'), { table: 'PC437' });
    expect(dump).not.toContain('"Привет"');
  });

  it('advances past a barcode payload instead of decoding it as text', () => {
    const data = Commands.BARCODE.PRINT(0x49, Buffer.from('{BABC', 'ascii'));
    const dump = dumpESCPOS(data);
    expect(dump).toContain('GS k 73 5');
    expect(dump).toContain('Print barcode');
    // one command line only — the payload must not appear as a separate text run
    expect(dump.split('\n')).toHaveLength(1);
  });

  it('advances past a QR store payload', () => {
    const dump = dumpESCPOS(Commands.QRCODE.STORE(Buffer.from('hi', 'utf8')));
    expect(dump).toContain('Store QR data');
    expect(dump.split('\n')).toHaveLength(1);
  });

  it('reports raster image dimensions', () => {
    const dump = dumpESCPOS(Commands.IMAGE.RASTER(16, 2, Buffer.alloc(4)));
    expect(dump).toContain('Raster image');
    expect(dump).toContain('16x2');
  });

  it('truncates long hex runs and reports the full length', () => {
    const data = Commands.BARCODE.PRINT(0x49, Buffer.alloc(40, 0x41));
    const line = lineWith(dumpESCPOS(data), 'Print barcode');
    expect(line).toContain('...');
    expect(line).toContain('44 bytes');
  });

  it('shows an unknown byte as raw hex', () => {
    const dump = dumpESCPOS(Buffer.from([0x1b, 0x7a, 0x01]));
    expect(dump).toContain('1B');
    expect(dump).toContain('unknown');
  });

  it('keeps offsets monotonic across a mixed stream', () => {
    const data = Buffer.concat([
      Commands.INIT,
      selectCodepage(17),
      Buffer.from('AB', 'ascii'),
      Commands.PAPER.FEED_1,
    ]);
    const offsets = dumpESCPOS(data, { table: 'PC866' })
      .split('\n')
      .map((l) => Number.parseInt(l.slice(0, 4), 16));
    expect(offsets).toEqual([0, 2, 5, 7]);
  });
});
