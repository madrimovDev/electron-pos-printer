/**
 * Electron Main Process Integration
 * Setup IPC handlers for printer operations
 */
import { ipcMain, BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { PrinterConfig, PrintContent, PrintResult, PrinterInfo, PrintMode } from '../types';
import { IPC_CHANNELS, DEFAULTS } from '../types';
import { getPrintersAsync, printHTML, createDefaultConfig } from '../printer';
import { printRawData } from '../printer/raw-printer';
import { buildESCPOSData } from '../commands/escpos-builder';
import { buildHTML } from '../utils/html-builder';

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

/**
 * Setup all IPC handlers for the POS printer
 * Call this in your main process after app is ready
 */
export function setupPrinterIPC(): void {
  // Get list of available printers
  ipcMain.handle(
    IPC_CHANNELS.GET_PRINTERS,
    async (event: IpcMainInvokeEvent): Promise<PrinterInfo[]> => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        return [];
      }
      return getPrintersAsync(window.webContents);
    }
  );

  // Print content
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
}

/**
 * Remove all IPC handlers
 * Call this when cleaning up
 */
export function removePrinterIPC(): void {
  ipcMain.removeHandler(IPC_CHANNELS.GET_PRINTERS);
  ipcMain.removeHandler(IPC_CHANNELS.PRINT);
}

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

/**
 * Print raw HTML content
 */
export async function printRawHTML(
  window: BrowserWindow,
  html: string,
  config: PrinterConfig
): Promise<PrintResult> {
  return printHTML(window, html, config);
}

export { getPrintersAsync, createDefaultConfig };
