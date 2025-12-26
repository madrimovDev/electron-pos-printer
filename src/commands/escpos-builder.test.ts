import { describe, it, expect } from 'vitest';
import { buildESCPOSData, ESCPOSCommands } from './escpos-builder';
import type { PrintContent } from '../types';

describe('buildESCPOSData', () => {
  it('starts with INIT command', () => {
    const data = buildESCPOSData([]);
    expect(data[0]).toBe(0x1b); // ESC
    expect(data[1]).toBe(0x40); // @
  });

  it('builds simple text', () => {
    const contents: PrintContent[] = [
      { type: 'text', value: 'Hello' },
    ];
    const data = buildESCPOSData(contents);
    expect(data.includes(Buffer.from('Hello', 'utf8')[0])).toBe(true);
  });

  it('builds centered text with alignment command', () => {
    const contents: PrintContent[] = [
      { type: 'text', value: 'Center', style: { align: 'center' } },
    ];
    const data = buildESCPOSData(contents);
    // Check for center alignment command: ESC a 1
    const alignCenter = Buffer.from([0x1b, 0x61, 0x01]);
    expect(data.includes(alignCenter[0])).toBe(true);
  });

  it('builds bold text', () => {
    const contents: PrintContent[] = [
      { type: 'text', value: 'Bold', style: { bold: true } },
    ];
    const data = buildESCPOSData(contents);
    // Check for bold on command: ESC E 1
    expect(data.includes(0x45)).toBe(true);
  });

  it('builds line separator', () => {
    const contents: PrintContent[] = [
      { type: 'line', character: '-' },
    ];
    const data = buildESCPOSData(contents, 80);
    // Should contain 48 dashes for 80mm paper
    const dashCount = data.filter(b => b === 0x2d).length; // 0x2d = '-'
    expect(dashCount).toBe(48);
  });

  it('builds feed command', () => {
    const contents: PrintContent[] = [
      { type: 'feed', lines: 5 },
    ];
    const data = buildESCPOSData(contents);
    // Feed command: ESC d n
    expect(data.includes(0x64)).toBe(true);
    expect(data.includes(5)).toBe(true);
  });

  it('builds cut command', () => {
    const contents: PrintContent[] = [
      { type: 'cut' },
    ];
    const data = buildESCPOSData(contents);
    // Cut command: GS V A 0
    expect(data.includes(0x56)).toBe(true);
  });

  it('builds table with multiple columns', () => {
    const contents: PrintContent[] = [
      {
        type: 'table',
        rows: [
          [
            { text: 'Item', align: 'left' },
            { text: '100', align: 'right' },
          ],
        ],
      },
    ];
    const data = buildESCPOSData(contents, 80);
    expect(data.toString().includes('Item')).toBe(true);
    expect(data.toString().includes('100')).toBe(true);
  });

  it('builds QR code', () => {
    const contents: PrintContent[] = [
      { type: 'qrcode', value: 'https://example.com', options: { size: 6, align: 'center' } },
    ];
    const data = buildESCPOSData(contents);
    // QR commands use GS ( k
    expect(data.includes(0x28)).toBe(true);
    expect(data.includes(0x6b)).toBe(true);
  });

  it('builds barcode', () => {
    const contents: PrintContent[] = [
      {
        type: 'barcode',
        value: '123456',
        options: { type: 'CODE128', height: 80, width: 2, align: 'center' },
      },
    ];
    const data = buildESCPOSData(contents);
    // Barcode height command: GS h
    expect(data.includes(0x68)).toBe(true);
    // Barcode width command: GS w
    expect(data.includes(0x77)).toBe(true);
  });

  it('handles 58mm paper width', () => {
    const contents: PrintContent[] = [
      { type: 'line' },
    ];
    const data = buildESCPOSData(contents, 58);
    // Should contain 32 dashes for 58mm paper
    const dashCount = data.filter(b => b === 0x2d).length;
    expect(dashCount).toBe(32);
  });
});

describe('ESCPOSCommands', () => {
  it('has INIT command', () => {
    expect(ESCPOSCommands.INIT).toBeDefined();
    expect(ESCPOSCommands.INIT[0]).toBe(0x1b);
    expect(ESCPOSCommands.INIT[1]).toBe(0x40);
  });

  it('has alignment commands', () => {
    expect(ESCPOSCommands.ALIGN_LEFT).toBeDefined();
    expect(ESCPOSCommands.ALIGN_CENTER).toBeDefined();
    expect(ESCPOSCommands.ALIGN_RIGHT).toBeDefined();
  });

  it('has feed function', () => {
    const feed5 = ESCPOSCommands.feed(5);
    expect(feed5[0]).toBe(0x1b);
    expect(feed5[1]).toBe(0x64);
    expect(feed5[2]).toBe(5);
  });
});
