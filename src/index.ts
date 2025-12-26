/**
 * electron-pos-printer
 * A powerful thermal POS printer library for Electron applications
 * Supports 58mm and 80mm thermal printers with ESC/POS commands
 */

// Types
export * from './types';

// ESC/POS Commands
export { Commands, toBuffer, concat, encodeText } from './commands';
export { buildESCPOSData, ESCPOSCommands } from './commands/escpos-builder';

// Printer utilities
export {
  getPrinters,
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

// HTML Builder
export { buildHTML } from './utils/html-builder';

// Receipt Builder
export { ReceiptBuilder, createReceipt } from './utils/receipt-builder';

// Electron integration - Main process
export { setupPrinterIPC, removePrinterIPC, print, printRawHTML } from './electron/main';

// Electron integration - Preload
export { exposePosPrinterAPI, getPosPrinterAPI } from './electron/preload';
export type { PosPrinterAPI } from './electron/preload';

// Electron integration - Renderer
export { PosPrinter, createPosPrinter, isPosPrinterAvailable } from './electron/renderer';
