# electron-pos-printer

A powerful thermal POS printer library for Electron applications. Supports 58mm and 80mm thermal printers with raw ESC/POS commands.

## Features

- **Cross-platform**: Works on Windows, macOS, and Linux
- **Raw ESC/POS printing**: Direct thermal printer control
- **Support for 58mm and 80mm** thermal printers
- **Fluent API** for building receipts
- **Barcode and QR code** support
- **Table formatting** with automatic column widths
- **Codepage encoding** for Cyrillic, Uzbek and other non-Latin text
- **Full TypeScript** support
- **Works with Electron 28+**

## Installation

```bash
npm install @madrimov/electron-pos-printer
```

## Quick Start

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

`setupPrinterIPC()` registers the IPC handlers that `print()` above talks to.
By default it builds raw ESC/POS bytes and sends them straight to the printer;
see [Print modes](#print-modes) to render HTML instead.

## Using ReceiptBuilder directly from the main process

`printer.print()` above round-trips through IPC. If you are printing from the
main process itself — a scheduled job, a background sync — call `printRaw()`
directly instead; it needs no `BrowserWindow`.

```typescript
import { createReceipt, printRaw } from '@madrimov/electron-pos-printer';

const receipt = createReceipt(80) // 80mm paper
  .setCurrency({ symbol: '$', symbolPosition: 'before' })
  .title('MY STORE')
  .textCenter('123 Main Street')
  .textCenter('Tel: (555) 123-4567')
  .line()
  .tableRow([
    { text: 'Item', width: '60%', bold: true },
    { text: 'Price', width: '40%', align: 'right', bold: true },
  ])
  .dashedLine()
  .row('Coffee', '$4.50')
  .row('Sandwich', '$8.99')
  .doubleLine()
  .totalRow('TOTAL:', 13.49)
  .feed(2)
  .qrcode('https://receipt.example.com/123')
  .feed(3)
  .cut();

await printRaw(receipt.getContents(), { printerName: 'POS-80', paperWidth: 80 });
```

## API Reference

### Content Types

| Type | Description | Properties |
|------|-------------|------------|
| `text` | Text content | `value`, `style` |
| `line` | Line separator | `character` |
| `table` | Table rows | `rows` |
| `feed` | Paper feed | `lines` |
| `cut` | Cut paper | `partial` |
| `barcode` | Barcode | `value`, `options` |
| `qrcode` | QR Code | `value`, `options` |

### Text Styles

```typescript
interface TextStyle {
  bold?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  size?: 'normal' | 'double-height' | 'double-width' | 'double';
  invert?: boolean;
}
```

### ReceiptBuilder Methods

| Method | Description |
|--------|-------------|
| `text(value, style?)` | Add text |
| `textCenter(value)` | Add centered text |
| `textBold(value)` | Add bold text |
| `title(value)` | Large centered bold text |
| `line(char?)` | Line separator |
| `dashedLine()` | Dashed line |
| `doubleLine()` | Double line (===) |
| `feed(lines?)` | Feed paper |
| `cut(partial?)` | Cut paper |
| `tableRow(columns)` | Add table row |
| `row(label, value)` | Two-column row |
| `totalRow(label, amount)` | Bold total row |
| `barcode(value, options?)` | Add barcode |
| `qrcode(value, options?)` | Add QR code |

Barcode values are validated before any byte is sent — malformed data hangs
some printers outright rather than failing gracefully. Call
`validateBarcodeValue(type, value)` yourself to check a value ahead of time.
`CODE39` accepts an optional matched pair of `*` as its start/stop delimiter
(`ABC-123` and `*ABC*` are both valid; `AB*CD` and `*ABC` are not), because the
printer adds the delimiter itself when it is absent.

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
marks, they are transliterated — a substitution is only used when the
character itself cannot be encoded in the selected codepage, so the same
input can print differently depending on `codepage`:

| Input | Printed |
|---|---|
| `oʻ`, `gʻ` (U+02BB) | `o'`, `g'` |
| `ғ`, `қ`, `ҳ` | `г`, `к`, `х` |
| `« »` | `"` |
| `“ ” ‘ ’` | `" '` |
| `– —` | `-` |
| `…` | `...` |
| `№` | `No` |
| `₽`, `€` | `RUB`, `EUR` |

Anything with no substitution prints as `?`.

The guillemets (`«` `»`) are worth calling out on their own: they are the
standard quotation marks in Russian and Uzbek Cyrillic text, but `PC866` — the
codepage a Cyrillic user is likely to select — does not carry them, so
`«Дўкон»` would otherwise print as `?Дўкон?`. On codepages that do carry them
(`PC437`, `PC852`, `CP1251`, `WPC1252`) they print as real guillemets, because
the transliteration table is only consulted when a character is unencodable.

One exception to that "only when unencodable" rule: the no-break space
(U+00A0), thin space (U+2009) and narrow no-break space (U+202F) always become
a plain ASCII space, even though every codepage carries NBSP too (at `0xFF` on
most tables, `0xA0` on `WPC1252` and `CP1251`). Real printers render that byte
inconsistently — a space, a filled block, or nothing — and the non-breaking
semantics of NBSP mean nothing on a fixed-width receipt line, so it is always
normalized rather than passed through.

**Uzbek Cyrillic note:** `ў` is carried by both `PC866` (`0xF7`) and `CP1251`
(`0xA2`) and prints correctly. `ғ`, `қ` and `ҳ` are not carried by any
codepage, so they lose their diacritics and fall back to `г`, `к`, `х`.
Printing them exactly requires rendering the text as an image, which is
planned for a future release.

To see what the printer will actually receive:

```ts
import { buildESCPOSData, dumpESCPOS } from '@madrimov/electron-pos-printer';

console.log(dumpESCPOS(buildESCPOSData(contents, { codepage: 'PC866' }), { table: 'PC866' }));
```

`dumpESCPOS()` is the general-purpose way to debug a print job: it renders a
raw ESC/POS byte stream as annotated, human-readable text — commands, control
codes and the decoded text bytes — so you can see exactly what would be sent
to the printer without holding a physical one.

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

`raw` mode needs no `BrowserWindow` at all — `printRaw(contents, config)` can
be called straight from the main process. `print(window, contents, config)`
accepts `null` for `window` when `config.mode` is `'raw'`, since it is only
needed to fall back to `html` mode.

## Platform Support

| Platform | Method | Requirements |
|----------|--------|--------------|
| **Linux** | CUPS (`lp` command) | CUPS installed, printer configured |
| **macOS** | CUPS (`lp` command) | Printer in System Preferences |
| **Windows** | Print Spooler | Printer installed, PowerShell |

## Paper Width

| Width | Characters per Line |
|-------|---------------------|
| 58mm | 32 |
| 80mm | 48 |

The characters-per-line value derived from paper width can be overridden with
`charsPerLine` — in `PrinterConfig`, or in the options object passed to
`buildESCPOSData` — for printers that are neither 32 nor 48 columns;
42-column printers are a common example.

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
| Barcode values were sent unchecked | Invalid values now throw before anything is sent — see `validateBarcodeValue` |
| `[IMAGE]` placeholder text printed on receipts | Image content prints nothing until raster image support lands |

See [CHANGELOG.md](./CHANGELOG.md) for the full list.

## Requirements

- Node.js >= 18.0.0
- Electron >= 28.0.0

## License

MIT
