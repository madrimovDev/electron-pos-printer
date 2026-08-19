/**
 * Builds raw ESC/POS bytes from a PrintContent array.
 *
 * Command constants come from `./esc-pos` — this module keeps no table of its
 * own, because two tables inevitably drift apart. Text goes through
 * `./codepage`, and layout arithmetic runs on *normalized* text so that column
 * widths stay correct (see the pipeline note in `./codepage`).
 */
import type {
  PrintContent,
  TextStyle,
  TableColumn,
  TextAlign,
  PaperWidth,
  BarcodeType,
  BarcodeOptions,
  QRCodeOptions,
  QRErrorCorrection,
} from '../types';
import { DEFAULTS, PRINTABLE_WIDTH_58, PRINTABLE_WIDTH_80 } from '../types';
import type { ImageOptions } from '../types';
import { calculateColumnWidths } from '../utils/format';
import { Commands } from './esc-pos';
import { encodeText, normalizeForCodepage, selectCodepage, resolveCodepage } from './codepage';
import type { Codepage } from './codepage';
import { decodePNG } from '../images/png';
import { rasterize, toBands } from '../images/raster';

export interface BuildESCPOSOptions {
  /** Paper width in mm. Determines charsPerLine unless that is given. */
  paperWidth?: PaperWidth;
  /** Character table, by name or as a raw `ESC t` value. Defaults to `'PC437'`. */
  codepage?: Codepage | number;
  /** Encoding table to use when `codepage` is a number. Defaults to `'PC437'`. */
  codepageTable?: Codepage;
  /**
   * Characters per line, overriding the value derived from paperWidth. Needed
   * for printers that are neither 32 nor 48 columns — 42 is common.
   */
  charsPerLine?: number;
}

/** Settings resolved once per build and threaded through the content builders. */
interface BuildContext {
  charsPerLine: number;
  table: Codepage;
  /** Printable width in dots, for image content. */
  printableWidth: number;
}

/** Builds the complete ESC/POS byte stream for a receipt. */
export function buildESCPOSData(
  contents: PrintContent[],
  options: BuildESCPOSOptions = {}
): Buffer {
  const paperWidth = options.paperWidth ?? DEFAULTS.PAPER_WIDTH;
  const charsPerLine =
    options.charsPerLine ??
    (paperWidth === 58 ? DEFAULTS.CHARS_PER_LINE_58 : DEFAULTS.CHARS_PER_LINE_80);
  const { escT, table } = resolveCodepage(options.codepage, options.codepageTable);
  const printableWidth = paperWidth === 58 ? PRINTABLE_WIDTH_58 : PRINTABLE_WIDTH_80;
  const context: BuildContext = { charsPerLine, table, printableWidth };

  const buffers: Buffer[] = [Commands.INIT, selectCodepage(escT)];
  for (const content of contents) {
    buffers.push(...buildContent(content, context));
  }
  return Buffer.concat(buffers);
}

function buildContent(content: PrintContent, context: BuildContext): Buffer[] {
  switch (content.type) {
    case 'text':
      return buildText(content.value, content.style, context);
    case 'line':
      return buildLine(content.character, context);
    case 'table':
      return buildTable(content.rows, context);
    case 'feed':
      return [Commands.PAPER.FEED_N(content.lines ?? DEFAULTS.FEED_LINES)];
    case 'cut':
      return [
        Commands.PAPER.FEED_N(3),
        content.partial ? Commands.PAPER.CUT_PARTIAL : Commands.PAPER.CUT_FULL,
      ];
    case 'barcode':
      return buildBarcode(content.value, content.options);
    case 'qrcode':
      return buildQRCode(content.value, content.options);
    case 'image':
      return buildImage(content.source, content.options, context);
    case 'cashdraw':
      return [
        content.pin === 5 ? Commands.CASH_DRAWER.OPEN_PIN5 : Commands.CASH_DRAWER.OPEN_PIN2,
      ];
    case 'beep':
      return [Commands.BEEP(content.times ?? 1, content.duration ?? 3)];
    default:
      return assertNever(content);
  }
}

/**
 * Paths a caller is likely to pass by mistake, now that only base64 is accepted.
 *
 * Safe against false positives despite `/` being a base64 character: every PNG
 * begins with the same 8-byte signature, so its base64 always starts `iVBOR`
 * and never ends in an image extension like `.png`.
 */
const LOOKS_LIKE_PATH = /^(\.{0,2}\/|[A-Za-z]:[\\/]|\\\\)|\.(png|jpe?g|gif|bmp|webp)$/i;
const PNG_DATA_URL = /^data:image\/png;base64,/i;

/** Turns an image source into PNG bytes. Base64 or a data URL only. */
function decodeImageSource(source: string): Buffer {
  if (LOOKS_LIKE_PATH.test(source)) {
    throw new Error(
      'Image source must be base64 or a data:image/png;base64 URL — file paths are not accepted. ' +
        'Read the file yourself: readFileSync(path).toString("base64")'
    );
  }
  const base64 = PNG_DATA_URL.test(source) ? source.slice(source.indexOf(',') + 1) : source;
  return Buffer.from(base64, 'base64');
}

/**
 * Throws when an image option is present but unusable.
 *
 * `width` and `threshold` arrive over IPC as JSON, so TypeScript gives no
 * protection against a caller passing a computed value that came out wrong.
 * Left unchecked: `width: 0` emits a raster declaring zero bytes per line,
 * `width: -5` surfaces as a raw `RangeError` from a typed array constructor
 * deep in the rasteriser, `width: 1.5` produces a fractional-width raster,
 * and an out-of-range `threshold` (or `NaN`) silently renders all-white or
 * all-black. Barcode and QR payloads already get named, actionable errors
 * for the equivalent mistake; images deserve the same.
 */
export function validateImageOptions(options: ImageOptions | undefined): void {
  if (!options) return;
  if (options.width !== undefined && (!Number.isInteger(options.width) || options.width <= 0)) {
    throw new Error(`Invalid image width ${options.width}: must be a positive integer`);
  }
  if (
    options.threshold !== undefined &&
    (!Number.isInteger(options.threshold) || options.threshold < 0 || options.threshold > 255)
  ) {
    throw new Error(
      `Invalid image threshold ${options.threshold}: must be an integer between 0 and 255`
    );
  }
}

function buildImage(
  source: string,
  options: ImageOptions | undefined,
  context: BuildContext
): Buffer[] {
  validateImageOptions(options);
  const raster = rasterize(decodePNG(decodeImageSource(source)), {
    maxWidth: context.printableWidth,
    width: options?.width,
    dither: options?.dither,
    threshold: options?.threshold,
  });

  const buffers: Buffer[] = [alignmentCommand(options?.align)];
  // GS v 0 advances to the next line after printing, so consecutive bands
  // would be separated by a line-spacing gap and the image would come out
  // striped. Zero spacing makes the bands butt together.
  buffers.push(Commands.LINE_SPACING.SET(0));
  for (const band of toBands(raster)) {
    buffers.push(Commands.IMAGE.RASTER(band.width, band.height, band.data));
  }
  buffers.push(Commands.LINE_SPACING.DEFAULT, Commands.ALIGN.LEFT);
  return buffers;
}

/**
 * Compile-time guard: adding a PrintContent variant without a case for it
 * becomes a type error here rather than a receipt that silently omits it.
 */
function assertNever(value: never): never {
  throw new Error(`Unhandled print content: ${JSON.stringify(value)}`);
}

function alignmentCommand(align: TextAlign | undefined): Buffer {
  if (align === 'center') return Commands.ALIGN.CENTER;
  if (align === 'right') return Commands.ALIGN.RIGHT;
  return Commands.ALIGN.LEFT;
}

function sizeCommand(size: TextStyle['size']): Buffer | undefined {
  switch (size) {
    case 'double':
      return Commands.TEXT.DOUBLE_SIZE;
    case 'double-height':
      return Commands.TEXT.DOUBLE_HEIGHT;
    case 'double-width':
      return Commands.TEXT.DOUBLE_WIDTH;
    default:
      return undefined;
  }
}

function hriCommand(position: BarcodeOptions['textPosition']): Buffer {
  switch (position) {
    case 'none':
      return Commands.BARCODE.HRI_NONE;
    case 'above':
      return Commands.BARCODE.HRI_ABOVE;
    case 'both':
      return Commands.BARCODE.HRI_BOTH;
    default:
      return Commands.BARCODE.HRI_BELOW;
  }
}

function buildText(text: string, style: TextStyle | undefined, context: BuildContext): Buffer[] {
  const buffers: Buffer[] = [alignmentCommand(style?.align)];

  const size = sizeCommand(style?.size);
  if (size) buffers.push(size);
  if (style?.bold) buffers.push(Commands.TEXT.BOLD_ON);
  if (style?.underline) buffers.push(Commands.TEXT.UNDERLINE_ON);
  if (style?.invert) buffers.push(Commands.TEXT.INVERT_ON);

  buffers.push(encodeText(text, context.table), Commands.PAPER.FEED_1);

  if (style?.invert) buffers.push(Commands.TEXT.INVERT_OFF);
  if (style?.underline) buffers.push(Commands.TEXT.UNDERLINE_OFF);
  if (style?.bold) buffers.push(Commands.TEXT.BOLD_OFF);
  if (size) buffers.push(Commands.TEXT.NORMAL);
  buffers.push(Commands.ALIGN.LEFT);

  return buffers;
}

function buildLine(character: string | undefined, context: BuildContext): Buffer[] {
  const normalized = normalizeForCodepage(character || DEFAULTS.LINE_CHARACTER, context.table);
  const separator = normalized.charAt(0) || DEFAULTS.LINE_CHARACTER;
  return [
    encodeText(separator.repeat(context.charsPerLine), context.table),
    Commands.PAPER.FEED_1,
  ];
}

/** Pads or truncates text to a fixed column width. */
function padColumn(text: string, width: number, align: TextAlign | undefined): string {
  if (text.length >= width) return text.substring(0, width);
  const padding = width - text.length;
  if (align === 'right') return ' '.repeat(padding) + text;
  if (align === 'center') {
    const left = Math.floor(padding / 2);
    return ' '.repeat(left) + text + ' '.repeat(padding - left);
  }
  return text + ' '.repeat(padding);
}

function buildTable(rows: TableColumn[][], context: BuildContext): Buffer[] {
  const buffers: Buffer[] = [];

  for (const row of rows) {
    const widths = calculateColumnWidths(row, context.charsPerLine);
    let line = '';
    row.forEach((column, index) => {
      // Normalize before measuring. An ellipsis becomes three characters and an
      // unencodable character becomes one question mark, so padding computed on
      // raw input would shift every column after it.
      const text = normalizeForCodepage(column.text ?? '', context.table);
      line += padColumn(text, widths[index], column.align);
    });

    const hasBold = row.some((column) => column.bold);
    if (hasBold) buffers.push(Commands.TEXT.BOLD_ON);
    buffers.push(encodeText(line, context.table), Commands.PAPER.FEED_1);
    if (hasBold) buffers.push(Commands.TEXT.BOLD_OFF);
  }

  return buffers;
}

const DIGITS_ONLY = /^\d+$/;

/** Returns why a value is invalid for a symbology, or null when it is fine. */
function barcodeError(type: BarcodeType, value: string): string | null {
  if (value.length === 0) return 'the value is empty';

  switch (type) {
    case 'EAN13':
      return DIGITS_ONLY.test(value) && (value.length === 12 || value.length === 13)
        ? null
        : 'EAN13 requires 12 or 13 digits';
    case 'EAN8':
      return DIGITS_ONLY.test(value) && (value.length === 7 || value.length === 8)
        ? null
        : 'EAN8 requires 7 or 8 digits';
    case 'UPC-A':
      return DIGITS_ONLY.test(value) && (value.length === 11 || value.length === 12)
        ? null
        : 'UPC-A requires 11 or 12 digits';
    case 'UPC-E':
      return DIGITS_ONLY.test(value) && value.length >= 6 && value.length <= 8
        ? null
        : 'UPC-E requires 6 to 8 digits';
    case 'ITF':
      if (!DIGITS_ONLY.test(value)) return 'ITF requires digits only';
      return value.length % 2 === 0 ? null : 'ITF requires an even number of digits';
    case 'CODE39':
      // '*' is CODE39's start/stop delimiter, not a data character. A value
      // may omit it (the printer adds it automatically) or wrap itself in a
      // matched pair, but '*' may not appear anywhere else.
      return /^(\*[0-9A-Z \-.$/+%]+\*|[0-9A-Z \-.$/+%]+)$/.test(value)
        ? null
        : 'CODE39 allows only 0-9, A-Z, space and - . $ / + %, optionally wrapped in a matched pair of *';
    case 'CODABAR':
      return /^[A-Da-d][0-9\-$:/.+]*[A-Da-d]$/.test(value)
        ? null
        : 'CODABAR must start and end with A-D and otherwise contain only 0-9 - $ : / . +';
    case 'CODE93':
    case 'CODE128':
      return /^[\x20-\x7e]+$/.test(value) ? null : `${type} requires printable ASCII`;
    default:
      return null;
  }
}

/**
 * Throws when a value cannot be encoded in the given symbology.
 *
 * Some printers hang on malformed barcode data — they stop responding and do
 * not even cut the paper — so this runs before any byte is sent.
 */
export function validateBarcodeValue(type: BarcodeType, value: string): void {
  const reason = barcodeError(type, value);
  if (reason !== null) {
    throw new Error(`Invalid ${type} barcode value ${JSON.stringify(value)}: ${reason}`);
  }
}

/**
 * Byte-mode capacity of a version-40 QR symbol, by error-correction level.
 *
 * Commands.QRCODE.STORE only rejects payloads above its 65532-byte length
 * field, which is far beyond what any symbol can hold. The real limit depends
 * on the error-correction level, and only the builder knows which level was
 * requested.
 */
const QR_CAPACITY: Record<QRErrorCorrection, number> = { L: 2953, M: 2331, Q: 1663, H: 1273 };

/** Throws when a value cannot fit a QR symbol at the given correction level. */
export function validateQRCodeValue(value: string, errorCorrection: QRErrorCorrection): void {
  if (value.length === 0) {
    throw new Error('QR code value is empty');
  }
  const bytes = Buffer.byteLength(value, 'utf8');
  const capacity = QR_CAPACITY[errorCorrection];
  if (bytes > capacity) {
    throw new Error(
      `QR code value is ${bytes} bytes; error correction level ${errorCorrection} holds at most ${capacity}`
    );
  }
}

/** Builds the payload bytes for a barcode, including any code-set prefix. */
function barcodePayload(type: BarcodeType, value: string): Buffer {
  if (type === 'CODE128') {
    // '{' introduces a code-set switch in ESC/POS CODE128 data, so a literal
    // brace has to be doubled to survive.
    const escaped = value.replace(/\{/g, '{{');
    // '{B' selects code set B, which covers printable ASCII.
    return Buffer.concat([Buffer.from([0x7b, 0x42]), Buffer.from(escaped, 'ascii')]);
  }
  return Buffer.from(value, 'ascii');
}

function buildBarcode(value: string, options: BarcodeOptions): Buffer[] {
  validateBarcodeValue(options.type, value);
  const typeCode = Commands.BARCODE.TYPE[options.type] ?? Commands.BARCODE.TYPE.CODE128;
  return [
    alignmentCommand(options.align),
    Commands.BARCODE.HEIGHT(options.height ?? DEFAULTS.BARCODE_HEIGHT),
    Commands.BARCODE.WIDTH(options.width ?? DEFAULTS.BARCODE_WIDTH),
    hriCommand(options.textPosition),
    Commands.BARCODE.PRINT(typeCode, barcodePayload(options.type, value)),
    Commands.PAPER.FEED_1,
    Commands.ALIGN.LEFT,
  ];
}

function buildQRCode(value: string, options?: QRCodeOptions): Buffer[] {
  const errorCorrection = options?.errorCorrection ?? DEFAULTS.QR_ERROR_CORRECTION;
  validateQRCodeValue(value, errorCorrection);
  return [
    alignmentCommand(options?.align),
    Commands.QRCODE.MODEL(2),
    Commands.QRCODE.SIZE(options?.size ?? DEFAULTS.QR_SIZE),
    Commands.QRCODE.ERROR_CORRECTION[errorCorrection],
    // QR symbols carry their own encoding; the printer's character table does
    // not apply to them, so the data goes out as UTF-8.
    Commands.QRCODE.STORE(Buffer.from(value, 'utf8')),
    Commands.QRCODE.PRINT,
    Commands.PAPER.FEED_1,
    Commands.ALIGN.LEFT,
  ];
}
