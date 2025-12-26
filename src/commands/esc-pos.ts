/**
 * ESC/POS Command Constants
 * Standard thermal printer control commands
 */

// Control Characters
export const NUL = 0x00; // Null
export const LF = 0x0a; // Line Feed
export const CR = 0x0d; // Carriage Return
export const HT = 0x09; // Horizontal Tab
export const FF = 0x0c; // Form Feed
export const ESC = 0x1b; // Escape
export const FS = 0x1c; // Field Separator
export const GS = 0x1d; // Group Separator
export const DLE = 0x10; // Data Link Escape

/**
 * ESC/POS Commands organized by function
 */
export const Commands = {
  // Printer Initialization
  INIT: [ESC, 0x40], // Initialize printer

  // Text Formatting
  TEXT: {
    NORMAL: [ESC, 0x21, 0x00], // Normal text
    BOLD_ON: [ESC, 0x45, 0x01], // Bold on
    BOLD_OFF: [ESC, 0x45, 0x00], // Bold off
    UNDERLINE_ON: [ESC, 0x2d, 0x01], // Underline on (1-dot)
    UNDERLINE_2_ON: [ESC, 0x2d, 0x02], // Underline on (2-dot)
    UNDERLINE_OFF: [ESC, 0x2d, 0x00], // Underline off
    INVERT_ON: [GS, 0x42, 0x01], // White/Black reverse on
    INVERT_OFF: [GS, 0x42, 0x00], // White/Black reverse off
    DOUBLE_HEIGHT: [ESC, 0x21, 0x10], // Double height
    DOUBLE_WIDTH: [ESC, 0x21, 0x20], // Double width
    DOUBLE_SIZE: [ESC, 0x21, 0x30], // Double height and width
  },

  // Text Alignment
  ALIGN: {
    LEFT: [ESC, 0x61, 0x00], // Left alignment
    CENTER: [ESC, 0x61, 0x01], // Center alignment
    RIGHT: [ESC, 0x61, 0x02], // Right alignment
  },

  // Paper Control
  PAPER: {
    FEED_1: [LF], // Feed 1 line
    FEED_N: (n: number) => [ESC, 0x64, n], // Feed n lines
    CUT_FULL: [GS, 0x56, 0x00], // Full cut
    CUT_PARTIAL: [GS, 0x56, 0x01], // Partial cut
    CUT_FEED: [GS, 0x56, 0x42, 0x00], // Feed and cut
  },

  // Barcode Commands
  BARCODE: {
    // Set barcode height (1-255 dots)
    HEIGHT: (h: number) => [GS, 0x68, Math.min(255, Math.max(1, h))],
    // Set barcode width (2-6)
    WIDTH: (w: number) => [GS, 0x77, Math.min(6, Math.max(2, w))],
    // HRI (Human Readable Interpretation) position
    HRI_NONE: [GS, 0x48, 0x00],
    HRI_ABOVE: [GS, 0x48, 0x01],
    HRI_BELOW: [GS, 0x48, 0x02],
    HRI_BOTH: [GS, 0x48, 0x03],
    // Barcode types
    TYPE: {
      'UPC-A': 0x41,
      'UPC-E': 0x42,
      EAN13: 0x43,
      EAN8: 0x44,
      CODE39: 0x45,
      ITF: 0x46,
      CODABAR: 0x47,
      CODE93: 0x48,
      CODE128: 0x49,
    },
    // Print barcode: GS k type data NUL
    PRINT: (type: number, data: string) => [
      GS,
      0x6b,
      type,
      ...Buffer.from(data, 'ascii'),
      NUL,
    ],
  },

  // QR Code Commands
  QRCODE: {
    // Set model (1 or 2)
    MODEL: (model: 1 | 2 = 2) => [GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, model, 0x00],
    // Set size (1-16)
    SIZE: (size: number) => [
      GS,
      0x28,
      0x6b,
      0x03,
      0x00,
      0x31,
      0x43,
      Math.min(16, Math.max(1, size)),
    ],
    // Set error correction level (L=48, M=49, Q=50, H=51)
    ERROR_CORRECTION: {
      L: [GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30],
      M: [GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31],
      Q: [GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x32],
      H: [GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x33],
    },
    // Store data in symbol storage area
    STORE: (data: string) => {
      const bytes = Buffer.from(data, 'utf8');
      const len = bytes.length + 3;
      const pL = len & 0xff;
      const pH = (len >> 8) & 0xff;
      return [GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...bytes];
    },
    // Print symbol data
    PRINT: [GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30],
  },

  // Image/Graphics Commands
  IMAGE: {
    // Raster bit image mode
    RASTER: (width: number, height: number, data: number[]) => {
      const xL = (width / 8) & 0xff;
      const xH = ((width / 8) >> 8) & 0xff;
      const yL = height & 0xff;
      const yH = (height >> 8) & 0xff;
      return [GS, 0x76, 0x30, 0x00, xL, xH, yL, yH, ...data];
    },
  },

  // Cash Drawer
  CASH_DRAWER: {
    OPEN_PIN2: [ESC, 0x70, 0x00, 0x19, 0xfa], // Open cash drawer (pin 2)
    OPEN_PIN5: [ESC, 0x70, 0x01, 0x19, 0xfa], // Open cash drawer (pin 5)
  },

  // Character Set
  CHARSET: {
    PC437: [ESC, 0x74, 0x00], // USA
    PC850: [ESC, 0x74, 0x02], // Multilingual
    PC860: [ESC, 0x74, 0x03], // Portuguese
    PC863: [ESC, 0x74, 0x04], // Canadian French
    PC865: [ESC, 0x74, 0x05], // Nordic
    WPC1252: [ESC, 0x74, 0x10], // Western European
    PC866: [ESC, 0x74, 0x11], // Cyrillic
    PC852: [ESC, 0x74, 0x12], // Latin 2
    UTF8: [ESC, 0x74, 0xff], // UTF-8 (if supported)
  },

  // Line Spacing
  LINE_SPACING: {
    DEFAULT: [ESC, 0x32], // Default line spacing
    SET: (n: number) => [ESC, 0x33, n], // Set line spacing to n dots
  },

  // Beeper
  BEEP: (times: number = 1, duration: number = 3) => [
    ESC,
    0x42,
    Math.min(9, times),
    Math.min(9, duration),
  ],
} as const;

/**
 * Convert command array to Buffer
 */
export function toBuffer(commands: number[]): Buffer {
  return Buffer.from(commands);
}

/**
 * Concatenate multiple command arrays
 */
export function concat(...commands: (number[] | Buffer)[]): Buffer {
  const buffers = commands.map((cmd) => (Array.isArray(cmd) ? Buffer.from(cmd) : cmd));
  return Buffer.concat(buffers);
}

/**
 * Encode text with proper character encoding
 */
export function encodeText(text: string, encoding: BufferEncoding = 'utf8'): Buffer {
  return Buffer.from(text, encoding);
}
