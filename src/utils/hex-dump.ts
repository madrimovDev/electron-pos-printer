/**
 * Turns an ESC/POS byte stream into readable, annotated text.
 *
 * Byte-level tests are the only way to verify printer output without hardware,
 * and a raw hex diff is nearly unreadable. This renders `1B 74 11` as
 * `ESC t 17  Select character table (PC866)`, so a failing assertion says what
 * actually changed.
 */
import { CODEPAGE_TABLES, CODEPAGE_ESC_T, UNDEFINED_CHAR } from '../commands/codepage-tables';
import type { Codepage } from '../commands/codepage-tables';

const MAX_HEX_BYTES = 8;
const ALIGNMENTS = ['left', 'center', 'right'];
const HRI_POSITIONS: Record<number, string> = { 0: 'none', 1: 'above', 2: 'below', 3: 'both' };
const BARCODE_NAMES: Record<number, string> = {
  0x41: 'UPC-A',
  0x42: 'UPC-E',
  0x43: 'EAN13',
  0x44: 'EAN8',
  0x45: 'CODE39',
  0x46: 'ITF',
  0x47: 'CODABAR',
  0x48: 'CODE93',
  0x49: 'CODE128',
};

interface Decoded {
  /** Total bytes this entry consumes. */
  length: number;
  mnemonic: string;
  note: string;
}

const hex2 = (n: number): string => n.toString(16).toUpperCase().padStart(2, '0');
const onOff = (n: number): string => (n === 0 ? 'off' : 'on');

function codepageFor(escT: number): Codepage | undefined {
  return (Object.keys(CODEPAGE_ESC_T) as Codepage[]).find((name) => CODEPAGE_ESC_T[name] === escT);
}

function sizeNote(n: number): string {
  const width = ((n >> 4) & 0x07) + 1;
  const height = (n & 0x07) + 1;
  return `${width}x width, ${height}x height`;
}

/** Decodes the command starting at `offset`, or null if it is not recognised. */
function decodeCommand(data: Buffer, offset: number): Decoded | null {
  const at = (i: number): number => data[offset + i] ?? 0;

  switch (at(0)) {
    case 0x0a:
      return { length: 1, mnemonic: 'LF', note: 'Line feed' };
    case 0x0d:
      return { length: 1, mnemonic: 'CR', note: 'Carriage return' };
    case 0x1b:
      switch (at(1)) {
        case 0x40:
          return { length: 2, mnemonic: 'ESC @', note: 'Initialize printer' };
        case 0x32:
          return { length: 2, mnemonic: 'ESC 2', note: 'Default line spacing' };
        case 0x33:
          return { length: 3, mnemonic: `ESC 3 ${at(2)}`, note: `Line spacing ${at(2)} dots` };
        case 0x74: {
          const name = codepageFor(at(2));
          return {
            length: 3,
            mnemonic: `ESC t ${at(2)}`,
            note: `Select character table (${name ?? 'vendor-specific'})`,
          };
        }
        case 0x61:
          return {
            length: 3,
            mnemonic: `ESC a ${at(2)}`,
            note: `Align ${ALIGNMENTS[at(2)] ?? 'unknown'}`,
          };
        case 0x45:
          return { length: 3, mnemonic: `ESC E ${at(2)}`, note: `Bold ${onOff(at(2))}` };
        case 0x2d:
          return {
            length: 3,
            mnemonic: `ESC - ${at(2)}`,
            note: at(2) === 0 ? 'Underline off' : `Underline on (${at(2)}-dot)`,
          };
        case 0x21:
          return { length: 3, mnemonic: `ESC ! ${at(2)}`, note: `Character size: ${sizeNote(at(2))}` };
        case 0x64:
          return { length: 3, mnemonic: `ESC d ${at(2)}`, note: `Feed ${at(2)} line(s)` };
        case 0x70:
          return { length: 5, mnemonic: `ESC p ${at(2)}`, note: `Pulse cash drawer pin ${at(2) === 0 ? 2 : 5}` };
        case 0x42:
          return { length: 4, mnemonic: `ESC B ${at(2)} ${at(3)}`, note: `Beep ${at(2)} time(s)` };
        default:
          return null;
      }
    case 0x1d:
      switch (at(1)) {
        case 0x42:
          return { length: 3, mnemonic: `GS B ${at(2)}`, note: `White/black reverse ${onOff(at(2))}` };
        case 0x56: {
          const mode = at(2);
          if (mode === 65 || mode === 66) {
            return {
              length: 4,
              mnemonic: `GS V ${mode} ${at(3)}`,
              note: `Feed ${at(3)}, then ${mode === 65 ? 'full cut' : 'partial cut'}`,
            };
          }
          return {
            length: 3,
            mnemonic: `GS V ${mode}`,
            note: mode === 1 || mode === 49 ? 'Partial cut' : 'Full cut',
          };
        }
        case 0x68:
          return { length: 3, mnemonic: `GS h ${at(2)}`, note: `Barcode height ${at(2)} dots` };
        case 0x77:
          return { length: 3, mnemonic: `GS w ${at(2)}`, note: `Barcode module width ${at(2)}` };
        case 0x48:
          return {
            length: 3,
            mnemonic: `GS H ${at(2)}`,
            note: `HRI position ${HRI_POSITIONS[at(2)] ?? 'unknown'}`,
          };
        case 0x6b: {
          const payload = at(3);
          const total = 4 + payload;
          return {
            length: total,
            mnemonic: `GS k ${at(2)} ${payload}`,
            note: `Print barcode (${BARCODE_NAMES[at(2)] ?? 'unknown type'}, ${total} bytes)`,
          };
        }
        case 0x28: {
          if (at(2) !== 0x6b) return null;
          const params = at(3) + (at(4) << 8);
          const fn = at(6);
          const notes: Record<number, string> = {
            0x41: 'Select QR model',
            0x43: `Set QR module size ${at(7)}`,
            0x45: 'Set QR error correction',
            0x50: 'Store QR data',
            0x51: 'Print QR symbol',
          };
          const total = 5 + params;
          return {
            length: total,
            mnemonic: `GS ( k ${at(5)} ${fn}`,
            note: `${notes[fn] ?? 'QR function'} (${total} bytes)`,
          };
        }
        case 0x76: {
          if (at(2) !== 0x30) return null;
          const widthBytes = at(4) + (at(5) << 8);
          const height = at(6) + (at(7) << 8);
          const total = 8 + widthBytes * height;
          return {
            length: total,
            mnemonic: 'GS v 0',
            note: `Raster image ${widthBytes * 8}x${height} (${total} bytes)`,
          };
        }
        default:
          return null;
      }
    default:
      return null;
  }
}

/** True when a byte belongs in a printable text run rather than a command. */
function isTextByte(byte: number, table: Codepage): boolean {
  if (byte >= 0x20 && byte < 0x7f) return true;
  if (byte < 0x80) return false;
  return CODEPAGE_TABLES[table][byte - 0x80] !== UNDEFINED_CHAR;
}

function decodeTextRun(data: Buffer, table: Codepage): string {
  let out = '';
  for (const byte of data) {
    out += byte < 0x80 ? String.fromCharCode(byte) : CODEPAGE_TABLES[table][byte - 0x80];
  }
  return out;
}

function formatLine(offset: number, bytes: Buffer, mnemonic: string, note: string): string {
  const shown = [...bytes.subarray(0, MAX_HEX_BYTES)].map(hex2).join(' ');
  const hexColumn = bytes.length > MAX_HEX_BYTES ? `${shown} ...` : shown;
  return [
    offset.toString(16).padStart(4, '0'),
    hexColumn.padEnd(MAX_HEX_BYTES * 3 + 3),
    mnemonic.padEnd(16),
    note,
  ]
    .join('  ')
    .trimEnd();
}

/**
 * Renders an ESC/POS byte stream as annotated lines, one per command or text run.
 *
 * @param options.table Codepage used to decode high bytes in text runs. Only
 *   affects how the dump *reads* — it does not change the bytes.
 */
export function dumpESCPOS(data: Buffer, options?: { table?: Codepage }): string {
  const table = options?.table ?? 'PC437';
  const lines: string[] = [];
  let offset = 0;

  while (offset < data.length) {
    const command = decodeCommand(data, offset);
    if (command) {
      const length = Math.min(command.length, data.length - offset);
      lines.push(formatLine(offset, data.subarray(offset, offset + length), command.mnemonic, command.note));
      offset += length;
      continue;
    }

    if (isTextByte(data[offset], table)) {
      let end = offset;
      while (end < data.length && isTextByte(data[end], table) && !decodeCommand(data, end)) {
        end++;
      }
      const run = data.subarray(offset, end);
      lines.push(formatLine(offset, run, `"${decodeTextRun(run, table)}"`, `(${table}, ${run.length} bytes)`));
      offset = end;
      continue;
    }

    lines.push(formatLine(offset, data.subarray(offset, offset + 1), hex2(data[offset]), 'unknown byte'));
    offset += 1;
  }

  return lines.join('\n');
}
