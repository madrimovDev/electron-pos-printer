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
