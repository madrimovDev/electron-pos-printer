import type { CurrencyOptions, TextAlign, PaperWidth } from '../types';
import { DEFAULTS } from '../types';

/**
 * Default currency formatting options
 */
const defaultCurrencyOptions: Required<CurrencyOptions> = {
  symbol: '',
  decimals: 2,
  thousandSeparator: ' ',
  decimalSeparator: '.',
  symbolPosition: 'after',
};

/**
 * Format a number as currency
 */
export function formatCurrency(
  amount: number,
  options: CurrencyOptions = {}
): string {
  const opts = { ...defaultCurrencyOptions, ...options };

  const fixed = Math.abs(amount).toFixed(opts.decimals);
  const [intPart, decPart] = fixed.split('.');

  // Add thousand separators
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, opts.thousandSeparator);

  // Combine parts
  let result = decPart ? `${formattedInt}${opts.decimalSeparator}${decPart}` : formattedInt;

  // Add negative sign if needed
  if (amount < 0) {
    result = `-${result}`;
  }

  // Add currency symbol
  if (opts.symbol) {
    result =
      opts.symbolPosition === 'before'
        ? `${opts.symbol}${result}`
        : `${result} ${opts.symbol}`;
  }

  return result;
}

/**
 * Pad a string to a specific length
 */
export function padString(
  text: string,
  length: number,
  align: TextAlign = 'left',
  padChar = ' '
): string {
  if (text.length >= length) {
    return text.substring(0, length);
  }

  const padding = length - text.length;

  switch (align) {
    case 'left':
      return text + padChar.repeat(padding);
    case 'right':
      return padChar.repeat(padding) + text;
    case 'center': {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return padChar.repeat(leftPad) + text + padChar.repeat(rightPad);
    }
  }
}

/**
 * Create a line separator
 */
export function createLine(
  length: number,
  char: string = DEFAULTS.LINE_CHARACTER
): string {
  return char.repeat(length);
}

/**
 * Word wrap text to fit within a specific width
 */
export function wordWrap(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) {
    return [text];
  }

  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (word.length > maxWidth) {
      // Word is too long, need to split it
      if (currentLine) {
        lines.push(currentLine.trim());
        currentLine = '';
      }

      // Split long word
      for (let i = 0; i < word.length; i += maxWidth) {
        if (i + maxWidth < word.length) {
          lines.push(word.substring(i, i + maxWidth));
        } else {
          currentLine = word.substring(i);
        }
      }
    } else if ((currentLine + ' ' + word).trim().length <= maxWidth) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) {
        lines.push(currentLine.trim());
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine.trim());
  }

  return lines;
}

/**
 * Format a table row with columns
 */
export function formatTableRow(
  columns: { text: string; width: number; align?: TextAlign }[],
  totalWidth: number,
  separator = ' '
): string {
  const parts = columns.map((col) =>
    padString(col.text, col.width, col.align || 'left')
  );
  return parts.join(separator).substring(0, totalWidth);
}

/**
 * Calculate column widths for a table
 */
export function calculateColumnWidths(
  columns: { width?: number | string }[],
  totalWidth: number
): number[] {
  const widths: number[] = [];
  let remainingWidth = totalWidth;
  let flexColumns = 0;

  // First pass: calculate fixed widths and count flex columns
  for (const col of columns) {
    if (col.width === undefined) {
      flexColumns++;
      widths.push(-1); // Placeholder for flex
    } else if (typeof col.width === 'string' && col.width.endsWith('%')) {
      const percent = parseInt(col.width, 10) / 100;
      const width = Math.floor(totalWidth * percent);
      widths.push(width);
      remainingWidth -= width;
    } else {
      const width = typeof col.width === 'number' ? col.width : parseInt(col.width, 10);
      widths.push(width);
      remainingWidth -= width;
    }
  }

  // Second pass: distribute remaining width to flex columns
  if (flexColumns > 0) {
    const flexWidth = Math.floor(remainingWidth / flexColumns);
    for (let i = 0; i < widths.length; i++) {
      if (widths[i] === -1) {
        widths[i] = flexWidth;
      }
    }
  }

  return widths;
}

/**
 * Truncate text with ellipsis if too long
 */
export function truncate(text: string, maxLength: number, ellipsis = '...'): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Get characters per line based on paper width
 */
export function getCharsPerLine(paperWidth: PaperWidth): number {
  return paperWidth === 58 ? DEFAULTS.CHARS_PER_LINE_58 : DEFAULTS.CHARS_PER_LINE_80;
}

/**
 * Format date for receipt
 */
export function formatDate(date: Date, format = 'dd.MM.yyyy HH:mm'): string {
  const pad = (n: number) => n.toString().padStart(2, '0');

  const replacements: Record<string, string> = {
    yyyy: date.getFullYear().toString(),
    MM: pad(date.getMonth() + 1),
    dd: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
  };

  let result = format;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(key, value);
  }

  return result;
}
