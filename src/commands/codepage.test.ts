import { describe, it, expect } from 'vitest';
import {
  CODEPAGES,
  isEncodable,
  normalizeForCodepage,
  encodeText,
  selectCodepage,
  resolveCodepage,
} from './codepage';

const hex = (b: Buffer) => [...b].map((n) => n.toString(16).toUpperCase().padStart(2, '0')).join(' ');

describe('CODEPAGES', () => {
  it('lists all nine codepages', () => {
    expect(CODEPAGES).toHaveLength(9);
    expect(CODEPAGES).toContain('PC866');
  });
});

describe('isEncodable', () => {
  it('accepts ASCII in every codepage', () => {
    for (const cp of CODEPAGES) {
      expect(isEncodable('A', cp)).toBe(true);
      expect(isEncodable(' ', cp)).toBe(true);
    }
  });

  it('accepts Cyrillic in PC866 but not in PC437', () => {
    expect(isEncodable('П', 'PC866')).toBe(true);
    expect(isEncodable('П', 'PC437')).toBe(false);
  });

  it('accepts Uzbek Cyrillic short-u in PC866', () => {
    expect(isEncodable('ў', 'PC866')).toBe(true);
  });

  it('rejects Uzbek Cyrillic ghayn everywhere', () => {
    for (const cp of CODEPAGES) expect(isEncodable('ғ', cp)).toBe(false);
  });
});

describe('normalizeForCodepage', () => {
  it('leaves plain ASCII untouched', () => {
    expect(normalizeForCodepage('Hello, world!', 'PC437')).toBe('Hello, world!');
  });

  it('applies NFC so decomposed Cyrillic survives', () => {
    const decomposed = '\u0438\u0306'; // и + U+0306 combining breve
    expect(normalizeForCodepage(decomposed, 'PC866')).toBe('\u0439');
  });

  it('turns Uzbek Latin turned-comma into an ASCII apostrophe', () => {
    expect(normalizeForCodepage('Toʻxta gʻoz', 'PC437')).toBe("To'xta g'oz");
  });

  it('transliterates typographic punctuation', () => {
    expect(normalizeForCodepage('“hi”', 'PC437')).toBe('"hi"');
    expect(normalizeForCodepage('a–b—c', 'PC437')).toBe('a-b-c');
    expect(normalizeForCodepage('a\u00a0b', 'PC437')).toBe('a b');
  });

  it('expands ellipsis to three dots', () => {
    expect(normalizeForCodepage('wait…', 'PC437')).toBe('wait...');
  });

  it('transliterates Uzbek Cyrillic letters absent from every codepage', () => {
    expect(normalizeForCodepage('ғқҳ', 'PC866')).toBe('гкх');
    expect(normalizeForCodepage('ҒҚҲ', 'PC866')).toBe('ГКХ');
  });

  it('keeps Cyrillic short-u as-is in PC866 instead of transliterating', () => {
    expect(normalizeForCodepage('ў', 'PC866')).toBe('ў');
  });

  it('falls back to a question mark for anything else', () => {
    expect(normalizeForCodepage('日本', 'PC437')).toBe('??');
  });

  it('falls back to a question mark when the translit result is also unencodable', () => {
    // ghayn transliterates to Cyrillic г, which PC437 cannot encode either
    expect(normalizeForCodepage('ғ', 'PC437')).toBe('?');
  });

  it('replaces astral code points with a single question mark', () => {
    expect(normalizeForCodepage('\u{1F600}', 'PC437')).toBe('?');
  });

  it('is idempotent', () => {
    const once = normalizeForCodepage('Toʻxta … ғ', 'PC866');
    expect(normalizeForCodepage(once, 'PC866')).toBe(once);
  });

  it('produces a string whose length equals the encoded byte count', () => {
    const samples = ['Hello', 'Привет', 'Toʻxta …', '日本ғ'];
    for (const s of samples) {
      const normalized = normalizeForCodepage(s, 'PC866');
      expect(encodeText(normalized, 'PC866')).toHaveLength(normalized.length);
    }
  });
});

describe('encodeText', () => {
  it('encodes ASCII as-is', () => {
    expect(hex(encodeText('AB', 'PC437'))).toBe('41 42');
  });

  it('encodes Cyrillic with the verified PC866 bytes', () => {
    expect(hex(encodeText('Привет', 'PC866'))).toBe('8F E0 A8 A2 A5 E2');
  });

  it('encodes the same string differently in CP1251', () => {
    expect(hex(encodeText('Привет', 'CP1251'))).toBe('CF F0 E8 E2 E5 F2');
  });

  it('normalizes before encoding', () => {
    expect(hex(encodeText('Toʻxta', 'PC437'))).toBe('54 6F 27 78 74 61');
  });

  it('encodes unmappable characters as 0x3F', () => {
    expect(hex(encodeText('日', 'PC437'))).toBe('3F');
  });
});

describe('selectCodepage', () => {
  it('emits ESC t n', () => {
    expect(hex(selectCodepage(17))).toBe('1B 74 11');
    expect(hex(selectCodepage(0))).toBe('1B 74 00');
  });

  it('clamps out-of-range values into a single byte', () => {
    expect(hex(selectCodepage(300))).toBe('1B 74 FF');
    expect(hex(selectCodepage(-5))).toBe('1B 74 00');
  });
});

describe('resolveCodepage', () => {
  it('defaults to PC437', () => {
    expect(resolveCodepage()).toEqual({ escT: 0, table: 'PC437' });
  });

  it('resolves a named codepage to its ESC t code and its own table', () => {
    expect(resolveCodepage('PC866')).toEqual({ escT: 17, table: 'PC866' });
  });

  it('uses a numeric codepage verbatim and takes the table from codepageTable', () => {
    expect(resolveCodepage(73, 'CP1251')).toEqual({ escT: 73, table: 'CP1251' });
  });

  it('falls back to the PC437 table when a numeric codepage has no table given', () => {
    expect(resolveCodepage(73)).toEqual({ escT: 73, table: 'PC437' });
  });

  it('ignores codepageTable when the codepage is named', () => {
    expect(resolveCodepage('PC866', 'CP1251')).toEqual({ escT: 17, table: 'PC866' });
  });
});
