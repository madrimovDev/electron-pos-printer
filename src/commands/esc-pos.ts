/**
 * ESC/POS command constants — the single source of truth for this package.
 *
 * Every value is a `Buffer` (or a function returning one) so that command
 * tables never diverge between modules. Character-table selection lives in
 * `./codepage` (`selectCodepage`), not here.
 */
import type { BarcodeType } from '../types';

// Control characters
export const NUL = 0x00; // Null
export const LF = 0x0a; // Line feed
export const CR = 0x0d; // Carriage return
export const HT = 0x09; // Horizontal tab
export const FF = 0x0c; // Form feed
export const ESC = 0x1b; // Escape
export const FS = 0x1c; // Field separator
export const GS = 0x1d; // Group separator
export const DLE = 0x10; // Data link escape

const buf = (...bytes: number[]): Buffer => Buffer.from(bytes);

/** Clamps a value into a single byte. */
const clampByte = (n: number): number => Math.min(0xff, Math.max(0, Math.trunc(n)));

/** Clamps a value into an inclusive range. */
const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.trunc(n)));

export const Commands = {
  /** `ESC @` — reset the printer to its power-on state. */
  INIT: buf(ESC, 0x40),

  TEXT: {
    NORMAL: buf(ESC, 0x21, 0x00),
    BOLD_ON: buf(ESC, 0x45, 0x01),
    BOLD_OFF: buf(ESC, 0x45, 0x00),
    UNDERLINE_ON: buf(ESC, 0x2d, 0x01),
    UNDERLINE_2_ON: buf(ESC, 0x2d, 0x02),
    UNDERLINE_OFF: buf(ESC, 0x2d, 0x00),
    INVERT_ON: buf(GS, 0x42, 0x01),
    INVERT_OFF: buf(GS, 0x42, 0x00),
    DOUBLE_HEIGHT: buf(ESC, 0x21, 0x10),
    DOUBLE_WIDTH: buf(ESC, 0x21, 0x20),
    DOUBLE_SIZE: buf(ESC, 0x21, 0x30),
  },

  ALIGN: {
    LEFT: buf(ESC, 0x61, 0x00),
    CENTER: buf(ESC, 0x61, 0x01),
    RIGHT: buf(ESC, 0x61, 0x02),
  },

  PAPER: {
    FEED_1: buf(LF),
    /** `ESC d n` — feed n lines. */
    FEED_N: (n: number): Buffer => buf(ESC, 0x64, clampByte(n)),
    /** `GS V 0` — cut the paper through. */
    CUT_FULL: buf(GS, 0x56, 0x00),
    /**
     * `GS V 1` — partial cut, leaving one point uncut.
     *
     * Not `GS V 65 0`: in `GS V m n`, m=65 feeds and then cuts *fully*, and
     * m=66 is the partial variant. Using 65 here made `cut(partial: true)`
     * silently perform a full cut.
     */
    CUT_PARTIAL: buf(GS, 0x56, 0x01),
    /** `GS V 65 n` — feed n units, then full cut. */
    CUT_FEED_FULL: (n: number): Buffer => buf(GS, 0x56, 65, clampByte(n)),
    /** `GS V 66 n` — feed n units, then partial cut. */
    CUT_FEED_PARTIAL: (n: number): Buffer => buf(GS, 0x56, 66, clampByte(n)),
  },

  BARCODE: {
    /** `GS h n` — barcode height in dots (1-255). */
    HEIGHT: (h: number): Buffer => buf(GS, 0x68, clamp(h, 1, 255)),
    /** `GS w n` — barcode module width (2-6). */
    WIDTH: (w: number): Buffer => buf(GS, 0x77, clamp(w, 2, 6)),
    HRI_NONE: buf(GS, 0x48, 0x00),
    HRI_ABOVE: buf(GS, 0x48, 0x01),
    HRI_BELOW: buf(GS, 0x48, 0x02),
    HRI_BOTH: buf(GS, 0x48, 0x03),
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
    } as Readonly<Record<BarcodeType, number>>,
    /**
     * `GS k m n d1...dn` — print a barcode.
     *
     * The NUL-terminated form (`GS k m d... NUL`) only applies to m=0-6. All
     * type codes this package uses are 65-73, which require the length byte.
     */
    PRINT: (type: number, data: Buffer): Buffer => {
      if (data.length > 255) {
        throw new Error(`Barcode data is ${data.length} bytes; the maximum is 255`);
      }
      return Buffer.concat([buf(GS, 0x6b, type, data.length), data]);
    },
  },

  QRCODE: {
    /**
     * `GS ( k 4 0 49 65 n 0` — select the QR model.
     *
     * n is the *character* code: 49 for model 1, 50 for model 2. Sending the
     * raw number 1 or 2 selects nothing.
     */
    MODEL: (model: 1 | 2 = 2): Buffer =>
      buf(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, model === 1 ? 0x31 : 0x32, 0x00),
    /** `GS ( k 3 0 49 67 n` — module size (1-16). */
    SIZE: (size: number): Buffer =>
      buf(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, clamp(size, 1, 16)),
    ERROR_CORRECTION: {
      L: buf(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30),
      M: buf(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31),
      Q: buf(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x32),
      H: buf(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x33),
    },
    /** `GS ( k pL pH 49 80 48 d...` — store data in the symbol buffer. */
    STORE: (data: Buffer): Buffer => {
      const length = data.length + 3;
      if (length > 0xffff) {
        throw new Error(`QR data is ${data.length} bytes; the maximum is ${0xffff - 3}`);
      }
      return Buffer.concat([
        buf(GS, 0x28, 0x6b, length & 0xff, (length >> 8) & 0xff, 0x31, 0x50, 0x30),
        data,
      ]);
    },
    /** `GS ( k 3 0 49 81 48` — print the stored symbol. */
    PRINT: buf(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30),
  },

  IMAGE: {
    /**
     * `GS v 0 m xL xH yL yH d...` — raster bit image.
     *
     * The row width is rounded *up* to whole bytes; `width / 8` alone produces
     * a fraction for any width that is not a multiple of 8, which makes
     * `Buffer.from` throw.
     */
    RASTER: (width: number, height: number, data: Buffer): Buffer => {
      const widthBytes = Math.ceil(width / 8);
      const expected = widthBytes * height;
      if (data.length !== expected) {
        throw new Error(
          `Raster data length ${data.length} does not match ${widthBytes}x${height} (needs ${expected})`
        );
      }
      return Buffer.concat([
        buf(
          GS,
          0x76,
          0x30,
          0x00,
          widthBytes & 0xff,
          (widthBytes >> 8) & 0xff,
          height & 0xff,
          (height >> 8) & 0xff
        ),
        data,
      ]);
    },
  },

  CASH_DRAWER: {
    /** `ESC p 0 25 250` — pulse pin 2. */
    OPEN_PIN2: buf(ESC, 0x70, 0x00, 0x19, 0xfa),
    /** `ESC p 1 25 250` — pulse pin 5. */
    OPEN_PIN5: buf(ESC, 0x70, 0x01, 0x19, 0xfa),
  },

  LINE_SPACING: {
    DEFAULT: buf(ESC, 0x32),
    SET: (n: number): Buffer => buf(ESC, 0x33, clampByte(n)),
  },

  /** `ESC B n t` — beep n times for t units. */
  BEEP: (times = 1, duration = 3): Buffer =>
    buf(ESC, 0x42, clamp(times, 1, 9), clamp(duration, 1, 9)),
} as const;

/** Converts a byte array to a Buffer. */
export function toBuffer(commands: number[]): Buffer {
  return Buffer.from(commands);
}

/** Concatenates byte arrays and Buffers into one Buffer. */
export function concat(...commands: (number[] | Buffer)[]): Buffer {
  return Buffer.concat(commands.map((cmd) => (Array.isArray(cmd) ? Buffer.from(cmd) : cmd)));
}
