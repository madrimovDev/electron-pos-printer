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
  /** Printer name (as returned by system) */
  printerName: string;
  /** Paper width in mm (58 or 80) */
  paperWidth: PaperWidth;
  /** Characters per line (auto-calculated if not specified) */
  charsPerLine?: number;
  /** Enable silent printing (no dialog) */
  silent?: boolean;
  /** Print in preview mode */
  preview?: boolean;
  /** Page margins */
  margin?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  /** Custom page size */
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
  /** Image width in pixels (will be resized) */
  width?: number;
  /** Image alignment */
  align?: TextAlign;
}

/**
 * Barcode print options
 */
export interface BarcodeOptions {
  /** Barcode type */
  type: BarcodeType;
  /** Barcode width (1-6) */
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
  | 'cut';

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
  /** Base64 encoded image data or file path */
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
  | CutContent;

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
}

/**
 * Receipt data for quick receipt generation
 */
export interface ReceiptData {
  /** Store/business header */
  header?: {
    title?: string;
    subtitle?: string;
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
 * Default configuration values
 */
export const DEFAULTS = {
  PAPER_WIDTH: 80 as PaperWidth,
  CHARS_PER_LINE_58: 32,
  CHARS_PER_LINE_80: 48,
  MARGIN: { top: 0, bottom: 0, left: 0, right: 0 },
  SILENT: true,
  BARCODE_WIDTH: 2,
  BARCODE_HEIGHT: 100,
  QR_SIZE: 6,
  QR_ERROR_CORRECTION: 'M' as QRErrorCorrection,
  FEED_LINES: 3,
  LINE_CHARACTER: '-',
} as const;
