import type { Codepage } from '../commands/codepage-tables';

export type { Codepage };

/**
 * Which print path to use.
 *
 * - `raw`: build ESC/POS bytes and send them straight to the printer. Default.
 * - `html`: render HTML in a hidden window and use Electron's print API.
 */
export type PrintMode = 'raw' | 'html';

/**
 * Printer paper width in millimeters
 */
export type PaperWidth = 58 | 80;

/**
 * Text alignment options
 */
export type TextAlign = 'left' | 'center' | 'right';

/**
 * Font size options
 */
export type FontSize = 'normal' | 'double-height' | 'double-width' | 'double';

/**
 * Barcode types supported by ESC/POS
 */
export type BarcodeType =
  | 'UPC-A'
  | 'UPC-E'
  | 'EAN13'
  | 'EAN8'
  | 'CODE39'
  | 'ITF'
  | 'CODABAR'
  | 'CODE93'
  | 'CODE128';

/**
 * QR Code error correction levels
 */
export type QRErrorCorrection = 'L' | 'M' | 'Q' | 'H';

/**
 * Printer connection status
 */
export type PrinterStatus = 'connected' | 'disconnected' | 'printing' | 'error';

/**
 * Print job status
 */
export type JobStatus = 'pending' | 'printing' | 'completed' | 'failed' | 'cancelled';

/**
 * Printer information returned by Electron
 */
export interface PrinterInfo {
  name: string;
  displayName: string;
  description: string;
  status: number;
  isDefault: boolean;
  options?: Record<string, string>;
}

/**
 * Printer configuration options
 */
export interface PrinterConfig {
  /** Printer name (as returned by the system). Used in both modes. */
  printerName: string;
  /** Paper width in mm (58 or 80). Used in both modes. */
  paperWidth: PaperWidth;
  /**
   * Characters per line. Defaults from paperWidth. raw mode only — the html
   * renderer derives its column width from paperWidth alone and has no way
   * to honor this override, so it is ignored in html mode.
   */
  charsPerLine?: number;

  /** Which print path to use. Defaults to `'raw'`. */
  mode?: PrintMode;
  /**
   * Character table for raw mode. A name selects both the `ESC t` code and the
   * encoding table; a number is sent as `ESC t <n>` verbatim, for printers whose
   * vendor uses a non-standard value. Defaults to `'PC437'`. Ignored in html mode.
   */
  codepage?: Codepage | number;
  /**
   * Encoding table to use when `codepage` is a number. Ignored otherwise and in
   * html mode. Defaults to `'PC437'`.
   */
  codepageTable?: Codepage;

  /** html mode only — ignored in raw mode. Enable silent printing (no dialog). */
  silent?: boolean;
  /** html mode only — ignored in raw mode. Show the render window. */
  preview?: boolean;
  /** html mode only — ignored in raw mode. Page margins. */
  margin?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  /** html mode only — ignored in raw mode. Custom page size. */
  pageSize?: {
    width: number;
    height?: number;
  };
}

/**
 * Text style options
 */
export interface TextStyle {
  bold?: boolean;
  underline?: boolean;
  align?: TextAlign;
  size?: FontSize;
  invert?: boolean;
}

/**
 * Table column definition
 */
export interface TableColumn {
  /** Column content */
  text: string;
  /** Column width (number of characters or percentage) */
  width?: number | string;
  /** Text alignment within column */
  align?: TextAlign;
  /** Bold text */
  bold?: boolean;
}

/**
 * Image print options
 */
export interface ImageOptions {
  /**
   * Target width in printer dots. Clamped to the printable width and to the
   * source width — a small logo is never stretched, only shrunk if oversized.
   */
  width?: number;
  /** Alignment. */
  align?: TextAlign;
  /**
   * How to reduce to one bit per pixel. Defaults to `'threshold'`, which keeps
   * an already-black-and-white logo crisp; `'floyd-steinberg'` preserves the
   * tone of a photograph or a gradient at the cost of a dot pattern that
   * thermal dot bloom can smear.
   */
  dither?: 'threshold' | 'floyd-steinberg';
  /** Cutoff for `dither: 'threshold'`, 0-255. Defaults to 128. */
  threshold?: number;
}

/**
 * Barcode print options
 */
export interface BarcodeOptions {
  /** Barcode type */
  type: BarcodeType;
  /** Barcode width (2-6) */
  width?: number;
  /** Barcode height in dots */
  height?: number;
  /** Show text below barcode */
  showText?: boolean;
  /** Text position */
  textPosition?: 'above' | 'below' | 'both' | 'none';
  /** Alignment */
  align?: TextAlign;
}

/**
 * QR Code print options
 */
export interface QRCodeOptions {
  /** QR code size (1-16) */
  size?: number;
  /** Error correction level */
  errorCorrection?: QRErrorCorrection;
  /** Alignment */
  align?: TextAlign;
}

/**
 * Print content types
 */
export type PrintContentType =
  | 'text'
  | 'line'
  | 'table'
  | 'barcode'
  | 'qrcode'
  | 'image'
  | 'feed'
  | 'cut'
  | 'cashdraw'
  | 'beep';

/**
 * Base print content item
 */
export interface PrintContentBase {
  type: PrintContentType;
}

/**
 * Text content
 */
export interface TextContent extends PrintContentBase {
  type: 'text';
  value: string;
  style?: TextStyle;
}

/**
 * Line separator content
 */
export interface LineContent extends PrintContentBase {
  type: 'line';
  character?: string;
}

/**
 * Table content
 */
export interface TableContent extends PrintContentBase {
  type: 'table';
  rows: TableColumn[][];
}

/**
 * Barcode content
 */
export interface BarcodeContent extends PrintContentBase {
  type: 'barcode';
  value: string;
  options: BarcodeOptions;
}

/**
 * QR Code content
 */
export interface QRCodeContent extends PrintContentBase {
  type: 'qrcode';
  value: string;
  options?: QRCodeOptions;
}

/**
 * Image content
 */
export interface ImageContent extends PrintContentBase {
  type: 'image';
  /**
   * PNG image as base64, or as a `data:image/png;base64,...` URL.
   *
   * File paths are not accepted. Content can arrive from a renderer over IPC,
   * and reading an arbitrary path on its behalf would hand it a capability it
   * should not have; the builder stays a pure function that never touches the
   * filesystem. A main-process caller reads its own file in one line:
   * `readFileSync(path).toString('base64')`.
   */
  source: string;
  options?: ImageOptions;
}

/**
 * Paper feed content
 */
export interface FeedContent extends PrintContentBase {
  type: 'feed';
  lines?: number;
}

/**
 * Paper cut content
 */
export interface CutContent extends PrintContentBase {
  type: 'cut';
  partial?: boolean;
}

/**
 * Cash drawer pulse.
 *
 * A content item rather than a method, so the caller controls where in the
 * sequence it fires — before the cut or after it is a real choice.
 */
export interface CashDrawerContent extends PrintContentBase {
  type: 'cashdraw';
  /** Connector pin. Defaults to 2, the common wiring. */
  pin?: 2 | 5;
}

/**
 * Beeper.
 *
 * Not universally supported: many printers ignore `ESC B` entirely. Nothing in
 * this package can detect that, so a silent beeper is a hardware answer rather
 * than a bug.
 */
export interface BeepContent extends PrintContentBase {
  type: 'beep';
  /** Number of beeps, 1-9. Defaults to 1. */
  times?: number;
  /** Duration of each beep, 1-9. Defaults to 3. */
  duration?: number;
}

/**
 * Union type for all print content
 */
export type PrintContent =
  | TextContent
  | LineContent
  | TableContent
  | BarcodeContent
  | QRCodeContent
  | ImageContent
  | FeedContent
  | CutContent
  | CashDrawerContent
  | BeepContent;

/**
 * Print job definition
 */
export interface PrintJob {
  id: string;
  content: PrintContent[];
  config: PrinterConfig;
  status: JobStatus;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

/**
 * Print result
 */
export interface PrintResult {
  success: boolean;
  jobId: string;
  error?: string;
  /**
   * Which path produced this result. Set by the IPC handler and by `print()` /
   * `printRaw()`; absent when `printRawData()` or `printHTML()` is called
   * directly, since those do not know the mode.
   */
  mode?: PrintMode;
}

/**
 * Receipt data for quick receipt generation
 */
export interface ReceiptData {
  /** Store/business header */
  header?: {
    title?: string;
    subtitle?: string;
    /**
     * PNG image as base64, or as a `data:image/png;base64,...` URL.
     *
     * File paths are not accepted, for the same reason as `ImageContent.source`:
     * content can arrive from a renderer over IPC, and reading an arbitrary path
     * on its behalf would hand it a capability it should not have. Read the file
     * yourself: `readFileSync(path).toString('base64')`.
     */
    logo?: string;
    address?: string[];
    phone?: string;
  };
  /** Receipt items */
  items: ReceiptItem[];
  /** Totals section */
  totals?: {
    subtotal?: number;
    tax?: number;
    discount?: number;
    total: number;
  };
  /** Payment information */
  payment?: {
    method: string;
    amount: number;
    change?: number;
  };
  /** Footer text lines */
  footer?: string[];
  /** Additional metadata */
  meta?: {
    orderNumber?: string;
    date?: Date;
    cashier?: string;
    customer?: string;
  };
}

/**
 * Single receipt item
 */
export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  total?: number;
}

/**
 * Currency formatting options
 */
export interface CurrencyOptions {
  symbol?: string;
  decimals?: number;
  thousandSeparator?: string;
  decimalSeparator?: string;
  symbolPosition?: 'before' | 'after';
}

/**
 * IPC channel names for Electron communication
 */
export const IPC_CHANNELS = {
  GET_PRINTERS: 'pos-printer:get-printers',
  PRINT: 'pos-printer:print',
  PRINT_RESULT: 'pos-printer:print-result',
  GET_PRINTER_STATUS: 'pos-printer:get-status',
} as const;

/**
 * Printable width in printer dots, by paper size.
 *
 * This is not the paper's full width: a 58mm roll is 464 dots edge to edge but
 * only 384 are printable, and 80mm is 640 against 576. `getPageWidthPixels()`
 * returns the former and must not be used to size an image, or every logo
 * overruns the printable area.
 *
 * Cross-checked three ways: charsPerLine x 12, the 48mm/72mm widths the HTML
 * renderer uses, and the standard for 203 DPI thermal printers.
 */
export const PRINTABLE_WIDTH_58 = 384;
export const PRINTABLE_WIDTH_80 = 576;

/**
 * Default configuration values
 */
export const DEFAULTS = {
  PAPER_WIDTH: 80 as PaperWidth,
  CHARS_PER_LINE_58: 32,
  CHARS_PER_LINE_80: 48,
  MODE: 'raw' as PrintMode,
  CODEPAGE: 'PC437' as Codepage,
  CODEPAGE_TABLE: 'PC437' as Codepage,
  MARGIN: { top: 0, bottom: 0, left: 0, right: 0 },
  SILENT: true,
  BARCODE_WIDTH: 2,
  BARCODE_HEIGHT: 100,
  QR_SIZE: 6,
  QR_ERROR_CORRECTION: 'M' as QRErrorCorrection,
  FEED_LINES: 3,
  LINE_CHARACTER: '-',
} as const;
