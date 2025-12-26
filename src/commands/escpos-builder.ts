/**
 * ESC/POS command builder
 * Converts PrintContent array to raw ESC/POS bytes
 */
import type {
  PrintContent,
  TextStyle,
  TableColumn,
  PaperWidth,
  BarcodeOptions,
  QRCodeOptions,
} from '../types';
import { DEFAULTS } from '../types';

// ESC/POS Control Codes
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// Pre-built commands
const CMD = {
  // Initialization
  INIT: Buffer.from([ESC, 0x40]),

  // Line feed
  LF: Buffer.from([LF]),

  // Text alignment
  ALIGN_LEFT: Buffer.from([ESC, 0x61, 0x00]),
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),
  ALIGN_RIGHT: Buffer.from([ESC, 0x61, 0x02]),

  // Text style
  BOLD_ON: Buffer.from([ESC, 0x45, 0x01]),
  BOLD_OFF: Buffer.from([ESC, 0x45, 0x00]),
  UNDERLINE_ON: Buffer.from([ESC, 0x2d, 0x01]),
  UNDERLINE_OFF: Buffer.from([ESC, 0x2d, 0x00]),
  INVERT_ON: Buffer.from([GS, 0x42, 0x01]),
  INVERT_OFF: Buffer.from([GS, 0x42, 0x00]),

  // Text size
  SIZE_NORMAL: Buffer.from([ESC, 0x21, 0x00]),
  SIZE_DOUBLE_HEIGHT: Buffer.from([ESC, 0x21, 0x10]),
  SIZE_DOUBLE_WIDTH: Buffer.from([ESC, 0x21, 0x20]),
  SIZE_DOUBLE: Buffer.from([ESC, 0x21, 0x30]),

  // Paper control
  CUT_PARTIAL: Buffer.from([GS, 0x56, 0x41, 0x00]),
  CUT_FULL: Buffer.from([GS, 0x56, 0x00]),

  // Feed n lines
  feed: (n: number): Buffer => Buffer.from([ESC, 0x64, Math.min(255, Math.max(0, n))]),
};

/**
 * Build ESC/POS data from PrintContent array
 */
export function buildESCPOSData(
  contents: PrintContent[],
  paperWidth: PaperWidth = DEFAULTS.PAPER_WIDTH
): Buffer {
  const charsPerLine = paperWidth === 58 ? DEFAULTS.CHARS_PER_LINE_58 : DEFAULTS.CHARS_PER_LINE_80;
  const buffers: Buffer[] = [CMD.INIT];

  for (const content of contents) {
    const contentBuffers = buildContentESCPOS(content, charsPerLine);
    buffers.push(...contentBuffers);
  }

  return Buffer.concat(buffers);
}

/**
 * Build ESC/POS for a single content item
 */
function buildContentESCPOS(content: PrintContent, charsPerLine: number): Buffer[] {
  switch (content.type) {
    case 'text':
      return buildTextESCPOS(content.value, content.style);

    case 'line':
      return buildLineESCPOS(content.character, charsPerLine);

    case 'table':
      return buildTableESCPOS(content.rows, charsPerLine);

    case 'feed':
      return [CMD.feed(content.lines ?? DEFAULTS.FEED_LINES)];

    case 'cut':
      return [CMD.feed(3), content.partial ? CMD.CUT_PARTIAL : CMD.CUT_FULL];

    case 'barcode':
      return buildBarcodeESCPOS(content.value, content.options);

    case 'qrcode':
      return buildQRCodeESCPOS(content.value, content.options);

    case 'image':
      // Image printing requires bitmap conversion - not implemented yet
      return [Buffer.from('[IMAGE]\n', 'utf8')];

    default:
      return [];
  }
}

/**
 * Build ESC/POS for text content
 */
function buildTextESCPOS(text: string, style?: TextStyle): Buffer[] {
  const buffers: Buffer[] = [];

  // Set alignment
  if (style?.align === 'center') {
    buffers.push(CMD.ALIGN_CENTER);
  } else if (style?.align === 'right') {
    buffers.push(CMD.ALIGN_RIGHT);
  } else {
    buffers.push(CMD.ALIGN_LEFT);
  }

  // Set size
  if (style?.size === 'double') {
    buffers.push(CMD.SIZE_DOUBLE);
  } else if (style?.size === 'double-height') {
    buffers.push(CMD.SIZE_DOUBLE_HEIGHT);
  } else if (style?.size === 'double-width') {
    buffers.push(CMD.SIZE_DOUBLE_WIDTH);
  }

  // Set bold
  if (style?.bold) {
    buffers.push(CMD.BOLD_ON);
  }

  // Set underline
  if (style?.underline) {
    buffers.push(CMD.UNDERLINE_ON);
  }

  // Set invert
  if (style?.invert) {
    buffers.push(CMD.INVERT_ON);
  }

  // Add text
  buffers.push(Buffer.from(text, 'utf8'));
  buffers.push(CMD.LF);

  // Reset styles
  if (style?.bold) buffers.push(CMD.BOLD_OFF);
  if (style?.underline) buffers.push(CMD.UNDERLINE_OFF);
  if (style?.invert) buffers.push(CMD.INVERT_OFF);
  if (style?.size) buffers.push(CMD.SIZE_NORMAL);
  buffers.push(CMD.ALIGN_LEFT);

  return buffers;
}

/**
 * Build ESC/POS for line separator
 */
function buildLineESCPOS(character: string | undefined, charsPerLine: number): Buffer[] {
  const char = character || DEFAULTS.LINE_CHARACTER;
  return [Buffer.from(char.repeat(charsPerLine), 'utf8'), CMD.LF];
}

/**
 * Build ESC/POS for table content
 */
function buildTableESCPOS(rows: TableColumn[][], charsPerLine: number): Buffer[] {
  const buffers: Buffer[] = [];

  for (const row of rows) {
    const colWidths = calculateColumnWidths(row, charsPerLine);
    let line = '';

    row.forEach((col, i) => {
      const width = colWidths[i];
      let text = col.text || '';

      // Truncate or pad text
      if (text.length > width) {
        text = text.substring(0, width);
      } else {
        const padding = width - text.length;
        if (col.align === 'right') {
          text = ' '.repeat(padding) + text;
        } else if (col.align === 'center') {
          const left = Math.floor(padding / 2);
          text = ' '.repeat(left) + text + ' '.repeat(padding - left);
        } else {
          text = text + ' '.repeat(padding);
        }
      }
      line += text;
    });

    // Check if row has bold columns
    const hasBold = row.some((col) => col.bold);
    if (hasBold) buffers.push(CMD.BOLD_ON);

    buffers.push(Buffer.from(line, 'utf8'));
    buffers.push(CMD.LF);

    if (hasBold) buffers.push(CMD.BOLD_OFF);
  }

  return buffers;
}

/**
 * Calculate column widths for table
 */
function calculateColumnWidths(columns: TableColumn[], totalWidth: number): number[] {
  const widths: (number | null)[] = [];
  let usedWidth = 0;
  let flexCount = 0;

  // First pass: calculate fixed widths
  for (const col of columns) {
    if (col.width !== undefined) {
      if (typeof col.width === 'string' && col.width.endsWith('%')) {
        const percent = parseInt(col.width, 10) / 100;
        const w = Math.floor(totalWidth * percent);
        widths.push(w);
        usedWidth += w;
      } else {
        const w = typeof col.width === 'number' ? col.width : parseInt(col.width, 10);
        widths.push(w);
        usedWidth += w;
      }
    } else {
      widths.push(null);
      flexCount++;
    }
  }

  // Second pass: distribute remaining width to flex columns
  if (flexCount > 0) {
    const remaining = totalWidth - usedWidth;
    const flexWidth = Math.floor(remaining / flexCount);
    for (let i = 0; i < widths.length; i++) {
      if (widths[i] === null) {
        widths[i] = flexWidth;
      }
    }
  }

  return widths as number[];
}

/**
 * Build ESC/POS for barcode
 */
function buildBarcodeESCPOS(value: string, options: BarcodeOptions): Buffer[] {
  const buffers: Buffer[] = [];
  const height = options.height ?? DEFAULTS.BARCODE_HEIGHT;
  const width = options.width ?? DEFAULTS.BARCODE_WIDTH;

  // Alignment
  if (options.align === 'center') {
    buffers.push(CMD.ALIGN_CENTER);
  } else if (options.align === 'right') {
    buffers.push(CMD.ALIGN_RIGHT);
  }

  // Set barcode height
  buffers.push(Buffer.from([GS, 0x68, Math.min(255, height)]));

  // Set barcode width (2-6)
  buffers.push(Buffer.from([GS, 0x77, Math.min(6, Math.max(2, width))]));

  // Set HRI position
  const hriPosition = options.textPosition ?? 'below';
  const hriCode =
    hriPosition === 'none' ? 0x00 : hriPosition === 'above' ? 0x01 : hriPosition === 'both' ? 0x03 : 0x02;
  buffers.push(Buffer.from([GS, 0x48, hriCode]));

  // Barcode type codes
  const barcodeTypes: Record<string, number> = {
    'UPC-A': 0x41,
    'UPC-E': 0x42,
    EAN13: 0x43,
    EAN8: 0x44,
    CODE39: 0x45,
    ITF: 0x46,
    CODABAR: 0x47,
    CODE93: 0x48,
    CODE128: 0x49,
  };

  const typeCode = barcodeTypes[options.type] ?? 0x49; // Default CODE128

  // Print barcode (CODE128 format with Code B)
  if (options.type === 'CODE128') {
    buffers.push(Buffer.from([GS, 0x6b, typeCode, value.length + 2, 0x7b, 0x42]));
    buffers.push(Buffer.from(value, 'ascii'));
  } else {
    buffers.push(Buffer.from([GS, 0x6b, typeCode, value.length]));
    buffers.push(Buffer.from(value, 'ascii'));
  }

  buffers.push(CMD.LF);
  buffers.push(CMD.ALIGN_LEFT);

  return buffers;
}

/**
 * Build ESC/POS for QR code
 */
function buildQRCodeESCPOS(value: string, options?: QRCodeOptions): Buffer[] {
  const buffers: Buffer[] = [];
  const size = options?.size ?? DEFAULTS.QR_SIZE;
  const errorLevel = options?.errorCorrection ?? DEFAULTS.QR_ERROR_CORRECTION;

  // Alignment
  if (options?.align === 'center') {
    buffers.push(CMD.ALIGN_CENTER);
  } else if (options?.align === 'right') {
    buffers.push(CMD.ALIGN_RIGHT);
  }

  // QR Code: Select model (Model 2)
  buffers.push(Buffer.from([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]));

  // QR Code: Set size (1-16)
  buffers.push(Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, Math.min(16, Math.max(1, size))]));

  // QR Code: Set error correction level
  const errorCodes: Record<string, number> = { L: 0x30, M: 0x31, Q: 0x32, H: 0x33 };
  const errorCode = errorCodes[errorLevel] ?? 0x31;
  buffers.push(Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, errorCode]));

  // QR Code: Store data
  const dataBytes = Buffer.from(value, 'utf8');
  const storeLen = dataBytes.length + 3;
  const pL = storeLen & 0xff;
  const pH = (storeLen >> 8) & 0xff;
  buffers.push(Buffer.from([GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]));
  buffers.push(dataBytes);

  // QR Code: Print
  buffers.push(Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]));

  buffers.push(CMD.LF);
  buffers.push(CMD.ALIGN_LEFT);

  return buffers;
}

export { CMD as ESCPOSCommands };
