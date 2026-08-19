# Changelog

All notable changes to this project are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) — with one addition,
a `Breaking` section on major releases that collects incompatible changes in
one place a reader can scan first — and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- `printReceipt()` / `printText()` printed via HTML in 1.x and now print raw
  with `PC437` unless a `codepage` is passed. Both methods gained an optional
  trailing `config` parameter to supply `codepage` and other `PrinterConfig`
  overrides.

### Added

- Codepage support for raw printing: `PC437`, `PC850`, `PC852`, `PC860`,
  `PC863`, `PC865`, `PC866`, `WPC1252`, `CP1251`. Tables are generated from the
  Unicode Consortium's official vendor mappings.
- Transliteration for characters no codepage carries — Uzbek Latin `oʻ`/`gʻ`
  (U+02BB), Uzbek Cyrillic `ғ`/`қ`/`ҳ`, guillemets, `№`, `₽`, `€`, and other
  typographic punctuation.
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
