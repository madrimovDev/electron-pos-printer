#!/usr/bin/env node
/**
 * Generates src/commands/codepage-tables.ts from the Unicode Consortium's
 * official vendor mapping files.
 *
 * Source: https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/
 * Usage:  node scripts/generate-codepages.mjs
 *
 * The generated file is committed. Never edit it by hand — re-run this script.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = 'https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT';

/**
 * ESC t codes: PC437..PC852 are fixed in the Epson ESC/POS reference.
 * CP1251 is vendor-specific (46 is the most common value); users can override
 * it by passing a numeric `codepage`.
 */
const CODEPAGES = [
  { name: 'PC437',   url: `${BASE}/PC/CP437.TXT`,       escT: 0  },
  { name: 'PC850',   url: `${BASE}/PC/CP850.TXT`,       escT: 2  },
  { name: 'PC860',   url: `${BASE}/PC/CP860.TXT`,       escT: 3  },
  { name: 'PC863',   url: `${BASE}/PC/CP863.TXT`,       escT: 4  },
  { name: 'PC865',   url: `${BASE}/PC/CP865.TXT`,       escT: 5  },
  { name: 'WPC1252', url: `${BASE}/WINDOWS/CP1252.TXT`, escT: 16 },
  { name: 'PC866',   url: `${BASE}/PC/CP866.TXT`,       escT: 17 },
  { name: 'PC852',   url: `${BASE}/PC/CP852.TXT`,       escT: 18 },
  { name: 'CP1251',  url: `${BASE}/WINDOWS/CP1251.TXT`, escT: 46 },
];

const UNDEFINED_CHAR = '�';

/** Parses the 0x80-0xFF range out of a MICSFT mapping file. */
function parseHighRange(text, cpName) {
  const table = new Array(128).fill(UNDEFINED_CHAR);
  for (const rawLine of text.split('\n')) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const [byteHex, uniHex] = line.split(/\s+/);
    if (!byteHex || !uniHex) continue;
    const byte = Number.parseInt(byteHex, 16);
    if (Number.isNaN(byte) || byte < 0x80 || byte > 0xff) continue;
    const cp = Number.parseInt(uniHex, 16);
    if (Number.isNaN(cp)) continue;
    if (cp > 0xffff) throw new Error(`${cpName}: non-BMP code point U+${uniHex}`);
    table[byte - 0x80] = String.fromCharCode(cp);
  }
  const joined = table.join('');
  if ([...joined].length !== 128) {
    throw new Error(`${cpName}: expected 128 code points, got ${[...joined].length}`);
  }
  return joined;
}

/** Emits a table as an all-ASCII \uXXXX escaped TS string literal. */
function toEscapedLiteral(table) {
  let out = '';
  for (const ch of table) {
    out += '\\u' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
  }
  return out;
}

const tables = {};
for (const cp of CODEPAGES) {
  const res = await fetch(cp.url);
  if (!res.ok) throw new Error(`${cp.url} -> HTTP ${res.status}`);
  tables[cp.name] = parseHighRange(await res.text(), cp.name);
  const undef = [...tables[cp.name]].filter((c) => c === UNDEFINED_CHAR).length;
  console.error(`${cp.name}: ok (${undef} undefined position(s))`);
}

const header = `/**
 * AUTO-GENERATED FILE — DO NOT EDIT.
 * Regenerate with: node scripts/generate-codepages.mjs
 *
 * Source: https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/
 *
 * Each table holds exactly 128 code points, mapping printer bytes 0x80-0xFF
 * to Unicode. U+FFFD marks a position the source mapping leaves undefined;
 * such positions are unreachable and must be skipped when building a reverse map.
 */

/** Marks a byte position the source mapping leaves undefined. */
export const UNDEFINED_CHAR = '\\uFFFD';
`;

let body = '\n/** Byte 0x80-0xFF to Unicode, one entry per codepage. */\nexport const CODEPAGE_TABLES = {\n';
for (const cp of CODEPAGES) {
  body += `  ${cp.name}:\n    '${toEscapedLiteral(tables[cp.name])}',\n`;
}
body += '} as const;\n';

body += '\n/** Supported codepage names. */\nexport type Codepage = keyof typeof CODEPAGE_TABLES;\n';

body += '\n/**\n * `ESC t n` selection codes.\n *\n * PC437..PC852 are fixed in the Epson ESC/POS reference. CP1251 is\n * vendor-specific — 46 is the most common value, override with a numeric\n * `codepage` if your printer differs.\n */\nexport const CODEPAGE_ESC_T: Readonly<Record<Codepage, number>> = {\n';
for (const cp of CODEPAGES) body += `  ${cp.name}: ${cp.escT},\n`;
body += '};\n';

const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'commands', 'codepage-tables.ts');
writeFileSync(outPath, header + body, 'utf8');
console.error(`\nwrote ${outPath}`);
