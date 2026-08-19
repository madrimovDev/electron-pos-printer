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
} from '../types';
import { DEFAULTS } from '../types';
import { calculateColumnWidths } from '../utils/format';
import { Commands } from './esc-pos';
import { encodeText, normalizeForCodepage, selectCodepage, resolveCodepage } from './codepage';
import type { Codepage } from './codepage';

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
  const context: BuildContext = { charsPerLine, table };

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
      // Raster image support arrives in milestone 2. Emitting a '[IMAGE]'
      // placeholder would print that literal text on a customer's receipt, and
      // throwing would break every receipt built from data with a logo, so the
      // content is skipped.
      return [];
    default:
      return [];
  }
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
      return /^[0-9A-Z \-.$/+%*]+$/.test(value)
        ? null
        : 'CODE39 allows only 0-9, A-Z, space and - . $ / + % *';
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
  return [
    alignmentCommand(options?.align),
    Commands.QRCODE.MODEL(2),
    Commands.QRCODE.SIZE(options?.size ?? DEFAULTS.QR_SIZE),
    Commands.QRCODE.ERROR_CORRECTION[options?.errorCorrection ?? DEFAULTS.QR_ERROR_CORRECTION],
    // QR symbols carry their own encoding; the printer's character table does
    // not apply to them, so the data goes out as UTF-8.
    Commands.QRCODE.STORE(Buffer.from(value, 'utf8')),
    Commands.QRCODE.PRINT,
    Commands.PAPER.FEED_1,
    Commands.ALIGN.LEFT,
  ];
}
