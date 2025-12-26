import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  padString,
  createLine,
  wordWrap,
  truncate,
  getCharsPerLine,
} from './format';

describe('formatCurrency', () => {
  it('formats basic number', () => {
    expect(formatCurrency(123.45)).toBe('123.45');
  });

  it('formats with symbol before', () => {
    expect(formatCurrency(99.99, { symbol: '$', symbolPosition: 'before' })).toBe('$99.99');
  });

  it('formats with symbol after', () => {
    expect(formatCurrency(99.99, { symbol: 'USD', symbolPosition: 'after' })).toBe('99.99 USD');
  });

  it('formats with thousand separators', () => {
    expect(formatCurrency(1234567.89, { thousandSeparator: ',' })).toBe('1,234,567.89');
  });

  it('handles negative numbers', () => {
    expect(formatCurrency(-50.00)).toBe('-50.00');
  });
});

describe('padString', () => {
  it('pads left-aligned text', () => {
    expect(padString('test', 10, 'left')).toBe('test      ');
  });

  it('pads right-aligned text', () => {
    expect(padString('test', 10, 'right')).toBe('      test');
  });

  it('pads center-aligned text', () => {
    expect(padString('test', 10, 'center')).toBe('   test   ');
  });

  it('truncates if too long', () => {
    expect(padString('verylongtext', 5, 'left')).toBe('veryl');
  });
});

describe('createLine', () => {
  it('creates line with default character', () => {
    expect(createLine(5)).toBe('-----');
  });

  it('creates line with custom character', () => {
    expect(createLine(5, '=')).toBe('=====');
  });
});

describe('wordWrap', () => {
  it('returns single line if fits', () => {
    expect(wordWrap('hello', 10)).toEqual(['hello']);
  });

  it('wraps long text', () => {
    expect(wordWrap('hello world foo bar', 10)).toEqual(['hello', 'world foo', 'bar']);
  });
});

describe('truncate', () => {
  it('returns original if fits', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates with ellipsis', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });
});

describe('getCharsPerLine', () => {
  it('returns 32 for 58mm', () => {
    expect(getCharsPerLine(58)).toBe(32);
  });

  it('returns 48 for 80mm', () => {
    expect(getCharsPerLine(80)).toBe(48);
  });
});
