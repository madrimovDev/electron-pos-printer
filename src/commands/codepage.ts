/**
 * Text encoding for ESC/POS printers.
 *
 * Most thermal printers do not understand UTF-8. Text must be transcoded to a
 * single-byte codepage that the printer is switched into with `ESC t n`.
 *
 * The pipeline runs in a fixed order:
 *
 *   text -> NFC normalize -> transliterate -> layout -> encode
 *
 * `normalizeForCodepage()` performs the first two steps. Its output has the
 * property that every character maps to exactly one byte, which is what makes
 * layout arithmetic (column padding, word wrap) correct. Layout must therefore
 * run on normalized text, never on raw input.
 */
import { CODEPAGE_TABLES, CODEPAGE_ESC_T, UNDEFINED_CHAR } from './codepage-tables';
import type { Codepage } from './codepage-tables';

export type { Codepage };
export { CODEPAGE_TABLES, CODEPAGE_ESC_T };

const ESC = 0x1b;
const QUESTION_MARK = 0x3f;

/** All supported codepage names. */
export const CODEPAGES = Object.keys(CODEPAGE_TABLES) as readonly Codepage[];

/**
 * ASCII (or same-script) stand-ins for characters no codepage carries.
 *
 * Uzbek Latin writes `oʻ` and `gʻ` with U+02BB, and Uzbek Cyrillic uses
 * `ғ`, `қ`, `ҳ` — none of which exist in any ESC/POS codepage. Without these
 * substitutions such text would print as question marks.
 *
 * A substitution is only consulted when the character itself is not encodable,
 * and the result is checked against the codepage in turn, so `ғ` becomes `г`
 * on PC866 but `?` on PC437. Exception: the space variants listed in
 * `ALWAYS_TRANSLIT_SPACES` below always use their entry here, even when the
 * character itself is encodable.
 */
export const TRANSLIT: Readonly<Record<string, string>> = {
  // Apostrophes and turned commas (Uzbek Latin, typographic quotes)
  'ʻ': "'",
  'ʼ': "'",
  '‘': "'",
  '’': "'",
  '‚': "'",
  '′': "'",
  // Double quotes
  '“': '"',
  '”': '"',
  '„': '"',
  '″': '"',
  // Dashes
  '–': '-',
  '—': '-',
  '―': '-',
  '−': '-',
  // Ellipsis
  '…': '...',
  // Spaces
  '\u00A0': ' ', // no-break space
  '\u2009': ' ', // thin space
  '\u202F': ' ', // narrow no-break space
  // Bullets
  '•': '*',
  // Uzbek Cyrillic letters missing from every codepage
  'Ғ': 'Г',
  'ғ': 'г',
  'Қ': 'К',
  'қ': 'к',
  'Ҳ': 'Х',
  'ҳ': 'х',
};

/**
 * Space variants that must normalize to a plain ASCII space even when the
 * codepage can encode them natively.
 *
 * NBSP (no-break space) is present at 0xFF/0xA0 in every one of the nine
 * tables (it is a standard OEM/Windows codepage glyph), so the general
 * "only translate what isn't encodable" rule below would leave it untouched.
 * Layout code needs a uniform ASCII space to reason about breakable
 * whitespace, so these three are translated unconditionally, ahead of the
 * encodability check.
 */
const ALWAYS_TRANSLIT_SPACES = new Set(['\u00A0', '\u2009', '\u202F']);

const reverseCache = new Map<Codepage, Map<string, number>>();

/** Builds (and caches) the Unicode-to-byte map for a codepage. */
function reverseMap(codepage: Codepage): Map<string, number> {
  let map = reverseCache.get(codepage);
  if (map) return map;

  map = new Map<string, number>();
  let offset = 0;
  for (const char of CODEPAGE_TABLES[codepage]) {
    // Undefined positions are unreachable — never map to them.
    if (char !== UNDEFINED_CHAR && !map.has(char)) {
      map.set(char, 0x80 + offset);
    }
    offset++;
  }
  reverseCache.set(codepage, map);
  return map;
}

/** Whether a single character can be represented in the given codepage. */
export function isEncodable(char: string, codepage: Codepage): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  if (code < 0x80) return true;
  return reverseMap(codepage).has(char);
}

/**
 * Applies NFC normalization and transliteration for the target codepage.
 *
 * Every character of the result is encodable in `codepage` (unencodable input
 * becomes `?`), so `result.length` equals the number of bytes it will occupy.
 * Idempotent.
 */
export function normalizeForCodepage(text: string, codepage: Codepage): string {
  let out = '';
  for (const char of text.normalize('NFC')) {
    if (ALWAYS_TRANSLIT_SPACES.has(char)) {
      out += TRANSLIT[char];
      continue;
    }
    if (isEncodable(char, codepage)) {
      out += char;
      continue;
    }
    const replacement = TRANSLIT[char];
    if (replacement === undefined) {
      out += '?';
      continue;
    }
    for (const replacementChar of replacement) {
      out += isEncodable(replacementChar, codepage) ? replacementChar : '?';
    }
  }
  return out;
}

/**
 * Encodes text into printer bytes for the given codepage.
 *
 * Normalization is applied internally, so callers that already normalized (to
 * lay out columns, say) can pass the normalized string safely.
 */
export function encodeText(text: string, codepage: Codepage): Buffer {
  const normalized = normalizeForCodepage(text, codepage);
  const map = reverseMap(codepage);
  const bytes: number[] = [];
  for (const char of normalized) {
    const code = char.codePointAt(0);
    if (code !== undefined && code < 0x80) {
      bytes.push(code);
    } else {
      bytes.push(map.get(char) ?? QUESTION_MARK);
    }
  }
  return Buffer.from(bytes);
}

/** `ESC t n` — switches the printer's character table. */
export function selectCodepage(escT: number): Buffer {
  return Buffer.from([ESC, 0x74, Math.min(0xff, Math.max(0, Math.trunc(escT)))]);
}

/**
 * Resolves the `codepage` / `codepageTable` pair into the `ESC t` value to send
 * and the table to encode with.
 *
 * A named codepage supplies both and `codepageTable` is ignored. A numeric
 * codepage is sent verbatim — for printers whose vendor uses a non-standard
 * `ESC t` value — and `codepageTable` says how to encode the bytes.
 */
export function resolveCodepage(
  codepage: Codepage | number = 'PC437',
  codepageTable: Codepage = 'PC437'
): { escT: number; table: Codepage } {
  if (typeof codepage === 'number') {
    return { escT: codepage, table: codepageTable };
  }
  return { escT: CODEPAGE_ESC_T[codepage], table: codepage };
}
