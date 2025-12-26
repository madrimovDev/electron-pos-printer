/**
 * Electron Preload Script Helpers
 * Expose safe APIs to renderer process
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { PrinterConfig, PrintContent, PrintResult, PrinterInfo } from '../types';
import { IPC_CHANNELS } from '../types';

/**
 * POS Printer API exposed to renderer
 */
export interface PosPrinterAPI {
  /**
   * Get list of available printers
   */
  getPrinters: () => Promise<PrinterInfo[]>;

  /**
   * Print content
   */
  print: (contents: PrintContent[], config: PrinterConfig) => Promise<PrintResult>;
}

/**
 * Create the API object
 */
function createPosPrinterAPI(): PosPrinterAPI {
  return {
    getPrinters: () => ipcRenderer.invoke(IPC_CHANNELS.GET_PRINTERS),
    print: (contents, config) => ipcRenderer.invoke(IPC_CHANNELS.PRINT, contents, config),
  };
}

/**
 * Expose POS Printer API to renderer via contextBridge
 * Call this in your preload script
 */
export function exposePosPrinterAPI(apiName = 'posPrinter'): void {
  contextBridge.exposeInMainWorld(apiName, createPosPrinterAPI());
}

/**
 * Get the API object without exposing (for custom exposure)
 */
export function getPosPrinterAPI(): PosPrinterAPI {
  return createPosPrinterAPI();
}
