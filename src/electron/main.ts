/**
 * Electron Main Process Integration
 * Setup IPC handlers for printer operations
 */
import { ipcMain, BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { PrinterConfig, PrintContent, PrintResult, PrinterInfo } from '../types';
import { IPC_CHANNELS } from '../types';
import { getPrintersAsync, printHTML, createDefaultConfig } from '../printer';
import { buildHTML } from '../utils/html-builder';

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
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        return {
          success: false,
          jobId: '',
          error: 'No window found',
        };
      }

      try {
        const html = buildHTML(contents, config.paperWidth);
        return await printHTML(window, html, config);
      } catch (error) {
        return {
          success: false,
          jobId: '',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
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
 * Direct print function for main process usage
 */
export async function print(
  window: BrowserWindow,
  contents: PrintContent[],
  config: PrinterConfig
): Promise<PrintResult> {
  try {
    const html = buildHTML(contents, config.paperWidth);
    return await printHTML(window, html, config);
  } catch (error) {
    return {
      success: false,
      jobId: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
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
