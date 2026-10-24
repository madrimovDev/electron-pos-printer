import { describe, it, expect } from 'vitest';
import { CODEPAGE_TABLES, CODEPAGE_ESC_T, UNDEFINED_CHAR } from './codepage-tables';

const NAMES = Object.keys(CODEPAGE_TABLES) as (keyof typeof CODEPAGE_TABLES)[];

describe('CODEPAGE_TABLES', () => {
  it('covers all nine documented codepages', () => {
    expect(NAMES.sort()).toEqual(
      ['CP1251', 'PC437', 'PC850', 'PC852', 'PC860', 'PC863', 'PC865', 'PC866', 'WPC1252'].sort()
    );
  });

  it.each(NAMES)('%s holds exactly 128 code points', (name) => {
    expect([...CODEPAGE_TABLES[name]]).toHaveLength(128);
  });

  it.each(NAMES)('%s has an ESC t code', (name) => {
    expect(CODEPAGE_ESC_T[name]).toBeTypeOf('number');
  });

  it('leaves undefined positions only where the source mapping does', () => {
    const undefinedCount = (name: keyof typeof CODEPAGE_TABLES) =>
      [...CODEPAGE_TABLES[name]].filter((c) => c === UNDEFINED_CHAR).length;
    expect(undefinedCount('WPC1252')).toBe(5);
    expect(undefinedCount('CP1251')).toBe(1);
    expect(undefinedCount('PC866')).toBe(0);
    expect(undefinedCount('PC437')).toBe(0);
  });

  it('maps Cyrillic to the verified PC866 bytes', () => {
    const table = [...CODEPAGE_TABLES.PC866];
    const byteOf = (ch: string) => 0x80 + table.indexOf(ch);
    expect([...'Привет'].map(byteOf)).toEqual([0x8f, 0xe0, 0xa8, 0xa2, 0xa5, 0xe2]);
  });

  it('maps Cyrillic to the verified CP1251 bytes', () => {
    const table = [...CODEPAGE_TABLES.CP1251];
    const byteOf = (ch: string) => 0x80 + table.indexOf(ch);
    expect([...'Привет'].map(byteOf)).toEqual([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]);
  });

  it('includes Uzbek Cyrillic short-u in PC866 and CP1251', () => {
    expect([...CODEPAGE_TABLES.PC866].indexOf('ў') + 0x80).toBe(0xf7);
    expect([...CODEPAGE_TABLES.CP1251].indexOf('ў') + 0x80).toBe(0xa2);
  });

  it('omits Uzbek Cyrillic ghayn, qaf and ha from every codepage', () => {
    for (const name of NAMES) {
      for (const ch of ['Ғ', 'ғ', 'Қ', 'қ', 'Ҳ', 'ҳ']) {
        expect(CODEPAGE_TABLES[name].includes(ch)).toBe(false);
      }
    }
  });

  it('uses the documented ESC t codes', () => {
    expect(CODEPAGE_ESC_T.PC437).toBe(0);
    expect(CODEPAGE_ESC_T.PC866).toBe(17);
    expect(CODEPAGE_ESC_T.PC852).toBe(18);
    expect(CODEPAGE_ESC_T.WPC1252).toBe(16);
    expect(CODEPAGE_ESC_T.CP1251).toBe(46);
  });
});
