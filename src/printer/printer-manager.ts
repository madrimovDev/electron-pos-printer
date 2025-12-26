import type { BrowserWindow, WebContents, PrinterInfo as ElectronPrinterInfo } from 'electron';
import type { PrinterInfo, PrinterConfig, PrintResult, PaperWidth } from '../types';

/**
 * Convert Electron PrinterInfo to our PrinterInfo type
 */
function convertPrinterInfo(printer: ElectronPrinterInfo): PrinterInfo {
  return {
    name: printer.name,
    displayName: printer.displayName,
    description: printer.description,
    status: printer.status,
    isDefault: printer.isDefault,
    options: printer.options as Record<string, string> | undefined,
  };
}

/**
 * Get the list of available printers
 * Must be called from the main process
 */
export function getPrinters(webContents: WebContents): PrinterInfo[] {
  // For sync fallback - deprecated in newer Electron versions
  const getPrintersSync = (webContents as unknown as { getPrinters?: () => ElectronPrinterInfo[] }).getPrinters;
  if (typeof getPrintersSync === 'function') {
    return getPrintersSync.call(webContents).map(convertPrinterInfo);
  }
  return [];
}

/**
 * Get printers asynchronously (Electron 20+)
 */
export async function getPrintersAsync(webContents: WebContents): Promise<PrinterInfo[]> {
  if (typeof webContents.getPrintersAsync === 'function') {
    const printers = await webContents.getPrintersAsync();
    return printers.map(convertPrinterInfo);
  }

  // Fallback for older versions
  return getPrinters(webContents);
}

/**
 * Find a printer by name
 */
export async function findPrinter(
  webContents: WebContents,
  printerName: string
): Promise<PrinterInfo | undefined> {
  const printers = await getPrintersAsync(webContents);
  return printers.find(
    (p) => p.name === printerName || p.displayName === printerName
  );
}

/**
 * Get the default printer
 */
export async function getDefaultPrinter(
  webContents: WebContents
): Promise<PrinterInfo | undefined> {
  const printers = await getPrintersAsync(webContents);
  return printers.find((p) => p.isDefault);
}

/**
 * Check if a printer exists
 */
export async function printerExists(
  webContents: WebContents,
  printerName: string
): Promise<boolean> {
  const printer = await findPrinter(webContents, printerName);
  return printer !== undefined;
}

/**
 * Calculate characters per line based on paper width
 */
export function getCharsPerLine(paperWidth: PaperWidth): number {
  // Standard character widths for thermal printers
  // 58mm paper: ~32 chars (with 12px font)
  // 80mm paper: ~48 chars (with 12px font)
  return paperWidth === 58 ? 32 : 48;
}

/**
 * Calculate page width in pixels based on paper width
 * Standard thermal printer DPI is typically 203 (8 dots/mm)
 */
export function getPageWidthPixels(paperWidth: PaperWidth): number {
  const dotsPerMm = 8; // 203 DPI = ~8 dots/mm
  return paperWidth * dotsPerMm;
}

/**
 * Create default printer configuration
 */
export function createDefaultConfig(
  printerName: string,
  paperWidth: PaperWidth = 80
): PrinterConfig {
  return {
    printerName,
    paperWidth,
    charsPerLine: getCharsPerLine(paperWidth),
    silent: true,
    preview: false,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
    pageSize: {
      width: paperWidth * 1000, // Convert mm to microns
    },
  };
}

/**
 * Print options for Electron's webContents.print()
 */
export interface ElectronPrintOptions {
  silent: boolean;
  printBackground: boolean;
  deviceName: string;
  color: boolean;
  margins: {
    marginType: 'custom';
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  landscape: boolean;
  scaleFactor: number;
  pagesPerSheet: number;
  collate: boolean;
  copies: number;
  pageRanges?: { from: number; to: number }[];
  pageSize?: { width: number; height: number };
}

/**
 * Convert PrinterConfig to Electron print options
 */
export function toElectronPrintOptions(config: PrinterConfig): ElectronPrintOptions {
  return {
    silent: config.silent ?? true,
    printBackground: true,
    deviceName: config.printerName,
    color: false, // Thermal printers are monochrome
    margins: {
      marginType: 'custom',
      top: config.margin?.top ?? 0,
      bottom: config.margin?.bottom ?? 0,
      left: config.margin?.left ?? 0,
      right: config.margin?.right ?? 0,
    },
    landscape: false,
    scaleFactor: 100,
    pagesPerSheet: 1,
    collate: false,
    copies: 1,
    pageSize: config.pageSize?.width && config.pageSize?.height
      ? { width: config.pageSize.width, height: config.pageSize.height }
      : undefined,
  };
}

/**
 * Print HTML content using Electron's print API
 */
export async function printHTML(
  _parentWindow: BrowserWindow,
  html: string,
  config: PrinterConfig
): Promise<PrintResult> {
  const jobId = generateJobId();

  return new Promise((resolve) => {
    // Load HTML content
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

    // Create a hidden window for printing
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BrowserWindow: BW } = require('electron') as typeof import('electron');
    const printWindow = new BW({
      show: config.preview ?? false,
      width: config.paperWidth === 58 ? 220 : 302,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    printWindow.loadURL(dataUrl);

    printWindow.webContents.on('did-finish-load', () => {
      const options = toElectronPrintOptions(config);

      printWindow.webContents.print(options, (success, failureReason) => {
        if (!config.preview) {
          printWindow.close();
        }

        if (success) {
          resolve({ success: true, jobId });
        } else {
          resolve({
            success: false,
            jobId,
            error: failureReason || 'Print failed',
          });
        }
      });
    });

    printWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      printWindow.close();
      resolve({
        success: false,
        jobId,
        error: `Failed to load content: ${errorDescription} (${errorCode})`,
      });
    });
  });
}

/**
 * Generate a unique job ID
 */
function generateJobId(): string {
  return `print-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
