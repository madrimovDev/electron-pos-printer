/**
 * Electron Renderer Process API
 * Use this in your renderer process (React, Vue, etc.)
 */
import type { PrinterConfig, PrintContent, PrintResult, PrinterInfo, PaperWidth } from '../types';
import { DEFAULTS } from '../types';
import { ReceiptBuilder, createReceipt } from '../utils/receipt-builder';

/**
 * Check if the POS Printer API is available
 */
export function isPosPrinterAvailable(apiName = 'posPrinter'): boolean {
  return typeof window !== 'undefined' && apiName in window;
}

/**
 * Get POS Printer API from window object
 */
function getAPI(apiName = 'posPrinter'): {
  getPrinters: () => Promise<PrinterInfo[]>;
  print: (contents: PrintContent[], config: PrinterConfig) => Promise<PrintResult>;
} {
  if (!isPosPrinterAvailable(apiName)) {
    throw new Error(
      `POS Printer API not available. Make sure to call exposePosPrinterAPI() in your preload script.`
    );
  }
  return (window as unknown as Record<string, unknown>)[apiName] as ReturnType<typeof getAPI>;
}

/**
 * PosPrinter class for renderer process
 */
export class PosPrinter {
  private apiName: string;

  constructor(apiName = 'posPrinter') {
    this.apiName = apiName;
  }

  /**
   * Get list of available printers
   */
  async getPrinters(): Promise<PrinterInfo[]> {
    return getAPI(this.apiName).getPrinters();
  }

  /**
   * Find a printer by name
   */
  async findPrinter(name: string): Promise<PrinterInfo | undefined> {
    const printers = await this.getPrinters();
    return printers.find((p) => p.name === name || p.displayName === name);
  }

  /**
   * Get the default printer
   */
  async getDefaultPrinter(): Promise<PrinterInfo | undefined> {
    const printers = await this.getPrinters();
    return printers.find((p) => p.isDefault);
  }

  /**
   * Print content using PrintContent array
   */
  async print(contents: PrintContent[], config: PrinterConfig): Promise<PrintResult> {
    return getAPI(this.apiName).print(contents, config);
  }

  /**
   * Print using ReceiptBuilder
   */
  async printReceipt(receipt: ReceiptBuilder, printerName: string): Promise<PrintResult> {
    const config: PrinterConfig = {
      printerName,
      paperWidth: receipt.getPaperWidth(),
      charsPerLine: receipt.getCharsPerLine(),
      silent: true,
    };
    return this.print(receipt.getContents(), config);
  }

  /**
   * Create a new receipt builder
   */
  createReceipt(paperWidth?: PaperWidth): ReceiptBuilder {
    return createReceipt(paperWidth);
  }

  /**
   * Quick print text
   */
  async printText(
    text: string,
    printerName: string,
    paperWidth: PaperWidth = DEFAULTS.PAPER_WIDTH
  ): Promise<PrintResult> {
    const receipt = createReceipt(paperWidth).text(text).feed().cut();
    return this.printReceipt(receipt, printerName);
  }
}

/**
 * Create a PosPrinter instance
 */
export function createPosPrinter(apiName?: string): PosPrinter {
  return new PosPrinter(apiName);
}

// Re-export types and utilities for convenience
export { createReceipt, ReceiptBuilder };
export type { PrintContent, PrinterConfig, PrintResult, PrinterInfo, PaperWidth };
