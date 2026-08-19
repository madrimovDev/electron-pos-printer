# Raw ESC/POS yadrosi — implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@madrimov/electron-pos-printer` v2.0.0 — raw ESC/POS chop etishni asosiy yoʻlga aylantirish, zero-dependency codepage kodlash qatlamini qoʻshish, komanda jadvalini birlashtirish va 6 ta bug fixni bajarish.

**Architecture:** `src/commands/esc-pos.ts` yagona komanda manbasi boʻladi (`Buffer` qaytaradi). Yangi `src/commands/codepage.ts` matnni maqsadli codepage'ga aylantiradi; jadvallar `scripts/generate-codepages.mjs` orqali Unicode Consortium'ning rasmiy mapping fayllaridan generatsiya qilinadi. Kodlash quvuri qatʻiy tartibda: NFC normalize → translit → layout → encode. IPC handler `mode` maydoniga qarab raw yoki HTML shoxiga ketadi.

**Tech Stack:** TypeScript 5.7 (strict), vitest 2, tsup 8, Node ≥18, Electron ≥28 (peer). Runtime dependency **yoʻq** va qoʻshilmaydi.

**Spec:** `docs/superpowers/specs/2026-08-19-raw-escpos-core-design.md`

## Global Constraints

- **Zero runtime dependency.** `package.json` ning `dependencies` boʻlimi boʻsh qoladi. Faqat `devDependencies` va `peerDependencies` oʻzgarishi mumkin.
- **Versiya:** `2.0.0`. Buzuvchi oʻzgarishlarga ruxsat, lekin har biri `CHANGELOG.md` va README migratsiya jadvalida qayd etiladi.
- **TDD majburiy.** Har bir xatti-harakat oʻzgarishi uchun avval yiqiladigan test yoziladi, keyin implementatsiya.
- **Darvoza:** har bir task oxirida `npm run test:run` va `npm run typecheck` toza oʻtishi shart.
- **`tsconfig.json` `**/*.test.ts` ni exclude qiladi** — yaʻni `npm run typecheck` testlarni tekshirmaydi. Testlardagi tip xatolari faqat vitest ishga tushganda koʻrinadi. Buni oʻzgartirmang.
- **`noUnusedLocals` va `noUnusedParameters` yoniq** — ishlatilmagan import yoki parametr build'ni yiqitadi.
- **Codepage jadvallari qoʻlda yozilmaydi.** Faqat `scripts/generate-codepages.mjs` orqali generatsiya qilinadi.
- **Codepage roʻyxati (9 ta) va `ESC t` kodlari:** `PC437=0`, `PC850=2`, `PC860=3`, `PC863=4`, `PC865=5`, `WPC1252=16`, `PC866=17`, `PC852=18`, `CP1251=46`. Birinchi sakkiztasi Epson referenceida qatʻiy; `CP1251=46` vendor'ga bogʻliq va foydalanuvchi `codepage: <raqam>` bilan bekor qilishi mumkin.
- **Default'lar:** `mode = 'raw'`, `codepage = 'PC437'`, `codepageTable = 'PC437'`.
- **Barcha foydalanuvchiga koʻrinadigan matn (README, CHANGELOG, JSDoc, xato xabarlari) ingliz tilida** — paket xalqaro. Rejaning oʻzi va commit tanasi oʻzbekcha izohlarga ega boʻlishi mumkin, lekin **kod ichidagi izohlar va xato matnlari ingliz tilida**.

## Tekshirilgan faktlar (implementatsiya vaqtida qayta tekshirish shart emas)

Bu qiymatlar reja yozilishidan oldin haqiqiy mapping fayllaridan oʻlchangan:

| Tekshiruv | Natija |
|---|---|
| `Привет` → PC866 | `8F E0 A8 A2 A5 E2` |
| `Привет` → CP1251 | `CF F0 E8 E2 E5 F2` |
| `ў` U+045E → PC866 | `0xF7` — **mavjud, translit kerak emas** |
| `ў` U+045E → CP1251 | `0xA2` — **mavjud** |
| `Ў` U+040E → PC866 / CP1251 | `0xF6` / `0xA1` — mavjud |
| `ғ Ғ қ Қ ҳ Ҳ` (U+0492/0493/049A/049B/04B2/04B3) | **hech bir codepage'da yoʻq** — translit shart |
| Mapping fayl formati | `0xNN\t0xUUUU\t#NAME`, `#` dan keyin izoh |
| Aniqlanmagan pozitsiyalar | WPC1252 da 5 ta, CP1251 da 1 ta, qolganlarda 0 ta |

## Fayl strukturasi

### Yangi fayllar

| Fayl | Javobgarligi |
|---|---|
| `scripts/generate-codepages.mjs` | Unicode mapping fayllarini yuklab olib `codepage-tables.ts` ni generatsiya qiladi. Repo'da qoladi, build'ga kirmaydi |
| `src/commands/codepage-tables.ts` | **Generatsiya qilingan.** 9 codepage uchun 128 belgili jadvallar, `ESC t` kodlari, `Codepage` tipi. Qoʻlda tahrirlanmaydi |
| `src/commands/codepage.ts` | Kodlash quvuri: `isEncodable`, `normalizeForCodepage`, `encodeText`, `selectCodepage`, `resolveCodepage`, `TRANSLIT` |
| `src/commands/codepage.test.ts` | Kodlash quvuri testlari |
| `src/commands/codepage-tables.test.ts` | Generatsiya qilingan jadvallarning butunligi |
| `src/commands/esc-pos.test.ts` | Komanda konstantalari va bug fixlar |
| `src/commands/__fixtures__/receipt-pc866.golden.txt` | Toʻliq chekning izohlangan hex dump'i |
| `src/utils/hex-dump.ts` | `dumpESCPOS()` — baytlarni oʻqiladigan koʻrinishga aylantiradi |
| `src/utils/hex-dump.test.ts` | |
| `src/printer/raw-printer.test.ts` | PowerShell env uzatilishi, Unix argv |
| `src/electron/main.test.ts` | IPC handler'ning raw/html shoxlanishi |
| `CHANGELOG.md` | |

### Oʻzgartiriladigan fayllar

| Fayl | Nima oʻzgaradi |
|---|---|
| `src/commands/esc-pos.ts` | `Buffer` shakli; `BARCODE.PRINT`, `IMAGE.RASTER`, `CUT_PARTIAL` fixlari; `CHARSET` va `encodeText` olib tashlanadi |
| `src/commands/escpos-builder.ts` | Lokal `CMD` olib tashlanadi; codepage quvuri; yangi imzo; barcode validatsiyasi; `image` jimgina oʻtkaziladi |
| `src/commands/escpos-builder.test.ts` | Kuchaytiriladi va kengaytiriladi |
| `src/commands/index.ts` | Eksportlar |
| `src/types/index.ts` | `PrintMode`, `PrinterConfig.mode/codepage/codepageTable`, `PrintResult.mode`, `DEFAULTS` |
| `src/electron/main.ts` | IPC raw/html shoxlanishi; `printRaw()` qoʻshiladi |
| `src/printer/raw-printer.ts` | PS skript konstantasi + `env`; async fayl yozish |
| `src/printer/printer-manager.ts` | Sync `getPrinters()` olib tashlanadi |
| `src/printer/index.ts`, `src/utils/index.ts`, `src/index.ts` | Eksportlar |
| `README.md`, `CLAUDE.md`, `package.json` | Hujjatlar va versiya |
| `example/main.js`, `example/preload.js`, `example/index.html`, `example/package.json` | Kutubxona nusxasi oʻchiriladi, paket import qilinadi |

### Bilib turib qoldirilgan (bu rejaning qamrovidan tashqari)

- `npm run lint` skripti mavjud, lekin `eslint.config.*` fayli yoʻq — lint ishlamaydi. Spec bu masalani qamramaydi; alohida ish sifatida qoldiriladi.
- `formatDate()` global boʻlmagan `replace` ishlatadi — takrorlanuvchi token (`'dd.MM.yyyy dd'`) faqat birinchi marta almashadi. Spec qamramaydi.
- Rasm chop etish, cash drawer, beeper — **2-bosqich**. TCP/IP, status, queue — **3-bosqich**.

---

### Task 1: Muhitni tiklash va boshlangʻich holatni qayd etish

`node_modules` oʻrnatilmagan — hech qanday test hozir ishlamaydi. Bu task keyingi barcha tasklar uchun poydevor va oʻzgarishlardan oldingi holatni yozib qoʻyadi.

**Files:**
- Modify: yoʻq (faqat oʻrnatish va qayd)

**Interfaces:**
- Consumes: yoʻq
- Produces: ishlaydigan `npm run test:run` va `npm run typecheck`

- [ ] **Step 1: Bogʻliqliklarni oʻrnatish**

```bash
npm install
```

- [ ] **Step 2: Boshlangʻich test holatini qayd etish**

```bash
npm run test:run 2>&1 | tail -20
```

Kutilgan: 3 test fayl (`format.test.ts`, `receipt-builder.test.ts`, `escpos-builder.test.ts`) oʻtadi. Agar biror test yiqilsa — **toʻxtang va xabar bering**: bu rejadagi hech bir oʻzgarish sababli emas, mavjud holatning oʻzida muammo bor.

- [ ] **Step 3: Boshlangʻich typecheck holatini qayd etish**

```bash
npm run typecheck
```

Kutilgan: xatosiz.

- [ ] **Step 4: Node versiyasini tekshirish**

```bash
node --version
```

Kutilgan: v18 yoki yuqori (generator skript global `fetch` ishlatadi, u v18+ da mavjud).

- [ ] **Step 5: Commit qilmaslik**

Bu taskda commit yoʻq — hech qanday fayl oʻzgarmadi. Keyingi taskga oʻting.

---

### Task 2: Codepage jadvallarini generatsiya qilish

**Files:**
- Create: `scripts/generate-codepages.mjs`
- Create: `src/commands/codepage-tables.ts` (generatsiya qilingan, commit qilinadi)
- Test: `src/commands/codepage-tables.test.ts`

**Interfaces:**
- Consumes: yoʻq
- Produces:
  - `CODEPAGE_TABLES: Readonly<Record<Codepage, string>>` — har biri aynan 128 belgi (bayt `0x80`–`0xFF`)
  - `CODEPAGE_ESC_T: Readonly<Record<Codepage, number>>`
  - `UNDEFINED_CHAR: '�'`
  - `type Codepage = 'PC437' | 'PC850' | 'PC860' | 'PC863' | 'PC865' | 'WPC1252' | 'PC866' | 'PC852' | 'CP1251'`

- [ ] **Step 1: Generator skriptni yozish**

`scripts/generate-codepages.mjs`:

```js
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
```

- [ ] **Step 2: Generatorni ishga tushirish**

```bash
node scripts/generate-codepages.mjs
```

Kutilgan stderr chiqishi (aynan shu sonlar — ular oʻlchangan):

```
PC437: ok (0 undefined position(s))
PC850: ok (0 undefined position(s))
PC860: ok (0 undefined position(s))
PC863: ok (0 undefined position(s))
PC865: ok (0 undefined position(s))
WPC1252: ok (5 undefined position(s))
PC866: ok (0 undefined position(s))
PC852: ok (0 undefined position(s))
CP1251: ok (1 undefined position(s))
```

Agar sonlar farq qilsa — **toʻxtang**: manba fayllar oʻzgargan yoki tarmoq javobida muammo bor.

- [ ] **Step 3: Testni yozish**

`src/commands/codepage-tables.test.ts`:

```ts
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
```

- [ ] **Step 4: Testni ishga tushirish**

```bash
npx vitest run src/commands/codepage-tables.test.ts
```

Kutilgan: barcha testlar PASS. Bu yerda test avval yiqilmaydi — generatsiya qilingan fayl testdan oldin mavjud, chunki test **generatorni** tekshiradi, yangi xatti-harakatni emas.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Kutilgan: xatosiz.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-codepages.mjs src/commands/codepage-tables.ts src/commands/codepage-tables.test.ts
git commit -m "feat(codepage): generate codepage tables from Unicode mapping files

Tables are generated from unicode.org MICSFT vendor mappings rather than
written by hand, so a single-character error cannot hide in both the table
and the test that checks it.

Covers PC437, PC850, PC852, PC860, PC863, PC865, PC866, WPC1252, CP1251."
```

---

### Task 3: Kodlash quvuri — `codepage.ts`

Spec §4 ning yuragi. Quvur tartibi: NFC normalize → translit → (layout, keyinroq) → encode.

**Files:**
- Create: `src/commands/codepage.ts`
- Test: `src/commands/codepage.test.ts`

**Interfaces:**
- Consumes: `CODEPAGE_TABLES`, `CODEPAGE_ESC_T`, `UNDEFINED_CHAR`, `Codepage` (Task 2)
- Produces:
  - `type Codepage` (re-export)
  - `const CODEPAGES: readonly Codepage[]`
  - `const TRANSLIT: Readonly<Record<string, string>>`
  - `function isEncodable(char: string, codepage: Codepage): boolean`
  - `function normalizeForCodepage(text: string, codepage: Codepage): string`
  - `function encodeText(text: string, codepage: Codepage): Buffer`
  - `function selectCodepage(escT: number): Buffer`
  - `function resolveCodepage(codepage?: Codepage | number, codepageTable?: Codepage): { escT: number; table: Codepage }`

**Muhim invariant:** `normalizeForCodepage()` dan chiqqan satrning **har bir belgisi aynan bitta baytga** aylanadi. Shu sababli layout (padding, wrap) hisoblari faqat shu funksiyadan **keyin** bajarilishi mumkin. `normalizeForCodepage` idempotent — ikki marta chaqirish natijani oʻzgartirmaydi.

- [ ] **Step 1: Failing testni yozish**

`src/commands/codepage.test.ts`:

```ts
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
    expect(normalizeForCodepage('a\u00A0b', 'PC437')).toBe('a b');
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
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini tasdiqlash**

```bash
npx vitest run src/commands/codepage.test.ts
```

Kutilgan: FAIL — `Failed to resolve import "./codepage"`.

- [ ] **Step 3: Implementatsiya**

`src/commands/codepage.ts`:

```ts
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
 * on PC866 but `?` on PC437.
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
```

- [ ] **Step 4: Testni ishga tushirib oʻtishini tasdiqlash**

```bash
npx vitest run src/commands/codepage.test.ts
```

Kutilgan: barcha testlar PASS.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/commands/codepage.ts src/commands/codepage.test.ts
git commit -m "feat(codepage): add encoding pipeline with translit fallback

Pipeline order is NFC normalize -> transliterate -> (layout) -> encode.
normalizeForCodepage() guarantees one character equals one byte, which is
what makes column padding correct; layout must run on its output.

Uzbek Latin oʻ/gʻ (U+02BB) and Uzbek Cyrillic ғ/қ/ҳ exist in no ESC/POS
codepage, so they transliterate rather than printing as question marks."
```

---

### Task 4: Tiplar — `mode`, `codepage`, `codepageTable`

**Files:**
- Modify: `src/types/index.ts`

**Interfaces:**
- Consumes: `Codepage` (Task 2, `./codepage-tables` dan)
- Produces:
  - `type PrintMode = 'raw' | 'html'`
  - `PrinterConfig.mode?: PrintMode`
  - `PrinterConfig.codepage?: Codepage | number`
  - `PrinterConfig.codepageTable?: Codepage`
  - `PrintResult.mode?: PrintMode`
  - `DEFAULTS.MODE`, `DEFAULTS.CODEPAGE`, `DEFAULTS.CODEPAGE_TABLE`

Bu task sof tip qoʻshimchasi — yangi ishlash xatti-harakati yoʻq, shuning uchun alohida test yozilmaydi; toʻgʻriligini `npm run typecheck` va keyingi tasklarning testlari tasdiqlaydi.

- [ ] **Step 1: `PrintMode` tipini va importni qoʻshish**

`src/types/index.ts` faylining eng boshiga:

```ts
import type { Codepage } from '../commands/codepage-tables';

export type { Codepage };

/**
 * Which print path to use.
 *
 * - `raw`: build ESC/POS bytes and send them straight to the printer. Default.
 * - `html`: render HTML in a hidden window and use Electron's print API.
 */
export type PrintMode = 'raw' | 'html';
```

**Diqqat:** `types/index.ts` → `commands/codepage-tables.ts` yoʻnalishida import qilinadi, teskarisi emas. `codepage-tables.ts` hech narsani import qilmaydi, shuning uchun sikl yuzaga kelmaydi. `codepage.ts` dan emas, `codepage-tables.ts` dan import qilinishi ham shu sababdan.

- [ ] **Step 2: `PrinterConfig` ga maydonlarni qoʻshish**

`PrinterConfig` interfeysida `printerName` dan keyin quyidagilarni qoʻshing va mavjud maydonlarning JSDoc'iga rejim belgisini yozing:

```ts
export interface PrinterConfig {
  /** Printer name (as returned by the system). Used in both modes. */
  printerName: string;
  /** Paper width in mm (58 or 80). Used in both modes. */
  paperWidth: PaperWidth;
  /** Characters per line. Defaults from paperWidth. Used in both modes. */
  charsPerLine?: number;

  /** Which print path to use. Defaults to `'raw'`. */
  mode?: PrintMode;
  /**
   * Character table for raw mode. A name selects both the `ESC t` code and the
   * encoding table; a number is sent as `ESC t <n>` verbatim, for printers whose
   * vendor uses a non-standard value. Defaults to `'PC437'`. Ignored in html mode.
   */
  codepage?: Codepage | number;
  /**
   * Encoding table to use when `codepage` is a number. Ignored otherwise and in
   * html mode. Defaults to `'PC437'`.
   */
  codepageTable?: Codepage;

  /** html mode only — ignored in raw mode. Enable silent printing (no dialog). */
  silent?: boolean;
  /** html mode only — ignored in raw mode. Show the render window. */
  preview?: boolean;
  /** html mode only — ignored in raw mode. Page margins. */
  margin?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  /** html mode only — ignored in raw mode. Custom page size. */
  pageSize?: {
    width: number;
    height?: number;
  };
}
```

- [ ] **Step 3: `PrintResult` ga `mode` qoʻshish**

```ts
export interface PrintResult {
  success: boolean;
  jobId: string;
  error?: string;
  /**
   * Which path produced this result. Set by the IPC handler and by `print()` /
   * `printRaw()`; absent when `printRawData()` or `printHTML()` is called
   * directly, since those do not know the mode.
   */
  mode?: PrintMode;
}
```

- [ ] **Step 4: `DEFAULTS` ga qiymatlarni qoʻshish**

`DEFAULTS` obyektida `PAPER_WIDTH` dan keyin:

```ts
  MODE: 'raw' as PrintMode,
  CODEPAGE: 'PC437' as Codepage,
  CODEPAGE_TABLE: 'PC437' as Codepage,
```

- [ ] **Step 5: Typecheck va mavjud testlar**

```bash
npm run typecheck && npm run test:run
```

Kutilgan: ikkisi ham toza. Barcha yangi maydonlar opsional, shuning uchun mavjud kod buzilmaydi.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add mode, codepage and codepageTable to PrinterConfig

Also documents which PrinterConfig fields apply to which mode — silent,
preview, margin and pageSize are html-mode only and are ignored in raw mode,
which was previously undocumented and a source of confusion.

Codepage is imported from commands/codepage-tables (which imports nothing)
rather than commands/codepage, to keep the dependency acyclic."
```

---

### Task 5: `esc-pos.ts` — yagona manba va komanda bug fixlari

Spec §6.1–§6.4. Bu task `esc-pos.ts` ni `Buffer` shakliga oʻtkazadi va **toʻrtta** ziddiyat/bugni tuzatadi. Toʻrtinchisi reja yozilishida topilgan va spec'da yoʻq:

| # | Muammo | Toʻgʻri qiymat |
|---|---|---|
| 1 | `BARCODE.PRINT` NUL bilan tugash shaklini `m=65–73` bilan ishlatadi | `GS k m n d1…dn` (uzunlik bayti) |
| 2 | `IMAGE.RASTER` da `width/8` butun songa yaxlitlanmaydi | `Math.ceil(width / 8)` |
| 3 | `CUT_PARTIAL` `escpos-builder.ts` da `GS V 65 0` — bu surib **toʻliq** kesish | `GS V 1` |
| 4 | **Yangi:** `QRCODE.MODEL` model raqamini xom `2` sifatida yuboradi | `0x32` (`'2'` belgisi) — `escpos-builder.ts` da toʻgʻri edi |

**Files:**
- Modify: `src/commands/esc-pos.ts`
- Test: `src/commands/esc-pos.test.ts`

**Interfaces:**
- Consumes: `type BarcodeType` (`../types`, faqat tip — runtime sikl yaratmaydi)
- Produces:
  - `Commands` — barcha qiymatlar `Buffer` yoki `Buffer` qaytaruvchi funksiya
  - `Commands.BARCODE.PRINT(type: number, data: Buffer): Buffer`
  - `Commands.QRCODE.STORE(data: Buffer): Buffer`
  - `Commands.IMAGE.RASTER(width: number, height: number, data: Buffer): Buffer`
  - `Commands.PAPER.CUT_PARTIAL`, `CUT_FULL`, `CUT_FEED_FULL(n)`, `CUT_FEED_PARTIAL(n)`
  - `toBuffer(commands: number[]): Buffer`, `concat(...commands: (number[] | Buffer)[]): Buffer`
  - `ESC`, `GS`, `LF`, `NUL`, `CR`, `HT`, `FF`, `FS`, `DLE` konstantalari
- **Olib tashlanadi:** `Commands.CHARSET` (uning oʻrniga `selectCodepage()`), `encodeText()` (nomi `codepage.ts` dagi yangi funksiya bilan toʻqnashadi)

- [ ] **Step 1: Failing testni yozish**

`src/commands/esc-pos.test.ts`:

```ts
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
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini tasdiqlash**

```bash
npx vitest run src/commands/esc-pos.test.ts
```

Kutilgan: koʻp test FAIL — `Commands.INIT` hozir `number[]`, `Buffer.isBuffer` `false` qaytaradi; `CUT_PARTIAL` `1D 56 01` boʻlsa ham `Buffer` emas; `BARCODE.PRINT` string qabul qiladi va NUL qoʻshadi; `QRCODE.MODEL(2)` `… 41 02 00` beradi; `CHARSET` hali mavjud.

- [ ] **Step 3: `esc-pos.ts` ni toʻliq qayta yozish**

`src/commands/esc-pos.ts` faylini quyidagi mazmun bilan **toʻliq almashtiring**:

```ts
/**
 * ESC/POS command constants — the single source of truth for this package.
 *
 * Every value is a `Buffer` (or a function returning one) so that command
 * tables never diverge between modules. Character-table selection lives in
 * `./codepage` (`selectCodepage`), not here.
 */
import type { BarcodeType } from '../types';

// Control characters
export const NUL = 0x00; // Null
export const LF = 0x0a; // Line feed
export const CR = 0x0d; // Carriage return
export const HT = 0x09; // Horizontal tab
export const FF = 0x0c; // Form feed
export const ESC = 0x1b; // Escape
export const FS = 0x1c; // Field separator
export const GS = 0x1d; // Group separator
export const DLE = 0x10; // Data link escape

const buf = (...bytes: number[]): Buffer => Buffer.from(bytes);

/** Clamps a value into a single byte. */
const clampByte = (n: number): number => Math.min(0xff, Math.max(0, Math.trunc(n)));

/** Clamps a value into an inclusive range. */
const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.trunc(n)));

export const Commands = {
  /** `ESC @` — reset the printer to its power-on state. */
  INIT: buf(ESC, 0x40),

  TEXT: {
    NORMAL: buf(ESC, 0x21, 0x00),
    BOLD_ON: buf(ESC, 0x45, 0x01),
    BOLD_OFF: buf(ESC, 0x45, 0x00),
    UNDERLINE_ON: buf(ESC, 0x2d, 0x01),
    UNDERLINE_2_ON: buf(ESC, 0x2d, 0x02),
    UNDERLINE_OFF: buf(ESC, 0x2d, 0x00),
    INVERT_ON: buf(GS, 0x42, 0x01),
    INVERT_OFF: buf(GS, 0x42, 0x00),
    DOUBLE_HEIGHT: buf(ESC, 0x21, 0x10),
    DOUBLE_WIDTH: buf(ESC, 0x21, 0x20),
    DOUBLE_SIZE: buf(ESC, 0x21, 0x30),
  },

  ALIGN: {
    LEFT: buf(ESC, 0x61, 0x00),
    CENTER: buf(ESC, 0x61, 0x01),
    RIGHT: buf(ESC, 0x61, 0x02),
  },

  PAPER: {
    FEED_1: buf(LF),
    /** `ESC d n` — feed n lines. */
    FEED_N: (n: number): Buffer => buf(ESC, 0x64, clampByte(n)),
    /** `GS V 0` — cut the paper through. */
    CUT_FULL: buf(GS, 0x56, 0x00),
    /**
     * `GS V 1` — partial cut, leaving one point uncut.
     *
     * Not `GS V 65 0`: in `GS V m n`, m=65 feeds and then cuts *fully*, and
     * m=66 is the partial variant. Using 65 here made `cut(partial: true)`
     * silently perform a full cut.
     */
    CUT_PARTIAL: buf(GS, 0x56, 0x01),
    /** `GS V 65 n` — feed n units, then full cut. */
    CUT_FEED_FULL: (n: number): Buffer => buf(GS, 0x56, 65, clampByte(n)),
    /** `GS V 66 n` — feed n units, then partial cut. */
    CUT_FEED_PARTIAL: (n: number): Buffer => buf(GS, 0x56, 66, clampByte(n)),
  },

  BARCODE: {
    /** `GS h n` — barcode height in dots (1-255). */
    HEIGHT: (h: number): Buffer => buf(GS, 0x68, clamp(h, 1, 255)),
    /** `GS w n` — barcode module width (2-6). */
    WIDTH: (w: number): Buffer => buf(GS, 0x77, clamp(w, 2, 6)),
    HRI_NONE: buf(GS, 0x48, 0x00),
    HRI_ABOVE: buf(GS, 0x48, 0x01),
    HRI_BELOW: buf(GS, 0x48, 0x02),
    HRI_BOTH: buf(GS, 0x48, 0x03),
    TYPE: {
      'UPC-A': 0x41,
      'UPC-E': 0x42,
      EAN13: 0x43,
      EAN8: 0x44,
      CODE39: 0x45,
      ITF: 0x46,
      CODABAR: 0x47,
      CODE93: 0x48,
      CODE128: 0x49,
    } as Readonly<Record<BarcodeType, number>>,
    /**
     * `GS k m n d1...dn` — print a barcode.
     *
     * The NUL-terminated form (`GS k m d... NUL`) only applies to m=0-6. All
     * type codes this package uses are 65-73, which require the length byte.
     */
    PRINT: (type: number, data: Buffer): Buffer => {
      if (data.length > 255) {
        throw new Error(`Barcode data is ${data.length} bytes; the maximum is 255`);
      }
      return Buffer.concat([buf(GS, 0x6b, type, data.length), data]);
    },
  },

  QRCODE: {
    /**
     * `GS ( k 4 0 49 65 n 0` — select the QR model.
     *
     * n is the *character* code: 49 for model 1, 50 for model 2. Sending the
     * raw number 1 or 2 selects nothing.
     */
    MODEL: (model: 1 | 2 = 2): Buffer =>
      buf(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, model === 1 ? 0x31 : 0x32, 0x00),
    /** `GS ( k 3 0 49 67 n` — module size (1-16). */
    SIZE: (size: number): Buffer =>
      buf(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, clamp(size, 1, 16)),
    ERROR_CORRECTION: {
      L: buf(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30),
      M: buf(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31),
      Q: buf(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x32),
      H: buf(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x33),
    },
    /** `GS ( k pL pH 49 80 48 d...` — store data in the symbol buffer. */
    STORE: (data: Buffer): Buffer => {
      const length = data.length + 3;
      if (length > 0xffff) {
        throw new Error(`QR data is ${data.length} bytes; the maximum is ${0xffff - 3}`);
      }
      return Buffer.concat([
        buf(GS, 0x28, 0x6b, length & 0xff, (length >> 8) & 0xff, 0x31, 0x50, 0x30),
        data,
      ]);
    },
    /** `GS ( k 3 0 49 81 48` — print the stored symbol. */
    PRINT: buf(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30),
  },

  IMAGE: {
    /**
     * `GS v 0 m xL xH yL yH d...` — raster bit image.
     *
     * The row width is rounded *up* to whole bytes; `width / 8` alone produces
     * a fraction for any width that is not a multiple of 8, which makes
     * `Buffer.from` throw.
     */
    RASTER: (width: number, height: number, data: Buffer): Buffer => {
      const widthBytes = Math.ceil(width / 8);
      const expected = widthBytes * height;
      if (data.length !== expected) {
        throw new Error(
          `Raster data is ${data.length} bytes but ${widthBytes}x${height} needs ${expected}`
        );
      }
      return Buffer.concat([
        buf(
          GS,
          0x76,
          0x30,
          0x00,
          widthBytes & 0xff,
          (widthBytes >> 8) & 0xff,
          height & 0xff,
          (height >> 8) & 0xff
        ),
        data,
      ]);
    },
  },

  CASH_DRAWER: {
    /** `ESC p 0 25 250` — pulse pin 2. */
    OPEN_PIN2: buf(ESC, 0x70, 0x00, 0x19, 0xfa),
    /** `ESC p 1 25 250` — pulse pin 5. */
    OPEN_PIN5: buf(ESC, 0x70, 0x01, 0x19, 0xfa),
  },

  LINE_SPACING: {
    DEFAULT: buf(ESC, 0x32),
    SET: (n: number): Buffer => buf(ESC, 0x33, clampByte(n)),
  },

  /** `ESC B n t` — beep n times for t units. */
  BEEP: (times = 1, duration = 3): Buffer =>
    buf(ESC, 0x42, clamp(times, 1, 9), clamp(duration, 1, 9)),
} as const;

/** Converts a byte array to a Buffer. */
export function toBuffer(commands: number[]): Buffer {
  return Buffer.from(commands);
}

/** Concatenates byte arrays and Buffers into one Buffer. */
export function concat(...commands: (number[] | Buffer)[]): Buffer {
  return Buffer.concat(commands.map((cmd) => (Array.isArray(cmd) ? Buffer.from(cmd) : cmd)));
}
```

- [ ] **Step 4: Eksportlarni tuzatish**

`src/commands/index.ts` hozir ikki satrdan iborat. Uchinchi satrni qoʻshing:

```ts
export * from './esc-pos';
export * from './escpos-builder';
export * from './codepage';
```

`src/index.ts` `encodeText` ni `./commands` barrel'idan nomlab eksport qiladi. Nom oʻzgarmadi — faqat manba fayl `esc-pos.ts` dan `codepage.ts` ga koʻchdi, shuning uchun bu satr ishlashda davom etadi. `src/index.ts` ni bu taskda tegmang; u Task 13 da toʻliq almashtiriladi.

- [ ] **Step 5: Testni ishga tushirib oʻtishini tasdiqlash**

```bash
npx vitest run src/commands/esc-pos.test.ts
```

Kutilgan: barcha testlar PASS.

- [ ] **Step 6: Butun test toʻplamini va typecheck'ni ishga tushirish**

```bash
npm run test:run && npm run typecheck
```

Kutilgan: hammasi oʻtadi. `escpos-builder.ts` hali oʻzining lokal `CMD` obyektidan foydalanadi, shuning uchun u bu oʻzgarishdan taʻsirlanmaydi.

- [ ] **Step 7: Commit**

```bash
git add src/commands/esc-pos.ts src/commands/esc-pos.test.ts src/commands/index.ts
git commit -m "fix(escpos): correct four command-table defects and switch to Buffers

- BARCODE.PRINT used the NUL-terminated form with type codes 65-73, which
  the spec reserves for the length-prefixed form
- IMAGE.RASTER did not round width/8 up, so any width not a multiple of 8
  produced a fractional byte count and threw
- CUT_PARTIAL was GS V 65 0 in escpos-builder, which feeds and then cuts
  *fully*; the partial variant is GS V 1 (or GS V 66 n)
- QRCODE.MODEL sent the raw number 2 instead of the character code 0x32

Every value is now a Buffer so the table cannot diverge from its consumers.
CHARSET is removed in favour of selectCodepage(); encodeText() is removed
because codepage.ts now owns that name."
```

---

### Task 6: `dumpESCPOS()` — hex dump vositasi

Printer yoʻqligi sharoitida bu asosiy tekshirish asbobi. Bayt farqini `1B 74 11` vs `1B 74 12` deb emas, `PC866` vs `PC852` deb koʻrsatadi.

**Files:**
- Create: `src/utils/hex-dump.ts`
- Test: `src/utils/hex-dump.test.ts`
- Modify: `src/utils/index.ts`

**Interfaces:**
- Consumes: `CODEPAGE_TABLES`, `CODEPAGE_ESC_T`, `UNDEFINED_CHAR`, `Codepage` (Task 2)
- Produces: `function dumpESCPOS(data: Buffer, options?: { table?: Codepage }): string`

**Chiqish formati:** har bir satr `OFFSET␠␠HEX␠␠MNEMONIC␠␠NOTE`. `OFFSET` — 4 xonali kichik hex. `HEX` — koʻpi bilan 8 bayt, undan uzuni `...` bilan qisqartiriladi va toʻliq uzunlik NOTE'da koʻrsatiladi.

- [ ] **Step 1: Failing testni yozish**

`src/utils/hex-dump.test.ts`:

```ts
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
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini tasdiqlash**

```bash
npx vitest run src/utils/hex-dump.test.ts
```

Kutilgan: FAIL — `Failed to resolve import "./hex-dump"`.

- [ ] **Step 3: Implementatsiya**

`src/utils/hex-dump.ts`:

```ts
/**
 * Turns an ESC/POS byte stream into readable, annotated text.
 *
 * Byte-level tests are the only way to verify printer output without hardware,
 * and a raw hex diff is nearly unreadable. This renders `1B 74 11` as
 * `ESC t 17  Select character table (PC866)`, so a failing assertion says what
 * actually changed.
 */
import { CODEPAGE_TABLES, CODEPAGE_ESC_T, UNDEFINED_CHAR } from '../commands/codepage-tables';
import type { Codepage } from '../commands/codepage-tables';

const MAX_HEX_BYTES = 8;
const ALIGNMENTS = ['left', 'center', 'right'];
const HRI_POSITIONS: Record<number, string> = { 0: 'none', 1: 'above', 2: 'below', 3: 'both' };
const BARCODE_NAMES: Record<number, string> = {
  0x41: 'UPC-A',
  0x42: 'UPC-E',
  0x43: 'EAN13',
  0x44: 'EAN8',
  0x45: 'CODE39',
  0x46: 'ITF',
  0x47: 'CODABAR',
  0x48: 'CODE93',
  0x49: 'CODE128',
};

interface Decoded {
  /** Total bytes this entry consumes. */
  length: number;
  mnemonic: string;
  note: string;
}

const hex2 = (n: number): string => n.toString(16).toUpperCase().padStart(2, '0');
const onOff = (n: number): string => (n === 0 ? 'off' : 'on');

function codepageFor(escT: number): Codepage | undefined {
  return (Object.keys(CODEPAGE_ESC_T) as Codepage[]).find((name) => CODEPAGE_ESC_T[name] === escT);
}

function sizeNote(n: number): string {
  const width = ((n >> 4) & 0x07) + 1;
  const height = (n & 0x07) + 1;
  return `${width}x width, ${height}x height`;
}

/** Decodes the command starting at `offset`, or null if it is not recognised. */
function decodeCommand(data: Buffer, offset: number): Decoded | null {
  const at = (i: number): number => data[offset + i] ?? 0;

  switch (at(0)) {
    case 0x0a:
      return { length: 1, mnemonic: 'LF', note: 'Line feed' };
    case 0x0d:
      return { length: 1, mnemonic: 'CR', note: 'Carriage return' };
    case 0x1b:
      switch (at(1)) {
        case 0x40:
          return { length: 2, mnemonic: 'ESC @', note: 'Initialize printer' };
        case 0x32:
          return { length: 2, mnemonic: 'ESC 2', note: 'Default line spacing' };
        case 0x33:
          return { length: 3, mnemonic: `ESC 3 ${at(2)}`, note: `Line spacing ${at(2)} dots` };
        case 0x74: {
          const name = codepageFor(at(2));
          return {
            length: 3,
            mnemonic: `ESC t ${at(2)}`,
            note: `Select character table (${name ?? 'vendor-specific'})`,
          };
        }
        case 0x61:
          return {
            length: 3,
            mnemonic: `ESC a ${at(2)}`,
            note: `Align ${ALIGNMENTS[at(2)] ?? 'unknown'}`,
          };
        case 0x45:
          return { length: 3, mnemonic: `ESC E ${at(2)}`, note: `Bold ${onOff(at(2))}` };
        case 0x2d:
          return {
            length: 3,
            mnemonic: `ESC - ${at(2)}`,
            note: at(2) === 0 ? 'Underline off' : `Underline on (${at(2)}-dot)`,
          };
        case 0x21:
          return { length: 3, mnemonic: `ESC ! ${at(2)}`, note: `Character size: ${sizeNote(at(2))}` };
        case 0x64:
          return { length: 3, mnemonic: `ESC d ${at(2)}`, note: `Feed ${at(2)} line(s)` };
        case 0x70:
          return { length: 5, mnemonic: `ESC p ${at(2)}`, note: `Pulse cash drawer pin ${at(2) === 0 ? 2 : 5}` };
        case 0x42:
          return { length: 4, mnemonic: `ESC B ${at(2)} ${at(3)}`, note: `Beep ${at(2)} time(s)` };
        default:
          return null;
      }
    case 0x1d:
      switch (at(1)) {
        case 0x42:
          return { length: 3, mnemonic: `GS B ${at(2)}`, note: `White/black reverse ${onOff(at(2))}` };
        case 0x56: {
          const mode = at(2);
          if (mode === 65 || mode === 66) {
            return {
              length: 4,
              mnemonic: `GS V ${mode} ${at(3)}`,
              note: `Feed ${at(3)}, then ${mode === 65 ? 'full cut' : 'partial cut'}`,
            };
          }
          return {
            length: 3,
            mnemonic: `GS V ${mode}`,
            note: mode === 1 || mode === 49 ? 'Partial cut' : 'Full cut',
          };
        }
        case 0x68:
          return { length: 3, mnemonic: `GS h ${at(2)}`, note: `Barcode height ${at(2)} dots` };
        case 0x77:
          return { length: 3, mnemonic: `GS w ${at(2)}`, note: `Barcode module width ${at(2)}` };
        case 0x48:
          return {
            length: 3,
            mnemonic: `GS H ${at(2)}`,
            note: `HRI position ${HRI_POSITIONS[at(2)] ?? 'unknown'}`,
          };
        case 0x6b: {
          const payload = at(3);
          const total = 4 + payload;
          return {
            length: total,
            mnemonic: `GS k ${at(2)} ${payload}`,
            note: `Print barcode (${BARCODE_NAMES[at(2)] ?? 'unknown type'}, ${total} bytes)`,
          };
        }
        case 0x28: {
          if (at(2) !== 0x6b) return null;
          const params = at(3) + (at(4) << 8);
          const fn = at(6);
          const notes: Record<number, string> = {
            0x41: 'Select QR model',
            0x43: `Set QR module size ${at(7)}`,
            0x45: 'Set QR error correction',
            0x50: 'Store QR data',
            0x51: 'Print QR symbol',
          };
          const total = 5 + params;
          return {
            length: total,
            mnemonic: `GS ( k ${at(5)} ${fn}`,
            note: `${notes[fn] ?? 'QR function'} (${total} bytes)`,
          };
        }
        case 0x76: {
          if (at(2) !== 0x30) return null;
          const widthBytes = at(4) + (at(5) << 8);
          const height = at(6) + (at(7) << 8);
          const total = 8 + widthBytes * height;
          return {
            length: total,
            mnemonic: 'GS v 0',
            note: `Raster image ${widthBytes * 8}x${height} (${total} bytes)`,
          };
        }
        default:
          return null;
      }
    default:
      return null;
  }
}

/** True when a byte belongs in a printable text run rather than a command. */
function isTextByte(byte: number, table: Codepage): boolean {
  if (byte >= 0x20 && byte < 0x7f) return true;
  if (byte < 0x80) return false;
  return CODEPAGE_TABLES[table][byte - 0x80] !== UNDEFINED_CHAR;
}

function decodeTextRun(data: Buffer, table: Codepage): string {
  let out = '';
  for (const byte of data) {
    out += byte < 0x80 ? String.fromCharCode(byte) : CODEPAGE_TABLES[table][byte - 0x80];
  }
  return out;
}

function formatLine(offset: number, bytes: Buffer, mnemonic: string, note: string): string {
  const shown = [...bytes.subarray(0, MAX_HEX_BYTES)].map(hex2).join(' ');
  const hexColumn = bytes.length > MAX_HEX_BYTES ? `${shown} ...` : shown;
  return [
    offset.toString(16).padStart(4, '0'),
    hexColumn.padEnd(MAX_HEX_BYTES * 3 + 3),
    mnemonic.padEnd(16),
    note,
  ]
    .join('  ')
    .trimEnd();
}

/**
 * Renders an ESC/POS byte stream as annotated lines, one per command or text run.
 *
 * @param options.table Codepage used to decode high bytes in text runs. Only
 *   affects how the dump *reads* — it does not change the bytes.
 */
export function dumpESCPOS(data: Buffer, options?: { table?: Codepage }): string {
  const table = options?.table ?? 'PC437';
  const lines: string[] = [];
  let offset = 0;

  while (offset < data.length) {
    const command = decodeCommand(data, offset);
    if (command) {
      const length = Math.min(command.length, data.length - offset);
      lines.push(formatLine(offset, data.subarray(offset, offset + length), command.mnemonic, command.note));
      offset += length;
      continue;
    }

    if (isTextByte(data[offset], table)) {
      let end = offset;
      while (end < data.length && isTextByte(data[end], table) && !decodeCommand(data, end)) {
        end++;
      }
      const run = data.subarray(offset, end);
      lines.push(formatLine(offset, run, `"${decodeTextRun(run, table)}"`, `(${table}, ${run.length} bytes)`));
      offset = end;
      continue;
    }

    lines.push(formatLine(offset, data.subarray(offset, offset + 1), hex2(data[offset]), 'unknown byte'));
    offset += 1;
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: `src/utils/index.ts` ga eksport qoʻshish**

```ts
export * from './hex-dump';
```

- [ ] **Step 5: Testni ishga tushirib oʻtishini tasdiqlash**

```bash
npx vitest run src/utils/hex-dump.test.ts
```

Kutilgan: barcha testlar PASS.

Agar `keeps offsets monotonic` testi yiqilsa, `isTextByte` va `decodeCommand` oʻzaro taʻsirini tekshiring: matn oqimi komanda boshlanadigan joyda toʻxtashi kerak. `0x0A` (LF) `isTextByte` uchun `false`, shuning uchun u matn oqimini uzadi — bu toʻgʻri.

- [ ] **Step 6: Butun toʻplam va typecheck**

```bash
npm run test:run && npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/utils/hex-dump.ts src/utils/hex-dump.test.ts src/utils/index.ts
git commit -m "feat(utils): add dumpESCPOS for readable byte-level verification

With no thermal printer available, byte assertions are the only verification
path, and a raw hex diff is unreadable. This renders 1B 74 11 as
'ESC t 17  Select character table (PC866)' so a failing test names what
changed. Exported publicly — it is equally useful to library users."
```

---

### Task 7: Mavjud builder testlarini kuchaytirish (refaktoring qalqoni)

Hozirgi `escpos-builder.test.ts` testlari deyarli hech narsani tekshirmaydi. Masalan:

```ts
expect(data.includes(0x45)).toBe(true);   // "bold" testi
```

`0x45` — bu `'E'` harfi ham. Bu tekshiruv har qanday `E` harfi bor chekda oʻtadi. Keyingi taskda `escpos-builder.ts` toʻliq qayta yoziladi — bunday testlar hech qanday himoya bermaydi.

Bu task **xatti-harakatni oʻzgartirmaydi**: faqat testlarni haqiqiy bayt ketma-ketligini tekshiradigan holga keltiradi.

**Files:**
- Modify: `src/commands/escpos-builder.test.ts` (toʻliq almashtiriladi)

**Interfaces:**
- Consumes: `buildESCPOSData(contents, paperWidth)` — **hozirgi** pozitsion imzo
- Produces: `build()` test yordamchisi — keyingi taskda imzo oʻzgarganda faqat shu yordamchi tahrirlanadi, 20+ chaqiruv joyi emas

- [ ] **Step 1: Test faylini toʻliq almashtirish**

`src/commands/escpos-builder.test.ts`:

```ts
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
```

- [ ] **Step 2: Testlarni ishga tushirish**

```bash
npx vitest run src/commands/escpos-builder.test.ts
```

Kutilgan: **barchasi PASS**. Bu task hech qanday xatti-harakatni oʻzgartirmaydi — agar biror test yiqilsa, u kutilmagan mavjud bug aniqlaganini bildiradi: **toʻxtang va xabar bering**, keyingi taskka oʻtmang.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/commands/escpos-builder.test.ts
git commit -m "test(escpos): assert byte sequences instead of stray single bytes

The old tests checked things like data.includes(0x45) for bold, which passes
on any receipt containing the letter E. They gave no protection for the
rewrite that follows. Every assertion now checks an ordered byte sequence."
```

---

### Task 8: `escpos-builder.ts` — birlashish va codepage quvuri

Spec §4.3, §5.4, §6.1. Bu taskda `escpos-builder.ts` toʻliq qayta yoziladi. Ikkita ish birga bajariladi, chunki ikkisi ham butun faylni qayta yozishni talab qiladi va ularni ajratish faylni ikki marta yozishga olib keladi:

1. Lokal `CMD` obyekti olib tashlanadi, `esc-pos.ts` dagi `Commands` ishlatiladi. `CUT_PARTIAL` bugi shuning natijasi sifatida oʻz-oʻzidan tuzaladi.
2. Codepage quvuri qoʻshiladi va imzo `options` obyektiga oʻtadi.

Yoʻl-yoʻlakay yana ikki dublikat yoʻqoladi:

- `calculateColumnWidths` — `escpos-builder.ts` va `utils/format.ts` da ikki nusxa. `utils/format.ts` dagisi ishlatiladi.
- QR `MODEL` komandasi builder'da umuman yuborilmaydi. Endi yuboriladi — bu bayt oqimini oʻzgartiradi va `CHANGELOG` da qayd etiladi.

**Files:**
- Modify: `src/commands/escpos-builder.ts` (toʻliq almashtiriladi)
- Modify: `src/commands/escpos-builder.test.ts` (yordamchi + yangi testlar)

**Interfaces:**
- Consumes: `Commands` (Task 5), `encodeText`/`normalizeForCodepage`/`selectCodepage`/`resolveCodepage` (Task 3), `calculateColumnWidths` (`../utils/format`, mavjud)
- Produces:
  - `interface BuildESCPOSOptions { paperWidth?: PaperWidth; codepage?: Codepage | number; codepageTable?: Codepage; charsPerLine?: number }`
  - `function buildESCPOSData(contents: PrintContent[], options?: BuildESCPOSOptions): Buffer`
- **Olib tashlanadi:** `ESCPOSCommands` eksporti

- [ ] **Step 1: Test yordamchisini yangi imzoga oʻtkazish va yangi testlarni qoʻshish**

`src/commands/escpos-builder.test.ts` da `build` yordamchisini almashtiring:

```ts
const build = (contents: PrintContent[], paperWidth: PaperWidth = 80): Buffer =>
  buildESCPOSData(contents, { paperWidth });
```

`ESCPOSCommands` importini va `describe('ESCPOSCommands (removed in a later task)')` blokini **butunlay oʻchiring** — u eksport endi mavjud emas. Import satri shunday qoladi:

```ts
import { buildESCPOSData } from './escpos-builder';
```

Faylning oxiriga quyidagi yangi describe bloklarini qoʻshing:

```ts
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
```

- [ ] **Step 2: Testlarni ishga tushirib yiqilishini tasdiqlash**

```bash
npx vitest run src/commands/escpos-builder.test.ts
```

Kutilgan FAIL'lar: `codepage selection` bloki toʻliq yiqiladi (`ESC t` yuborilmaydi), Cyrillic testlari UTF-8 baytlar sababli yiqiladi, `partial cut` `1D 56 41 00` sababli yiqiladi, `qrcode model` yiqiladi, `charsPerLine override` yiqiladi.

- [ ] **Step 3: `escpos-builder.ts` ni toʻliq qayta yozish**

`src/commands/escpos-builder.ts` faylini quyidagi mazmun bilan **toʻliq almashtiring**:

```ts
/**
 * Builds raw ESC/POS bytes from a PrintContent array.
 *
 * Command constants come from `./esc-pos` — this module keeps no table of its
 * own, because two tables inevitably drift apart. Text goes through
 * `./codepage`, and layout arithmetic runs on *normalized* text so that column
 * widths stay correct (see the pipeline note in `./codepage`).
 */
import type {
  PrintContent,
  TextStyle,
  TableColumn,
  TextAlign,
  PaperWidth,
  BarcodeType,
  BarcodeOptions,
  QRCodeOptions,
} from '../types';
import { DEFAULTS } from '../types';
import { calculateColumnWidths } from '../utils/format';
import { Commands } from './esc-pos';
import { encodeText, normalizeForCodepage, selectCodepage, resolveCodepage } from './codepage';
import type { Codepage } from './codepage';

export interface BuildESCPOSOptions {
  /** Paper width in mm. Determines charsPerLine unless that is given. */
  paperWidth?: PaperWidth;
  /** Character table, by name or as a raw `ESC t` value. Defaults to `'PC437'`. */
  codepage?: Codepage | number;
  /** Encoding table to use when `codepage` is a number. Defaults to `'PC437'`. */
  codepageTable?: Codepage;
  /**
   * Characters per line, overriding the value derived from paperWidth. Needed
   * for printers that are neither 32 nor 48 columns — 42 is common.
   */
  charsPerLine?: number;
}

/** Settings resolved once per build and threaded through the content builders. */
interface BuildContext {
  charsPerLine: number;
  table: Codepage;
}

/** Builds the complete ESC/POS byte stream for a receipt. */
export function buildESCPOSData(
  contents: PrintContent[],
  options: BuildESCPOSOptions = {}
): Buffer {
  const paperWidth = options.paperWidth ?? DEFAULTS.PAPER_WIDTH;
  const charsPerLine =
    options.charsPerLine ??
    (paperWidth === 58 ? DEFAULTS.CHARS_PER_LINE_58 : DEFAULTS.CHARS_PER_LINE_80);
  const { escT, table } = resolveCodepage(options.codepage, options.codepageTable);
  const context: BuildContext = { charsPerLine, table };

  const buffers: Buffer[] = [Commands.INIT, selectCodepage(escT)];
  for (const content of contents) {
    buffers.push(...buildContent(content, context));
  }
  return Buffer.concat(buffers);
}

function buildContent(content: PrintContent, context: BuildContext): Buffer[] {
  switch (content.type) {
    case 'text':
      return buildText(content.value, content.style, context);
    case 'line':
      return buildLine(content.character, context);
    case 'table':
      return buildTable(content.rows, context);
    case 'feed':
      return [Commands.PAPER.FEED_N(content.lines ?? DEFAULTS.FEED_LINES)];
    case 'cut':
      return [
        Commands.PAPER.FEED_N(3),
        content.partial ? Commands.PAPER.CUT_PARTIAL : Commands.PAPER.CUT_FULL,
      ];
    case 'barcode':
      return buildBarcode(content.value, content.options);
    case 'qrcode':
      return buildQRCode(content.value, content.options);
    case 'image':
      // Real image support arrives in milestone 2. Until then this prints a
      // placeholder; the next task replaces that with silently skipping it.
      return [encodeText('[IMAGE]', context.table), Commands.PAPER.FEED_1];
    default:
      return [];
  }
}

function alignmentCommand(align: TextAlign | undefined): Buffer {
  if (align === 'center') return Commands.ALIGN.CENTER;
  if (align === 'right') return Commands.ALIGN.RIGHT;
  return Commands.ALIGN.LEFT;
}

function sizeCommand(size: TextStyle['size']): Buffer | undefined {
  switch (size) {
    case 'double':
      return Commands.TEXT.DOUBLE_SIZE;
    case 'double-height':
      return Commands.TEXT.DOUBLE_HEIGHT;
    case 'double-width':
      return Commands.TEXT.DOUBLE_WIDTH;
    default:
      return undefined;
  }
}

function hriCommand(position: BarcodeOptions['textPosition']): Buffer {
  switch (position) {
    case 'none':
      return Commands.BARCODE.HRI_NONE;
    case 'above':
      return Commands.BARCODE.HRI_ABOVE;
    case 'both':
      return Commands.BARCODE.HRI_BOTH;
    default:
      return Commands.BARCODE.HRI_BELOW;
  }
}

function buildText(text: string, style: TextStyle | undefined, context: BuildContext): Buffer[] {
  const buffers: Buffer[] = [alignmentCommand(style?.align)];

  const size = sizeCommand(style?.size);
  if (size) buffers.push(size);
  if (style?.bold) buffers.push(Commands.TEXT.BOLD_ON);
  if (style?.underline) buffers.push(Commands.TEXT.UNDERLINE_ON);
  if (style?.invert) buffers.push(Commands.TEXT.INVERT_ON);

  buffers.push(encodeText(text, context.table), Commands.PAPER.FEED_1);

  if (style?.invert) buffers.push(Commands.TEXT.INVERT_OFF);
  if (style?.underline) buffers.push(Commands.TEXT.UNDERLINE_OFF);
  if (style?.bold) buffers.push(Commands.TEXT.BOLD_OFF);
  if (size) buffers.push(Commands.TEXT.NORMAL);
  buffers.push(Commands.ALIGN.LEFT);

  return buffers;
}

function buildLine(character: string | undefined, context: BuildContext): Buffer[] {
  const normalized = normalizeForCodepage(character || DEFAULTS.LINE_CHARACTER, context.table);
  const separator = normalized.charAt(0) || DEFAULTS.LINE_CHARACTER;
  return [
    encodeText(separator.repeat(context.charsPerLine), context.table),
    Commands.PAPER.FEED_1,
  ];
}

/** Pads or truncates text to a fixed column width. */
function padColumn(text: string, width: number, align: TextAlign | undefined): string {
  if (text.length >= width) return text.substring(0, width);
  const padding = width - text.length;
  if (align === 'right') return ' '.repeat(padding) + text;
  if (align === 'center') {
    const left = Math.floor(padding / 2);
    return ' '.repeat(left) + text + ' '.repeat(padding - left);
  }
  return text + ' '.repeat(padding);
}

function buildTable(rows: TableColumn[][], context: BuildContext): Buffer[] {
  const buffers: Buffer[] = [];

  for (const row of rows) {
    const widths = calculateColumnWidths(row, context.charsPerLine);
    let line = '';
    row.forEach((column, index) => {
      // Normalize before measuring. An ellipsis becomes three characters and an
      // unencodable character becomes one question mark, so padding computed on
      // raw input would shift every column after it.
      const text = normalizeForCodepage(column.text ?? '', context.table);
      line += padColumn(text, widths[index], column.align);
    });

    const hasBold = row.some((column) => column.bold);
    if (hasBold) buffers.push(Commands.TEXT.BOLD_ON);
    buffers.push(encodeText(line, context.table), Commands.PAPER.FEED_1);
    if (hasBold) buffers.push(Commands.TEXT.BOLD_OFF);
  }

  return buffers;
}

/** Builds the payload bytes for a barcode, including any code-set prefix. */
function barcodePayload(type: BarcodeType, value: string): Buffer {
  if (type === 'CODE128') {
    // '{B' selects code set B, which covers printable ASCII.
    return Buffer.concat([Buffer.from([0x7b, 0x42]), Buffer.from(value, 'ascii')]);
  }
  return Buffer.from(value, 'ascii');
}

function buildBarcode(value: string, options: BarcodeOptions): Buffer[] {
  const typeCode = Commands.BARCODE.TYPE[options.type] ?? Commands.BARCODE.TYPE.CODE128;
  return [
    alignmentCommand(options.align),
    Commands.BARCODE.HEIGHT(options.height ?? DEFAULTS.BARCODE_HEIGHT),
    Commands.BARCODE.WIDTH(options.width ?? DEFAULTS.BARCODE_WIDTH),
    hriCommand(options.textPosition),
    Commands.BARCODE.PRINT(typeCode, barcodePayload(options.type, value)),
    Commands.PAPER.FEED_1,
    Commands.ALIGN.LEFT,
  ];
}

function buildQRCode(value: string, options?: QRCodeOptions): Buffer[] {
  return [
    alignmentCommand(options?.align),
    Commands.QRCODE.MODEL(2),
    Commands.QRCODE.SIZE(options?.size ?? DEFAULTS.QR_SIZE),
    Commands.QRCODE.ERROR_CORRECTION[options?.errorCorrection ?? DEFAULTS.QR_ERROR_CORRECTION],
    // QR symbols carry their own encoding; the printer's character table does
    // not apply to them, so the data goes out as UTF-8.
    Commands.QRCODE.STORE(Buffer.from(value, 'utf8')),
    Commands.QRCODE.PRINT,
    Commands.PAPER.FEED_1,
    Commands.ALIGN.LEFT,
  ];
}
```

- [ ] **Step 4: Testlarni ishga tushirib oʻtishini tasdiqlash**

```bash
npx vitest run src/commands/escpos-builder.test.ts
```

Kutilgan: barchasi PASS — Task 7 dagi qalqon testlari ham, yangi testlar ham.

Agar `pads two flexible columns` testi yiqilsa: `utils/format.ts` dagi `calculateColumnWidths` `-1` sentinelini ishlatadi, builder'dagi eskisi `null` ishlatgan. Ikkisi ham bir xil natija berishi kerak; farq boʻlsa `utils/format.ts` dagisini toʻgʻri deb hisoblang va testni emas, kutilgan qiymatni tekshirib chiqing.

- [ ] **Step 5: Butun toʻplam va typecheck**

```bash
npm run test:run && npm run typecheck
```

Kutilgan xato: `src/index.ts` hali `ESCPOSCommands` ni eksport qiladi. Uni shu bosqichda `src/index.ts` dan oʻchiring:

```ts
export { buildESCPOSData } from './commands/escpos-builder';
```

Soʻng qayta ishga tushiring.

- [ ] **Step 6: Commit**

```bash
git add src/commands/escpos-builder.ts src/commands/escpos-builder.test.ts src/index.ts
git commit -m "feat(escpos)!: encode text per codepage and drop the duplicate table

BREAKING: buildESCPOSData(contents, paperWidth) becomes
buildESCPOSData(contents, { paperWidth, codepage, codepageTable, charsPerLine }).
ESCPOSCommands is removed — use Commands from commands/esc-pos.

The builder no longer keeps its own command table, so the CUT_PARTIAL defect
disappears with the duplication that caused it. calculateColumnWidths now
comes from utils/format instead of being reimplemented here, and QR model
selection (previously omitted entirely) is emitted.

Text is encoded through the selected codepage instead of being sent as UTF-8,
and column padding is computed on normalized text so an ellipsis expanding to
three dots no longer shifts the columns.

charsPerLine can now be overridden — it existed on PrinterConfig but the
builder ignored it, hard-coding 32 or 48."
```

---

### Task 9: Barcode validatsiyasi va `image` ni jimgina oʻtkazish

Spec §5.6, §6.7. Notoʻgʻri barcode maʻlumoti baʻzi printerlarni osib qoʻyadi — kesishni ham bajarmaydi, qayta yoqish kerak boʻladi. Shuning uchun validatsiya printerga bayt yuborishdan **oldin** ishlaydi.

**Files:**
- Modify: `src/commands/escpos-builder.ts`
- Modify: `src/commands/escpos-builder.test.ts`

**Interfaces:**
- Produces: `function validateBarcodeValue(type: BarcodeType, value: string): void` — mos kelmasa `Error` tashlaydi

- [ ] **Step 1: Failing testlarni yozish**

`src/commands/escpos-builder.test.ts` da `describe('image content (interim behaviour)')` blokini quyidagiga **almashtiring**:

```ts
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
```

Faylning oxiriga qoʻshing:

```ts
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
```

`BarcodeType` importini test faylining yuqorisiga qoʻshing:

```ts
import type { PrintContent, PaperWidth, BarcodeType } from '../types';
```

- [ ] **Step 2: Testlarni ishga tushirib yiqilishini tasdiqlash**

```bash
npx vitest run src/commands/escpos-builder.test.ts
```

Kutilgan: `image content` bloki yiqiladi (hozir `[IMAGE]` chiqadi) va barcha `barcode validation` testlari yiqiladi (validatsiya yoʻq).

- [ ] **Step 3: `escpos-builder.ts` ga validatsiya qoʻshish**

`barcodePayload` funksiyasidan **oldin** quyidagini qoʻshing:

```ts
const DIGITS_ONLY = /^\d+$/;

/** Returns why a value is invalid for a symbology, or null when it is fine. */
function barcodeError(type: BarcodeType, value: string): string | null {
  if (value.length === 0) return 'the value is empty';

  switch (type) {
    case 'EAN13':
      return DIGITS_ONLY.test(value) && (value.length === 12 || value.length === 13)
        ? null
        : 'EAN13 requires 12 or 13 digits';
    case 'EAN8':
      return DIGITS_ONLY.test(value) && (value.length === 7 || value.length === 8)
        ? null
        : 'EAN8 requires 7 or 8 digits';
    case 'UPC-A':
      return DIGITS_ONLY.test(value) && (value.length === 11 || value.length === 12)
        ? null
        : 'UPC-A requires 11 or 12 digits';
    case 'UPC-E':
      return DIGITS_ONLY.test(value) && value.length >= 6 && value.length <= 8
        ? null
        : 'UPC-E requires 6 to 8 digits';
    case 'ITF':
      if (!DIGITS_ONLY.test(value)) return 'ITF requires digits only';
      return value.length % 2 === 0 ? null : 'ITF requires an even number of digits';
    case 'CODE39':
      return /^[0-9A-Z \-.$/+%*]+$/.test(value)
        ? null
        : 'CODE39 allows only 0-9, A-Z, space and - . $ / + % *';
    case 'CODABAR':
      return /^[A-Da-d][0-9\-$:/.+]*[A-Da-d]$/.test(value)
        ? null
        : 'CODABAR must start and end with A-D and otherwise contain only 0-9 - $ : / . +';
    case 'CODE93':
    case 'CODE128':
      return /^[\x20-\x7e]+$/.test(value) ? null : `${type} requires printable ASCII`;
    default:
      return null;
  }
}

/**
 * Throws when a value cannot be encoded in the given symbology.
 *
 * Some printers hang on malformed barcode data — they stop responding and do
 * not even cut the paper — so this runs before any byte is sent.
 */
export function validateBarcodeValue(type: BarcodeType, value: string): void {
  const reason = barcodeError(type, value);
  if (reason !== null) {
    throw new Error(`Invalid ${type} barcode value ${JSON.stringify(value)}: ${reason}`);
  }
}
```

`barcodePayload` ni brace escape'i bilan almashtiring:

```ts
/** Builds the payload bytes for a barcode, including any code-set prefix. */
function barcodePayload(type: BarcodeType, value: string): Buffer {
  if (type === 'CODE128') {
    // '{' introduces a code-set switch in ESC/POS CODE128 data, so a literal
    // brace has to be doubled to survive.
    const escaped = value.replace(/\{/g, '{{');
    // '{B' selects code set B, which covers printable ASCII.
    return Buffer.concat([Buffer.from([0x7b, 0x42]), Buffer.from(escaped, 'ascii')]);
  }
  return Buffer.from(value, 'ascii');
}
```

`buildBarcode` ning birinchi satriga validatsiyani qoʻshing:

```ts
function buildBarcode(value: string, options: BarcodeOptions): Buffer[] {
  validateBarcodeValue(options.type, value);
  const typeCode = Commands.BARCODE.TYPE[options.type] ?? Commands.BARCODE.TYPE.CODE128;
  // ... qolgani oʻzgarmaydi
```

`buildContent` dagi `image` shoxini almashtiring:

```ts
    case 'image':
      // Raster image support arrives in milestone 2. Emitting a '[IMAGE]'
      // placeholder would print that literal text on a customer's receipt, and
      // throwing would break every receipt built from data with a logo, so the
      // content is skipped.
      return [];
```

- [ ] **Step 4: Testlarni ishga tushirib oʻtishini tasdiqlash**

```bash
npx vitest run src/commands/escpos-builder.test.ts
```

- [ ] **Step 5: Butun toʻplam va typecheck**

```bash
npm run test:run && npm run typecheck
```

`receipt-builder.test.ts` da logo bilan bogʻliq test boʻlsa, u endi bayt chiqarmasligini hisobga oling — `ReceiptBuilder` faqat `PrintContent` yasaydi, baytlarni emas, shuning uchun u testlar taʻsirlanmasligi kerak.

- [ ] **Step 6: Commit**

```bash
git add src/commands/escpos-builder.ts src/commands/escpos-builder.test.ts
git commit -m "feat(escpos): validate barcode values and stop printing [IMAGE]

Malformed barcode data hangs some printers outright — they stop responding
and do not cut the paper — so each symbology's rules are checked before any
byte is sent. A literal '{' in a CODE128 value is now doubled, since '{'
introduces a code-set switch.

Image content emits nothing until milestone 2. Printing the literal text
'[IMAGE]' on a customer receipt was clearly wrong, and throwing would break
every ReceiptBuilder.fromData() call that supplies a logo."
```

---

### Task 10: Golden fixture

Spec §7.3. Toʻliq chekning izohlangan dump'i git'da saqlanadi. U snapshot emas — mnemonika ketma-ketligi qoʻlda tekshiriladi, shundan keyingina fayl commit qilinadi.

**Files:**
- Create: `src/commands/__fixtures__/receipt-pc866.golden.txt`
- Create: `src/commands/golden.test.ts`

**Interfaces:**
- Consumes: `createReceipt` (mavjud), `buildESCPOSData` (Task 8), `dumpESCPOS` (Task 6)

- [ ] **Step 1: Testni yozish**

`src/commands/golden.test.ts`:

```ts
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
    // Магазин: М=9C А=80 г=A3 а=A0 з=A7 и=A8 н=AD
    expect(data.indexOf(Buffer.from([0x9c, 0x80, 0xa3, 0xa0, 0xa7, 0xa8, 0xad]))).toBeGreaterThan(0);
  });

  it('transliterates the Uzbek turned comma rather than dropping it', () => {
    expect(buildFixtureReceipt().toString('latin1')).toContain("To'lov: naqd");
  });
});
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini tasdiqlash**

```bash
npx vitest run src/commands/golden.test.ts
```

Kutilgan: FAIL — fixture fayli hali yoʻq (`ENOENT`).

Ikkinchi va uchinchi testlar oʻtishi kerak. Agar `encodes the Cyrillic header` yiqilsa — Task 2 dagi jadval bilan solishtiring, kutilgan baytlarni `[...CODEPAGE_TABLES.PC866].indexOf('М') + 0x80` orqali tekshiring va rejadagi izohni tuzatib xabar bering.

- [ ] **Step 3: Dump'ni ishlab chiqarish**

```bash
npx vitest run src/commands/golden.test.ts --reporter=verbose 2>&1 | head -60
```

Dump'ni olishning ishonchli yoʻli — vaqtinchalik test fayli. `vitest` allaqachon TypeScript'ni hal qiladi, shuning uchun qoʻshimcha asbob kerak emas:

```bash
cat > src/commands/__dump.test.ts <<'EOF'
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createReceipt } from '../utils/receipt-builder';
import { buildESCPOSData } from './escpos-builder';
import { dumpESCPOS } from '../utils/hex-dump';

it('writes the golden dump', () => {
  const receipt = createReceipt(80)
    .textCenter('Магазин', { bold: true })
    .text('Toʻlov: naqd')
    .dashedLine()
    .row('Итого:', '12 000')
    .qrcode('https://example.com', { size: 6 })
    .feed(2)
    .cut(true);
  const data = buildESCPOSData(receipt.getContents(), { paperWidth: 80, codepage: 'PC866' });
  mkdirSync('src/commands/__fixtures__', { recursive: true });
  writeFileSync('src/commands/__fixtures__/receipt-pc866.golden.txt', dumpESCPOS(data, { table: 'PC866' }) + '\n', 'utf8');
});
EOF
npx vitest run src/commands/__dump.test.ts
cat src/commands/__fixtures__/receipt-pc866.golden.txt
```

**Chek mazmuni `golden.test.ts` dagi `buildFixtureReceipt()` bilan aynan bir xil boʻlishi shart** — bir belgi farq qilsa test yiqiladi.

- [ ] **Step 4: Mnemonika ketma-ketligini QOʻLDA tekshirish**

**Bu qadamni oʻtkazib yubormang.** Dump'ni fixture'ga koʻr-koʻrona koʻchirish buglarni ham muhrlab qoʻyadi.

Chiqishning **mnemonika ustuni** aynan quyidagi tartibda boʻlishi kerak:

| # | Mnemonika | Izoh |
|---|---|---|
| 1 | `ESC @` | Initialize printer |
| 2 | `ESC t 17` | Select character table (PC866) |
| 3 | `ESC a 1` | textCenter — markazga |
| 4 | `ESC E 1` | bold on |
| 5 | `"Магазин"` | PC866 da dekodlangan |
| 6 | `LF` | |
| 7 | `ESC E 0` | bold off |
| 8 | `ESC a 0` | markazlashni bekor qilish |
| 9 | `ESC a 0` | keyingi `text()` ning oʻz alignment'i |
| 10 | `"To'lov: naqd"` | `ʻ` → `'` translit |
| 11 | `LF` | |
| 12 | `ESC a 0` | |
| 13 | `"---...---"` | aynan 48 tire |
| 14 | `LF` | |
| 15 | jadval satri | 24 + 24 = jami **48 belgi**: `Итого:` (6) + 18 boʻsh joy, soʻng 18 boʻsh joy + `12 000` (6) |
| 16 | `LF` | |
| 17 | `ESC a 1` | qrcode markazda |
| 18 | `GS ( k 49 65` | Select QR model |
| 19 | `GS ( k 49 67` | Set QR module size 6 |
| 20 | `GS ( k 49 69` | Set QR error correction |
| 21 | `GS ( k 49 80` | Store QR data |
| 22 | `GS ( k 49 81` | Print QR symbol |
| 23 | `LF` | |
| 24 | `ESC a 0` | |
| 25 | `ESC d 2` | feed(2) |
| 26 | `ESC d 3` | cut oldidagi feed |
| 27 | `GS V 1` | **Partial cut** — `GS V 65 0` emas |

Har bir satrni tekshiring. Ayniqsa:

- 2-satr `ESC t 17` **`ESC @` dan darhol keyin** boʻlishi shart
- 13-satrdagi tire soni aynan 48
- 15-satrdagi jadval satri aynan 48 belgi: `Итого:` chapga tekislangan 24 belgili ustunda, `12 000` oʻngga tekislangan 24 belgili ustunda. Boʻsh joylarni sanab tekshiring — Markdown'da ular koʻz bilan aldamchi
- 27-satr `GS V 1`, agar `GS V 65 0` chiqsa — Task 8 toʻliq qoʻllanmagan
- Hech qayerda `unknown byte` boʻlmasligi kerak

Farq topsangiz — fixture'ni emas, **kodni** tuzating va Epson ESC/POS referenceiga murojaat qiling.

- [ ] **Step 5: Fixture faylini yozish**

Fayl 3-qadamda allaqachon yozilgan. 4-qadamdagi qoʻlda tekshiruvda kod tuzatilgan boʻlsa, `__dump.test.ts` ni qayta ishga tushirib faylni yangilang:

```bash
npx vitest run src/commands/__dump.test.ts
```

- [ ] **Step 6: Testni ishga tushirib oʻtishini tasdiqlash**

```bash
npx vitest run src/commands/golden.test.ts && npm run test:run && npm run typecheck
```

- [ ] **Step 7: Vaqtinchalik fayllarni tozalash va commit**

```bash
rm -f src/commands/__dump.test.ts
git add src/commands/__fixtures__/receipt-pc866.golden.txt src/commands/golden.test.ts
git commit -m "test(escpos): add an annotated golden dump for a full receipt

Guards the whole byte stream against accidental change: codepage selection,
Cyrillic encoding, Uzbek transliteration, column padding, QR command order
and the partial cut. The mnemonic sequence was verified by hand against the
ESC/POS reference before the fixture was committed, so it is a test rather
than a snapshot of whatever the code happened to produce."
```

---

### Task 11: Printer qatlami — PowerShell env va oʻlik API

Spec §6.5, §6.6, §6.8.

**Files:**
- Modify: `src/printer/raw-printer.ts`
- Modify: `src/printer/printer-manager.ts`
- Test: `src/printer/raw-printer.test.ts`

**Interfaces:**
- Produces:
  - `const WINDOWS_ENV_PRINTER = 'POS_PRINTER_NAME'`
  - `const WINDOWS_ENV_FILE = 'POS_PRINTER_FILE'`
  - `const WINDOWS_RAW_PRINT_SCRIPT: string` — oʻzgarmas, interpolyatsiyasiz
  - `printRawData(data: Buffer, printerName: string): Promise<PrintResult>` (imzo oʻzgarmaydi)
- **Olib tashlanadi:** `getPrinters(webContents)` — Electron 21+ da bu API yoʻq

- [ ] **Step 1: Failing testni yozish**

`src/printer/raw-printer.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

const state = vi.hoisted(() => ({ platform: 'linux' as string, spawn: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: state.spawn }));

// Only the two names raw-printer.ts imports. Spreading the whole module and
// overriding platform() is the shape that silently fails under default interop.
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { tmpdir: actual.tmpdir, platform: () => state.platform };
});

const { printRawData, WINDOWS_RAW_PRINT_SCRIPT, WINDOWS_ENV_PRINTER, WINDOWS_ENV_FILE } =
  await import('./raw-printer');

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
}

/** A spawn() stand-in that closes with the given exit code. */
function fakeChild(exitCode: number, stdout = ''): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  setImmediate(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
    child.emit('close', exitCode);
  });
  return child;
}

const lastCall = () => state.spawn.mock.calls[0];

beforeEach(() => {
  state.spawn.mockReset();
  state.platform = 'linux';
});

describe('printRawData on Unix', () => {
  it('invokes lp with raw output and no shell', async () => {
    state.spawn.mockImplementation(() => fakeChild(0));
    const result = await printRawData(Buffer.from([0x1b, 0x40]), 'TM-T20');

    expect(result.success).toBe(true);
    const [command, args] = lastCall();
    expect(command).toBe('lp');
    expect(args.slice(0, 4)).toEqual(['-d', 'TM-T20', '-o', 'raw']);
  });

  it('passes a hostile printer name through as a single argument', async () => {
    state.spawn.mockImplementation(() => fakeChild(0));
    const name = 'Printer"; rm -rf / #';
    await printRawData(Buffer.alloc(1), name);

    const [, args] = lastCall();
    expect(args[1]).toBe(name);
  });

  it('reports failure when lp exits non-zero', async () => {
    state.spawn.mockImplementation(() => fakeChild(1));
    const result = await printRawData(Buffer.alloc(1), 'TM-T20');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('reports failure when spawn itself errors', async () => {
    state.spawn.mockImplementation(() => {
      const child = new EventEmitter() as FakeChild;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      setImmediate(() => child.emit('error', new Error('ENOENT')));
      return child;
    });
    const result = await printRawData(Buffer.alloc(1), 'TM-T20');
    expect(result.success).toBe(false);
    expect(result.error).toContain('ENOENT');
  });
});

describe('printRawData on Windows', () => {
  beforeEach(() => {
    state.platform = 'win32';
  });

  it('runs a script that contains no interpolated values', async () => {
    state.spawn.mockImplementation(() => fakeChild(0, 'SUCCESS'));
    const name = 'Kassa "Bosh" #1';
    await printRawData(Buffer.alloc(1), name);

    const [command, args] = lastCall();
    expect(command).toBe('powershell.exe');
    const script = args[args.length - 1];
    expect(script).toBe(WINDOWS_RAW_PRINT_SCRIPT);
    expect(script).not.toContain(name);
  });

  it('passes the printer name and file path through the environment', async () => {
    state.spawn.mockImplementation(() => fakeChild(0, 'SUCCESS'));
    const name = 'Printer"; rm -rf / #';
    await printRawData(Buffer.alloc(1), name);

    const [, , options] = lastCall();
    expect(options.env[WINDOWS_ENV_PRINTER]).toBe(name);
    expect(options.env[WINDOWS_ENV_FILE]).toMatch(/receipt-print-.*\.bin$/);
  });

  it('keeps the rest of the environment', async () => {
    state.spawn.mockImplementation(() => fakeChild(0, 'SUCCESS'));
    await printRawData(Buffer.alloc(1), 'TM-T20');
    const [, , options] = lastCall();
    expect(options.env.PATH).toBe(process.env.PATH);
  });

  it('hides the console window', async () => {
    state.spawn.mockImplementation(() => fakeChild(0, 'SUCCESS'));
    await printRawData(Buffer.alloc(1), 'TM-T20');
    expect(lastCall()[2].windowsHide).toBe(true);
  });

  it('fails when the script does not report SUCCESS', async () => {
    state.spawn.mockImplementation(() => fakeChild(0, 'nothing'));
    const result = await printRawData(Buffer.alloc(1), 'TM-T20');
    expect(result.success).toBe(false);
  });

  it('reads its inputs from the environment', () => {
    expect(WINDOWS_RAW_PRINT_SCRIPT).toContain(`$env:${WINDOWS_ENV_PRINTER}`);
    expect(WINDOWS_RAW_PRINT_SCRIPT).toContain(`$env:${WINDOWS_ENV_FILE}`);
  });
});

describe('temp file handling', () => {
  it('removes the temp file after printing', async () => {
    const { existsSync } = await import('node:fs');
    state.spawn.mockImplementation(() => fakeChild(0));
    await printRawData(Buffer.alloc(1), 'TM-T20');
    const [, args] = lastCall();
    expect(existsSync(args[4])).toBe(false);
  });
});
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini tasdiqlash**

```bash
npx vitest run src/printer/raw-printer.test.ts
```

Kutilgan: `WINDOWS_RAW_PRINT_SCRIPT` eksport qilinmagani uchun import yiqiladi, hamda `node:child_process` mock'i ishga tushmaydi — manba `'child_process'` (prefiksiz) importidan foydalanadi.

- [ ] **Step 3: `raw-printer.ts` ni tuzatish**

Faylning yuqorisidagi importlarni `node:` prefiksiga va **nomlangan importlarga** oʻtkazing:

```ts
import { promises as fsp } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import type { PrintResult } from '../types';
```

Nomlangan import shart, taxminiy uslub emas: `import * as os` bilan vitest mock'i namespace'ni `default` interop orqali hal qilishi mumkin va `platform` almashtirilmay qolib ketadi — bu maʻlum tuzoq. Nomlangan import bilan mock aynan shu ikki nomni almashtiradi.

Fayl boʻyi `os.platform()` → `platform()`, `os.tmpdir()` → `tmpdir()`, `path.join(...)` → `join(...)` ga oʻzgaradi. `isRawPrintingSupported()` va `getPlatformPrintInfo()` ham `platform()` ni ishlatadi.

Fayl boshiga env nomlari va oʻzgarmas skriptni qoʻshing. **`printRawWindows` ichidagi eski template-literal skriptni butunlay oʻchiring** va uning oʻrniga shu konstantani ishlatadigan variantni yozing.

**Quyidagi blok — TypeScript template literal, `.ps1` fayl emas.** Undagi `${WINDOWS_ENV_PRINTER}` **TS darajasida** almashadi va natijada PowerShell `$env:POS_PRINTER_NAME` ni koʻradi — bu PowerShell subexpression sintaksisi emas. Blokni `.ps1` faylga koʻchirmang. Interpolyatsiya toʻgʻri tushganini Step 1 dagi `expect(WINDOWS_RAW_PRINT_SCRIPT).toContain('$env:POS_PRINTER_NAME')` testi tekshiradi.

```ts
/** Environment variable carrying the target printer name into the PowerShell script. */
export const WINDOWS_ENV_PRINTER = 'POS_PRINTER_NAME';
/** Environment variable carrying the spool file path into the PowerShell script. */
export const WINDOWS_ENV_FILE = 'POS_PRINTER_FILE';

/**
 * Raw-print helper for Windows.
 *
 * The script is a constant: the printer name and file path arrive through the
 * environment rather than being interpolated into the source. Interpolation
 * broke on any name containing a quote and was injection-shaped, and passing
 * the values as argv instead would still expose Node's Windows argument-quoting
 * edge cases (trailing backslashes, embedded quotes) — exactly the inputs being
 * guarded. The environment has no quoting surface at all.
 */
export const WINDOWS_RAW_PRINT_SCRIPT = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", CharSet = CharSet.Ansi, SetLastError = true)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", CharSet = CharSet.Ansi, SetLastError = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendBytesToPrinter(string szPrinterName, IntPtr pBytes, Int32 dwCount)
    {
        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "RAW Document";
        di.pDataType = "RAW";
        bool bSuccess = false;

        if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero))
        {
            if (StartDocPrinter(hPrinter, 1, di))
            {
                if (StartPagePrinter(hPrinter))
                {
                    int dwWritten = 0;
                    bSuccess = WritePrinter(hPrinter, pBytes, dwCount, out dwWritten);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return bSuccess;
    }

    public static bool SendFileToPrinter(string szPrinterName, string szFileName)
    {
        byte[] bytes = System.IO.File.ReadAllBytes(szFileName);
        IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
        bool bSuccess = SendBytesToPrinter(szPrinterName, pUnmanagedBytes, bytes.Length);
        Marshal.FreeCoTaskMem(pUnmanagedBytes);
        return bSuccess;
    }
}
"@

$printerName = $env:${WINDOWS_ENV_PRINTER}
$filePath = $env:${WINDOWS_ENV_FILE}

if ([string]::IsNullOrEmpty($printerName)) {
    Write-Error "${WINDOWS_ENV_PRINTER} is not set"
    exit 1
}
if ([string]::IsNullOrEmpty($filePath)) {
    Write-Error "${WINDOWS_ENV_FILE} is not set"
    exit 1
}

try {
    if ([RawPrinterHelper]::SendFileToPrinter($printerName, $filePath)) {
        Write-Output "SUCCESS"
        exit 0
    }
    Write-Error "Failed to send data to printer"
    exit 1
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
`;
```

**Takrorlab aytamiz:** `${WINDOWS_ENV_PRINTER}` interpolyatsiyalari faqat **env oʻzgaruvchi nomini** joylashtiradi — bu konstanta, foydalanuvchi kiritmasi emas. Printer nomi va fayl yoʻli skript matniga hech qachon kirmaydi.

`printRawWindows` ni almashtiring:

```ts
function printRawWindows(
  filePath: string,
  printerName: string,
  jobId: string
): Promise<PrintResult> {
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_RAW_PRINT_SCRIPT],
      {
        windowsHide: true,
        env: {
          ...process.env,
          [WINDOWS_ENV_PRINTER]: printerName,
          [WINDOWS_ENV_FILE]: filePath,
        },
      }
    );

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      if (code === 0 && stdout.includes('SUCCESS')) {
        resolve({ success: true, jobId });
      } else {
        resolve({ success: false, jobId, error: stderr || stdout || 'Print failed' });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, jobId, error: err.message });
    });
  });
}
```

`printRawData` ni async fayl operatsiyalariga oʻtkazing:

```ts
export async function printRawData(data: Buffer, printerName: string): Promise<PrintResult> {
  const jobId = `print-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const tempFile = join(tmpdir(), `receipt-${jobId}.bin`);

  // Written asynchronously: writeFileSync blocks Electron's main process, and a
  // large receipt with a logo is not a trivial write.
  await fsp.writeFile(tempFile, data);

  try {
    return platform() === 'win32'
      ? await printRawWindows(tempFile, printerName, jobId)
      : await printRawUnix(tempFile, printerName, jobId);
  } finally {
    await fsp.unlink(tempFile).catch(() => {
      // The spool job already read the file; a failed cleanup is not an error.
    });
  }
}
```

- [ ] **Step 4: `printer-manager.ts` dagi oʻlik API'ni olib tashlash**

`getPrinters()` funksiyasini butunlay oʻchiring va `getPrintersAsync()` ni soddalashtiring:

```ts
/**
 * Returns the printers Electron can see.
 *
 * The synchronous `webContents.getPrinters()` counterpart was removed in
 * Electron 21; this package requires >= 28, so there is nothing to fall back to.
 */
export async function getPrintersAsync(webContents: WebContents): Promise<PrinterInfo[]> {
  const printers = await webContents.getPrintersAsync();
  return printers.map(convertPrinterInfo);
}
```

`src/index.ts` dagi `getPrinters` eksportini oʻchiring. `src/printer/index.ts` ni tegmang — u `export * from './printer-manager'` ishlatadi, shuning uchun funksiya oʻchirilishi bilan barrel'dan ham avtomatik yoʻqoladi.

- [ ] **Step 5: Testlarni ishga tushirib oʻtishini tasdiqlash**

```bash
npx vitest run src/printer/raw-printer.test.ts
```

Agar `node:os` mock'i ishlamasa, ikki narsani tekshiring: (1) `raw-printer.ts` `platform()` ni **chaqiruv vaqtida** chaqiradi, modul yuklanganda emas — yuqoridagi `printRawData` shunday yozilgan; (2) import nomlangan (`import { platform, tmpdir }`), namespace emas.

- [ ] **Step 6: Butun toʻplam va typecheck**

```bash
npm run test:run && npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/printer/raw-printer.ts src/printer/raw-printer.test.ts src/printer/printer-manager.ts src/printer/index.ts src/index.ts
git commit -m "fix(printer)!: pass printer name via environment, not string interpolation

BREAKING: getPrinters() is removed. Its underlying Electron API disappeared in
Electron 21 while this package requires >= 28, so it silently returned [].

The Windows PowerShell script is now a constant and reads the printer name and
spool path from POS_PRINTER_NAME / POS_PRINTER_FILE. Interpolating them broke
on any name containing a quote and was injection-shaped; argv would still hit
Node's Windows argument-quoting edge cases, which are the very inputs at issue.

Spool file writes are async — writeFileSync blocked Electron's main process."
```

---

### Task 12: IPC handler — raw/html shoxlanishi

Spec §5.1, §5.5. Paketning markaziy ulanishi: hozir `setupPrinterIPC()` har doim HTML orqali ketadi, garchi hujjatlar raw ESC/POS deb yozsa ham.

**Files:**
- Modify: `src/electron/main.ts`
- Test: `src/electron/main.test.ts`

**Interfaces:**
- Consumes: `buildESCPOSData` (Task 8), `printRawData` (Task 11), `buildHTML`/`printHTML` (mavjud)
- Produces:
  - `setupPrinterIPC(): void` — `mode` ga qarab shoxlanadi
  - `print(window: BrowserWindow | null, contents, config): Promise<PrintResult>`
  - `printRaw(contents: PrintContent[], config: PrinterConfig): Promise<PrintResult>` — **yangi**, `BrowserWindow` talab qilmaydi

- [ ] **Step 1: Failing testni yozish**

`src/electron/main.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  removeHandler: vi.fn(),
  fromWebContents: vi.fn(),
  printRawData: vi.fn(),
  printHTML: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle, removeHandler: mocks.removeHandler },
  BrowserWindow: { fromWebContents: mocks.fromWebContents },
}));

vi.mock('../printer/raw-printer', () => ({ printRawData: mocks.printRawData }));
vi.mock('../printer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../printer')>();
  return { ...actual, printHTML: mocks.printHTML };
});

const { setupPrinterIPC, printRaw } = await import('./main');
const { IPC_CHANNELS } = await import('../types');
import type { PrintContent, PrinterConfig } from '../types';

/** Returns the handler registered for a channel. */
function handlerFor(channel: string) {
  const call = mocks.handle.mock.calls.find(([name]) => name === channel);
  if (!call) throw new Error(`no handler registered for ${channel}`);
  return call[1] as (event: unknown, ...args: unknown[]) => Promise<unknown>;
}

const CONTENTS: PrintContent[] = [{ type: 'text', value: 'Hi' }];
const baseConfig: PrinterConfig = { printerName: 'TM-T20', paperWidth: 80 };
const fakeEvent = { sender: {} };

beforeEach(() => {
  mocks.handle.mockReset();
  mocks.fromWebContents.mockReset();
  mocks.printRawData.mockReset();
  mocks.printHTML.mockReset();
  mocks.printRawData.mockResolvedValue({ success: true, jobId: 'raw-1' });
  mocks.printHTML.mockResolvedValue({ success: true, jobId: 'html-1' });
  setupPrinterIPC();
});

describe('print handler', () => {
  it('takes the raw path by default', async () => {
    const result = await handlerFor(IPC_CHANNELS.PRINT)(fakeEvent, CONTENTS, baseConfig);
    expect(mocks.printRawData).toHaveBeenCalledTimes(1);
    expect(mocks.printHTML).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, mode: 'raw' });
  });

  it('does not look for a window in raw mode', async () => {
    await handlerFor(IPC_CHANNELS.PRINT)(fakeEvent, CONTENTS, baseConfig);
    expect(mocks.fromWebContents).not.toHaveBeenCalled();
  });

  it('succeeds in raw mode even when no window exists', async () => {
    mocks.fromWebContents.mockReturnValue(null);
    const result = await handlerFor(IPC_CHANNELS.PRINT)(fakeEvent, CONTENTS, baseConfig);
    expect(result).toMatchObject({ success: true });
  });

  it('sends ESC/POS bytes starting with ESC @ to the printer', async () => {
    await handlerFor(IPC_CHANNELS.PRINT)(fakeEvent, CONTENTS, baseConfig);
    const [data, printerName] = mocks.printRawData.mock.calls[0];
    expect(Buffer.isBuffer(data)).toBe(true);
    expect([...(data as Buffer).subarray(0, 2)]).toEqual([0x1b, 0x40]);
    expect(printerName).toBe('TM-T20');
  });

  it('passes the codepage through to the builder', async () => {
    await handlerFor(IPC_CHANNELS.PRINT)(fakeEvent, [{ type: 'text', value: 'П' }], {
      ...baseConfig,
      codepage: 'PC866',
    });
    const [data] = mocks.printRawData.mock.calls[0];
    // ESC t 17 immediately after ESC @, and П as the single byte 0x8F
    expect([...(data as Buffer).subarray(0, 5)]).toEqual([0x1b, 0x40, 0x1b, 0x74, 0x11]);
    expect((data as Buffer).includes(0x8f)).toBe(true);
  });

  it('takes the html path when asked', async () => {
    mocks.fromWebContents.mockReturnValue({ webContents: {} });
    const result = await handlerFor(IPC_CHANNELS.PRINT)(fakeEvent, CONTENTS, {
      ...baseConfig,
      mode: 'html',
    });
    expect(mocks.printHTML).toHaveBeenCalledTimes(1);
    expect(mocks.printRawData).not.toHaveBeenCalled();
    expect(result).toMatchObject({ mode: 'html' });
  });

  it('fails with a clear error when html mode has no window', async () => {
    mocks.fromWebContents.mockReturnValue(null);
    const result = await handlerFor(IPC_CHANNELS.PRINT)(fakeEvent, CONTENTS, {
      ...baseConfig,
      mode: 'html',
    });
    expect(result).toMatchObject({ success: false, mode: 'html' });
    expect((result as { error: string }).error).toMatch(/window/i);
  });

  it('turns a build error into a failed result rather than throwing', async () => {
    const result = await handlerFor(IPC_CHANNELS.PRINT)(fakeEvent, [
      { type: 'barcode', value: 'nope', options: { type: 'EAN13' } },
    ], baseConfig);
    expect(result).toMatchObject({ success: false, mode: 'raw' });
    expect((result as { error: string }).error).toMatch(/EAN13/);
  });
});

describe('printRaw', () => {
  it('prints without a BrowserWindow', async () => {
    const result = await printRaw(CONTENTS, baseConfig);
    expect(mocks.printRawData).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true, mode: 'raw' });
  });
});
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini tasdiqlash**

```bash
npx vitest run src/electron/main.test.ts
```

Kutilgan: `printRaw` eksport qilinmagani uchun import yiqiladi; qolgan testlar HTML yoʻli hamisha tanlangani uchun yiqiladi.

- [ ] **Step 3: `main.ts` ni tuzatish**

Importlarni yangilang:

```ts
import { ipcMain, BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { PrinterConfig, PrintContent, PrintResult, PrinterInfo, PrintMode } from '../types';
import { IPC_CHANNELS, DEFAULTS } from '../types';
import { getPrintersAsync, printHTML, createDefaultConfig } from '../printer';
import { printRawData } from '../printer/raw-printer';
import { buildESCPOSData } from '../commands/escpos-builder';
import { buildHTML } from '../utils/html-builder';
```

`setupPrinterIPC` dan **oldin** umumiy yordamchilarni qoʻshing:

```ts
/** Builds the ESC/POS bytes for a config and sends them to the printer. */
async function printViaRaw(
  contents: PrintContent[],
  config: PrinterConfig
): Promise<PrintResult> {
  const data = buildESCPOSData(contents, {
    paperWidth: config.paperWidth,
    codepage: config.codepage,
    codepageTable: config.codepageTable,
    charsPerLine: config.charsPerLine,
  });
  const result = await printRawData(data, config.printerName);
  return { ...result, mode: 'raw' };
}

/** Renders the contents as HTML and prints them through Electron. */
async function printViaHTML(
  window: BrowserWindow | null,
  contents: PrintContent[],
  config: PrinterConfig
): Promise<PrintResult> {
  if (!window) {
    return { success: false, jobId: '', error: 'No window available for html mode', mode: 'html' };
  }
  const html = buildHTML(contents, config.paperWidth);
  const result = await printHTML(window, html, config);
  return { ...result, mode: 'html' };
}

function failed(mode: PrintMode, error: unknown): PrintResult {
  return {
    success: false,
    jobId: '',
    error: error instanceof Error ? error.message : 'Unknown error',
    mode,
  };
}
```

`setupPrinterIPC` ning PRINT handleri:

```ts
  ipcMain.handle(
    IPC_CHANNELS.PRINT,
    async (
      event: IpcMainInvokeEvent,
      contents: PrintContent[],
      config: PrinterConfig
    ): Promise<PrintResult> => {
      const mode = config.mode ?? DEFAULTS.MODE;
      try {
        // Raw printing talks to the spooler directly — it needs no window, so
        // the lookup only happens on the html branch.
        if (mode === 'raw') {
          return await printViaRaw(contents, config);
        }
        return await printViaHTML(BrowserWindow.fromWebContents(event.sender), contents, config);
      } catch (error) {
        return failed(mode, error);
      }
    }
  );
```

`print()` va yangi `printRaw()`:

```ts
/**
 * Prints from the main process. `window` is only needed for html mode and may
 * be null when `config.mode` is `'raw'`.
 */
export async function print(
  window: BrowserWindow | null,
  contents: PrintContent[],
  config: PrinterConfig
): Promise<PrintResult> {
  const mode = config.mode ?? DEFAULTS.MODE;
  try {
    return mode === 'raw'
      ? await printViaRaw(contents, config)
      : await printViaHTML(window, contents, config);
  } catch (error) {
    return failed(mode, error);
  }
}

/** Prints raw ESC/POS from the main process. Needs no BrowserWindow. */
export async function printRaw(
  contents: PrintContent[],
  config: PrinterConfig
): Promise<PrintResult> {
  try {
    return await printViaRaw(contents, config);
  } catch (error) {
    return failed('raw', error);
  }
}
```

`printRawHTML` oʻzgarmaydi. Fayl oxiridagi eksport satrini yangilang:

```ts
export { getPrintersAsync, createDefaultConfig };
```

- [ ] **Step 4: Testlarni ishga tushirib oʻtishini tasdiqlash**

```bash
npx vitest run src/electron/main.test.ts
```

- [ ] **Step 5: Butun toʻplam va typecheck**

```bash
npm run test:run && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/electron/main.ts src/electron/main.test.ts
git commit -m "feat(electron)!: route the print IPC through raw ESC/POS by default

BREAKING: setupPrinterIPC() now produces raw ESC/POS. Pass mode: 'html' to keep
the previous hidden-BrowserWindow behaviour.

The README advertised raw ESC/POS while buildESCPOSData and printRawData were
unreachable from the built-in IPC path — everything went through buildHTML and
printHTML instead. The handler now branches on config.mode, and the
BrowserWindow lookup moved onto the html branch, since raw printing talks to
the spooler and never needed a window.

Adds printRaw(contents, config) for main-process use without a window, and
print() now accepts a null window in raw mode."
```

---

### Task 13: Eksportlar, versiya va hujjatlar

Spec §8. Paketning ommaviy yuzasi va hujjatlari haqiqatga keltiriladi.

**Files:**
- Modify: `src/index.ts`, `src/commands/index.ts`, `src/utils/index.ts`, `src/printer/index.ts`
- Modify: `package.json`, `README.md`, `CLAUDE.md`
- Create: `CHANGELOG.md`

**Interfaces:**
- Produces: `2.0.0` ommaviy yuzasi

- [ ] **Step 1: `src/index.ts` ni toʻliq almashtirish**

Ikki tuzoq bor, shuning uchun fayl qoʻshimchalar bilan emas, butunlay almashtiriladi:

- **`Codepage` tipini ikki marta eksport qilmang.** U Task 4 da `types/index.ts` orqali chiqadi, `src/index.ts` esa `export * from './types'` qiladi. Uni yana `./commands/codepage` dan eksport qilish `.d.ts` build'ini yiqitadi.
- **`getCharsPerLine`** `printer-manager.ts` va `utils/format.ts` da ikkalasida ham mavjud. U faqat `./printer` dan eksport qilinadi — `./utils/format` roʻyxatiga qoʻshmang.

`src/index.ts` ni quyidagi mazmun bilan almashtiring:

```ts
/**
 * @madrimov/electron-pos-printer
 *
 * Thermal POS printer support for Electron, with raw ESC/POS output.
 * Supports 58mm and 80mm printers.
 */

// Types. Also re-exports the Codepage type — do not export it again below.
export * from './types';

// ESC/POS commands
export {
  Commands,
  toBuffer,
  concat,
  ESC,
  GS,
  LF,
  NUL,
  CR,
  HT,
  FF,
  FS,
  DLE,
} from './commands/esc-pos';

// ESC/POS builder
export { buildESCPOSData, validateBarcodeValue } from './commands/escpos-builder';
export type { BuildESCPOSOptions } from './commands/escpos-builder';

// Codepage encoding
export {
  CODEPAGES,
  CODEPAGE_TABLES,
  CODEPAGE_ESC_T,
  TRANSLIT,
  isEncodable,
  normalizeForCodepage,
  encodeText,
  selectCodepage,
  resolveCodepage,
} from './commands/codepage';

// Printer utilities
export {
  getPrintersAsync,
  findPrinter,
  getDefaultPrinter,
  printerExists,
  getCharsPerLine,
  getPageWidthPixels,
  createDefaultConfig,
  toElectronPrintOptions,
  printHTML,
} from './printer';

// Raw printing
export {
  printRawData,
  isRawPrintingSupported,
  getPlatformPrintInfo,
  WINDOWS_ENV_PRINTER,
  WINDOWS_ENV_FILE,
} from './printer/raw-printer';

// Formatting utilities
export {
  formatCurrency,
  padString,
  createLine,
  wordWrap,
  formatTableRow,
  calculateColumnWidths,
  truncate,
  formatDate,
} from './utils/format';

// HTML builder
export { buildHTML } from './utils/html-builder';

// Debug helper
export { dumpESCPOS } from './utils/hex-dump';

// Receipt builder
export { ReceiptBuilder, createReceipt } from './utils/receipt-builder';

// Electron integration — main process
export { setupPrinterIPC, removePrinterIPC, print, printRaw, printRawHTML } from './electron/main';

// Electron integration — preload
export { exposePosPrinterAPI, getPosPrinterAPI } from './electron/preload';
export type { PosPrinterAPI } from './electron/preload';

// Electron integration — renderer
export { PosPrinter, createPosPrinter, isPosPrinterAvailable } from './electron/renderer';
```

Takroriy eksport nomi qolmaganini tekshirish:

```bash
npm run typecheck && npx tsup --dts
```

`tsup` ning `dts` bosqichi takroriy eksportlarni aniqlaydi. Xato boʻlsa, nomni faqat bitta manbadan eksport qiling.

- [ ] **Step 2: `package.json` versiyasini koʻtarish**

```bash
npm version 2.0.0 --no-git-tag-version
```

- [ ] **Step 3: `CHANGELOG.md` yozish**

```markdown
# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-08-19

### Breaking

- `setupPrinterIPC()` now prints raw ESC/POS instead of rendering HTML in a
  hidden `BrowserWindow`. Pass `mode: 'html'` in `PrinterConfig` to restore the
  previous behaviour.
- `buildESCPOSData(contents, paperWidth)` becomes
  `buildESCPOSData(contents, { paperWidth, codepage, codepageTable, charsPerLine })`.
- `ESCPOSCommands` is removed. Use `Commands` from the package root.
- Every value in `Commands` is now a `Buffer` rather than a `number[]`.
- `Commands.CHARSET` is removed. Use `selectCodepage()`.
- `encodeText(text, encoding)` is replaced by `encodeText(text, codepage)`, which
  transcodes to a printer codepage instead of wrapping `Buffer.from`.
- `getPrinters(webContents)` is removed — the Electron API it relied on was
  removed in Electron 21 and it silently returned `[]`. Use `getPrintersAsync()`.
- `print(window, contents, config)` accepts `null` for `window` in raw mode.
- `cut(true)` now performs a real partial cut. It previously emitted
  `GS V 65 0`, which feeds and then cuts *fully*.

### Added

- Codepage support for raw printing: `PC437`, `PC850`, `PC852`, `PC860`,
  `PC863`, `PC865`, `PC866`, `WPC1252`, `CP1251`. Tables are generated from the
  Unicode Consortium's official vendor mappings.
- Transliteration for characters no codepage carries — Uzbek Latin `oʻ`/`gʻ`
  (U+02BB), Uzbek Cyrillic `ғ`/`қ`/`ҳ`, and typographic punctuation.
- `PrinterConfig.mode`, `PrinterConfig.codepage`, `PrinterConfig.codepageTable`.
- `PrintResult.mode` reports which path produced the result.
- `printRaw(contents, config)` for main-process printing without a window.
- `dumpESCPOS(data, options)` renders a byte stream as annotated, readable text.
- `validateBarcodeValue(type, value)` rejects data that would otherwise hang
  some printers.
- `charsPerLine` is honoured by the builder — useful for 42-column printers.
- `Commands.PAPER.CUT_FEED_FULL(n)` and `Commands.PAPER.CUT_FEED_PARTIAL(n)`.

### Fixed

- Text is transcoded to the selected codepage instead of being sent as UTF-8,
  which most thermal printers cannot decode. Cyrillic and Uzbek text printed as
  garbage before this.
- `Commands.BARCODE.PRINT` used the NUL-terminated form with type codes 65-73,
  which the specification reserves for the length-prefixed form.
- `Commands.IMAGE.RASTER` did not round `width / 8` up, so any width that is not
  a multiple of 8 produced a fractional byte count and threw.
- `Commands.QRCODE.MODEL` sent the raw number `2` instead of the character code
  `0x32`, so model selection did nothing.
- QR model selection was never emitted by the builder at all.
- Column padding is computed on transliterated text, so an ellipsis expanding to
  three dots no longer shifts every column after it.
- The Windows PowerShell helper no longer interpolates the printer name and file
  path into its own source. They travel through `POS_PRINTER_NAME` and
  `POS_PRINTER_FILE` instead, which has no quoting surface.
- The spool file is written asynchronously instead of blocking the main process.
- A literal `{` in a `CODE128` value is doubled, as the specification requires.

### Removed

- The `[IMAGE]` placeholder. Image content now emits nothing until raster image
  support lands; printing the literal text `[IMAGE]` on a receipt was a defect.

### Notes

- Image printing, cash drawer and beeper support are planned for the next
  release. Network (TCP/IP) printing, printer status and a print queue follow
  after that.
```

- [ ] **Step 4: README ni yangilash**

Toʻrtta oʻzgarish:

1. Oʻrnatish buyrugʻini tuzating: `npm install @madrimov/electron-pos-printer`.

2. Quick Start'ni paketning oʻz API'siga oʻtkazing:

```markdown
### 1. Main process

```ts
import { app } from 'electron';
import { setupPrinterIPC } from '@madrimov/electron-pos-printer';

app.whenReady().then(() => {
  setupPrinterIPC();
});
```

### 2. Preload script

```ts
import { exposePosPrinterAPI } from '@madrimov/electron-pos-printer';

exposePosPrinterAPI();
```

### 3. Renderer

```ts
import { createPosPrinter, createReceipt } from '@madrimov/electron-pos-printer';

const printer = createPosPrinter();
const printers = await printer.getPrinters();

const receipt = createReceipt(80)
  .textCenter('MY SHOP', { bold: true, size: 'double' })
  .dashedLine()
  .itemRow('Coffee', 2, 15000)
  .totalRow('TOTAL', 30000)
  .feed(2)
  .cut();

await printer.print(receipt.getContents(), {
  printerName: printers[0].name,
  paperWidth: 80,
});
```
```

3. Yangi **Codepages and languages** boʻlimini qoʻshing:

```markdown
## Codepages and languages

Thermal printers do not understand UTF-8. Text is transcoded to a single-byte
codepage, selected with `codepage`:

```ts
await printer.print(contents, {
  printerName: 'TM-T20',
  paperWidth: 80,
  codepage: 'PC866', // Cyrillic
});
```

| Name | `ESC t` | Coverage |
|---|---|---|
| `PC437` | 0 | US / Western European (default) |
| `PC850` | 2 | Multilingual Latin 1 |
| `PC860` | 3 | Portuguese |
| `PC863` | 4 | Canadian French |
| `PC865` | 5 | Nordic |
| `WPC1252` | 16 | Windows Western European |
| `PC866` | 17 | Cyrillic |
| `PC852` | 18 | Latin 2 |
| `CP1251` | 46 | Windows Cyrillic — see below |

`CP1251` is the one entry whose `ESC t` value is not standardised; 46 is the
most common. If your printer disagrees, pass the number your vendor documents
and say which table to encode with:

```ts
{ codepage: 73, codepageTable: 'CP1251' }
```

### Characters no codepage carries

Some characters exist in no ESC/POS codepage. Rather than printing question
marks, they are transliterated:

| Input | Printed |
|---|---|
| `oʻ`, `gʻ` (U+02BB) | `o'`, `g'` |
| `ғ`, `қ`, `ҳ` | `г`, `к`, `х` |
| `“ ” ‘ ’` | `" '` |
| `– —` | `-` |
| `…` | `...` |

Anything with no substitution prints as `?`.

**Uzbek Cyrillic note:** `ў` is present in both `PC866` and `CP1251` and prints
correctly. `ғ`, `қ` and `ҳ` are not, so they lose their diacritics. Printing
them exactly requires rendering the text as an image, which is planned for the
next release.

To see what the printer will actually receive:

```ts
import { buildESCPOSData, dumpESCPOS } from '@madrimov/electron-pos-printer';

console.log(dumpESCPOS(buildESCPOSData(contents, { codepage: 'PC866' }), { table: 'PC866' }));
```
```

4. Yangi **Print modes** boʻlimini qoʻshing:

```markdown
## Print modes

| | `raw` (default) | `html` |
|---|---|---|
| Output | ESC/POS bytes to the spooler | HTML rendered in a hidden window |
| Precise printer control | yes | no |
| Needs a BrowserWindow | no | yes |
| Barcodes and QR codes | printed by the printer | placeholders only |

`printerName`, `paperWidth` and `charsPerLine` apply to both modes.
`codepage` and `codepageTable` apply to `raw` only. `silent`, `preview`,
`margin` and `pageSize` apply to `html` only and are ignored in `raw` mode.
```

5. Yangi **Migrating from 1.x** boʻlimini qoʻshing:

```markdown
## Migrating from 1.x

| 1.x | 2.0 |
|---|---|
| `buildESCPOSData(contents, 80)` | `buildESCPOSData(contents, { paperWidth: 80 })` |
| `ESCPOSCommands` | `Commands` |
| `Commands.*` is `number[]` | `Commands.*` is `Buffer` |
| `Commands.CHARSET.PC866` | `selectCodepage(17)` or `codepage: 'PC866'` |
| `encodeText(text, 'utf8')` | `encodeText(text, 'PC866')` |
| `getPrinters(webContents)` | `getPrintersAsync(webContents)` |
| IPC printed HTML | IPC prints raw; pass `mode: 'html'` for the old path |
| `cut(true)` cut fully | `cut(true)` cuts partially, as documented |

See [CHANGELOG.md](./CHANGELOG.md) for the full list.
```

- [ ] **Step 5: `CLAUDE.md` ni yangilash**

`Architecture` boʻlimida:

- `src/commands/codepage.ts` va `codepage-tables.ts` ni qoʻshing, generator skriptni eslatib oʻting
- `Electron Integration` ostida: `setupPrinterIPC()` `config.mode` ga qarab raw yoki HTML shoxiga ketadi, default raw
- `Key Components` ga `dumpESCPOS` ni qoʻshing
- Yangi boʻlim: `Encoding pipeline` — NFC → translit → layout → encode tartibi va nima uchun layout translitdan keyin
- `Paper Width Support` ostiga `charsPerLine` bilan bekor qilish mumkinligini yozing

- [ ] **Step 6: Toʻliq tekshiruv**

```bash
npm run test:run && npm run typecheck && npm run build
```

`npm run build` birinchi marta ishga tushiriladi — `dts` bosqichi eksport toʻqnashuvlarini aniqlaydi.

- [ ] **Step 7: Commit**

```bash
git add src/index.ts src/commands/index.ts src/utils/index.ts src/printer/index.ts package.json README.md CLAUDE.md CHANGELOG.md
git commit -m "docs: document v2.0.0 and align the docs with the code

The README advertised raw ESC/POS printing that the built-in IPC path did not
use, and told users to install 'electron-pos-printer' rather than the scoped
package name. Quick Start now uses setupPrinterIPC() instead of showing users
how to hand-roll the IPC layer.

Adds a codepage and language section — including the Uzbek caveat that ғ, қ and
ҳ lose their diacritics — a print-mode comparison, and a 1.x migration table.
CHANGELOG.md starts here, at the first breaking release."
```

---

### Task 14: `example/` ilovasini paketga ulash

Spec §8.6. Bu task spec'da yumshoq taʻriflangan, lekin holat undan ogʻirroq: `example/main.js` kutubxonaning **toʻliq nusxasi** — `buildESCPOS`, `printRaw`, PowerShell skripti va `buildHTML` hammasi qayta yozilgan. `example/package.json` paketga umuman bogʻlanmagan. Yaʻni misol kutubxonani hech qachon sinamagan, va u ESC/POS jadvalining toʻrtinchi nusxasi hamda PowerShell injection bugining ikkinchi nusxasi.

**Files:**
- Modify: `example/package.json`, `example/main.js`, `example/preload.js`, `example/index.html`

**Interfaces:**
- Consumes: qurilgan `dist/` (Task 13 dagi `npm run build`)

- [ ] **Step 1: Paketni qurish va misolni unga bogʻlash**

```bash
npm run build
```

`example/package.json` ni almashtiring:

```json
{
  "name": "pos-printer-example",
  "version": "2.0.0",
  "main": "main.js",
  "private": true,
  "scripts": {
    "start": "electron ."
  },
  "dependencies": {
    "@madrimov/electron-pos-printer": "file:.."
  },
  "devDependencies": {
    "electron": "^34.0.0"
  }
}
```

```bash
cd example && npm install && cd ..
```

- [ ] **Step 2: `example/main.js` ni almashtirish**

Butun faylni quyidagiga almashtiring. Kutubxonaning takrorlangan nusxasi (`buildESCPOS`, `printRaw`, `printRawWindows`, `printRawUnix`, `CMD`, `calculateColumnWidths`, `buildHTML`, `escapeHtml`) **butunlay oʻchiriladi**:

```js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { writeFileSync } = require('fs');
const {
  setupPrinterIPC,
  buildESCPOSData,
  dumpESCPOS,
} = require('@madrimov/electron-pos-printer');

/** Extra channel used only by this example, to inspect output without a printer. */
const DUMP_CHANNEL = 'example:dump';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools();
}

/**
 * Writes the annotated dump of a receipt to disk instead of printing it.
 * Useful for checking codepage output when no thermal printer is available.
 */
function setupDumpIPC() {
  ipcMain.handle(DUMP_CHANNEL, async (_event, contents, config) => {
    const data = buildESCPOSData(contents, {
      paperWidth: config.paperWidth,
      codepage: config.codepage,
      codepageTable: config.codepageTable,
    });
    const target = path.join(app.getPath('downloads'), 'receipt-dump.txt');
    writeFileSync(target, dumpESCPOS(data, { table: config.codepageTable || config.codepage }), 'utf8');
    return { path: target, bytes: data.length };
  });
}

app.whenReady().then(() => {
  setupPrinterIPC();
  setupDumpIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 3: `example/preload.js` ni almashtirish**

```js
const { contextBridge, ipcRenderer } = require('electron');
const { exposePosPrinterAPI } = require('@madrimov/electron-pos-printer');

exposePosPrinterAPI();

// Example-only extra: dump to a file instead of printing.
contextBridge.exposeInMainWorld('examplePrinter', {
  dump: (contents, config) => ipcRenderer.invoke('example:dump', contents, config),
});
```

- [ ] **Step 4: `example/index.html` ni yangilash**

Uch oʻzgarish:

1. Printer roʻyxati yoniga codepage tanlash roʻyxatini qoʻshing:

```html
<label for="codepage">Codepage</label>
<select id="codepage">
  <option value="PC437">PC437 — Western (default)</option>
  <option value="PC866" selected>PC866 — Cyrillic</option>
  <option value="CP1251">CP1251 — Windows Cyrillic</option>
  <option value="PC852">PC852 — Latin 2</option>
  <option value="WPC1252">WPC1252 — Windows Western</option>
</select>
```

2. Har bir `window.posPrinter.print(...)` chaqiruvining config obyektiga `codepage` ni qoʻshing:

```js
const config = {
  printerName: document.getElementById('printer').value,
  paperWidth: Number(document.getElementById('paperWidth').value) || 80,
  codepage: document.getElementById('codepage').value,
};
```

3. Kirill va oʻzbek matnli namuna chek hamda «Dump to file» tugmasini qoʻshing:

```html
<button id="sample">Print sample (Cyrillic + Uzbek)</button>
<button id="dump">Dump to file</button>
<pre id="dumpResult"></pre>
```

```js
function sampleContents() {
  return [
    { type: 'text', value: 'Магазин «Дўкон»', style: { align: 'center', bold: true, size: 'double' } },
    { type: 'text', value: 'Toshkent shahri, Chilonzor', style: { align: 'center' } },
    { type: 'line', character: '-' },
    { type: 'table', rows: [
      [{ text: 'Товар', width: '50%', bold: true }, { text: 'Кол', width: '15%', align: 'center', bold: true }, { text: 'Сумма', width: '35%', align: 'right', bold: true }],
      [{ text: 'Кофе', width: '50%' }, { text: '2', width: '15%', align: 'center' }, { text: '30 000', width: '35%', align: 'right' }],
      [{ text: 'Choy — koʻk', width: '50%' }, { text: '1', width: '15%', align: 'center' }, { text: '12 000', width: '35%', align: 'right' }],
    ] },
    { type: 'line', character: '=' },
    { type: 'table', rows: [[{ text: 'ИТОГО', bold: true }, { text: '42 000', align: 'right', bold: true }]] },
    { type: 'text', value: 'Toʻlov: naqd · Rahmat!', style: { align: 'center' } },
    { type: 'qrcode', value: 'https://madrimov.uz', options: { size: 6, align: 'center' } },
    { type: 'feed', lines: 2 },
    { type: 'cut', partial: true },
  ];
}

document.getElementById('sample').addEventListener('click', async () => {
  const result = await window.posPrinter.print(sampleContents(), config());
  console.log('print result', result);
});

document.getElementById('dump').addEventListener('click', async () => {
  const { path, bytes } = await window.examplePrinter.dump(sampleContents(), config());
  document.getElementById('dumpResult').textContent = `Wrote ${bytes} bytes of ESC/POS. Dump: ${path}`;
});
```

`config()` funksiyasini yuqoridagi 2-punktdagi obyektni qaytaradigan qilib yozing.

- [ ] **Step 5: Misolni ishga tushirib tekshirish**

```bash
cd example && npm start
```

Tekshiring:

- Printer roʻyxati toʻlanadi (kamida bitta printer, yoki CUPS'da PDF printer)
- «Dump to file» tugmasi bosilganda Downloads papkasiga `receipt-dump.txt` yoziladi
- Dump ichida `ESC t 17  Select character table (PC866)` satri bor
- Kirill matni dump'da toʻgʻri oʻqiladi (`"Магазин «Дўкон»"`)
- `Choy — koʻk` satrida em dash `-` ga, `ʻ` esa `'` ga aylanganini koʻring
- Hech qanday `unknown byte` satri yoʻq

Ilova ishga tushmasa yoki `Cannot find module` xatosi chiqsa: `npm run build` ni ildizda qayta ishga tushirib, `example/` da `npm install` ni takrorlang.

- [ ] **Step 6: Commit**

```bash
git add example/
git commit -m "refactor(example): depend on the package instead of reimplementing it

example/main.js was a full copy of the library in plain JS — its own ESC/POS
command table, its own raw-print layer with the same PowerShell interpolation
defect, and its own HTML builder. It imported nothing from the package, so it
never exercised the code it was meant to demonstrate.

It now calls setupPrinterIPC() and exposePosPrinterAPI(). Adds a codepage
selector, a Cyrillic and Uzbek sample receipt, and a 'Dump to file' button that
writes dumpESCPOS() output — the only way to inspect real encoder behaviour
without a thermal printer on hand."
```

---

## Yakuniy tekshiruv

Barcha tasklar bajarilgandan keyin:

- [ ] `npm run test:run` — barcha testlar oʻtadi
- [ ] `npm run typecheck` — xatosiz
- [ ] `npm run build` — CJS, ESM va `.d.ts` muvaffaqiyatli chiqadi
- [ ] `git log --oneline` — har bir task oʻz commit'iga ega
- [ ] Spec §11 dagi bajarilganlik mezonining sakkiz punkti ham qanoatlantirilgan

Soʻng `superpowers:finishing-a-development-branch` skill'i bilan branch'ni yakunlash boʻyicha qarorga oʻtiladi.
