// Main process exports
export {
  setupPrinterIPC,
  removePrinterIPC,
  print,
  printRawHTML,
  getPrintersAsync,
  createDefaultConfig,
} from './main';

// Preload script exports
export { exposePosPrinterAPI, getPosPrinterAPI } from './preload';
export type { PosPrinterAPI } from './preload';

// Renderer process exports
export {
  PosPrinter,
  createPosPrinter,
  isPosPrinterAvailable,
  createReceipt,
  ReceiptBuilder,
} from './renderer';
