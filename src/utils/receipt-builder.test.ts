import { describe, it, expect } from 'vitest';
import { createReceipt, ReceiptBuilder } from './receipt-builder';

describe('ReceiptBuilder', () => {
  it('creates receipt with correct paper width', () => {
    const receipt58 = createReceipt(58);
    const receipt80 = createReceipt(80);

    expect(receipt58.getPaperWidth()).toBe(58);
    expect(receipt80.getPaperWidth()).toBe(80);
  });

  it('returns correct chars per line', () => {
    const receipt58 = createReceipt(58);
    const receipt80 = createReceipt(80);

    expect(receipt58.getCharsPerLine()).toBe(32);
    expect(receipt80.getCharsPerLine()).toBe(48);
  });

  it('adds text content', () => {
    const receipt = createReceipt().text('Hello World');
    const contents = receipt.getContents();

    expect(contents).toHaveLength(1);
    expect(contents[0].type).toBe('text');
    expect((contents[0] as { value: string }).value).toBe('Hello World');
  });

  it('adds centered text', () => {
    const receipt = createReceipt().textCenter('Center');
    const contents = receipt.getContents();

    expect(contents[0].type).toBe('text');
    expect((contents[0] as { style?: { align?: string } }).style?.align).toBe('center');
  });

  it('adds title with proper styling', () => {
    const receipt = createReceipt().title('My Title');
    const contents = receipt.getContents();
    const content = contents[0] as { style?: { align?: string; bold?: boolean; size?: string } };

    expect(content.style?.align).toBe('center');
    expect(content.style?.bold).toBe(true);
    expect(content.style?.size).toBe('double');
  });

  it('adds line separator', () => {
    const receipt = createReceipt().line();
    const contents = receipt.getContents();

    expect(contents[0].type).toBe('line');
  });

  it('adds feed command', () => {
    const receipt = createReceipt().feed(5);
    const contents = receipt.getContents();

    expect(contents[0].type).toBe('feed');
    expect((contents[0] as { lines?: number }).lines).toBe(5);
  });

  it('adds cut command', () => {
    const receipt = createReceipt().cut();
    const contents = receipt.getContents();

    expect(contents[0].type).toBe('cut');
  });

  it('chains multiple operations', () => {
    const receipt = createReceipt()
      .title('Store')
      .line()
      .text('Item 1')
      .text('Item 2')
      .line()
      .feed()
      .cut();

    expect(receipt.getContents()).toHaveLength(7);
  });

  it('clears contents', () => {
    const receipt = createReceipt().text('Hello').text('World');
    expect(receipt.getContents()).toHaveLength(2);

    receipt.clear();
    expect(receipt.getContents()).toHaveLength(0);
  });

  it('adds QR code', () => {
    const receipt = createReceipt().qrcode('https://example.com');
    const contents = receipt.getContents();

    expect(contents[0].type).toBe('qrcode');
    expect((contents[0] as { value: string }).value).toBe('https://example.com');
  });

  it('adds barcode', () => {
    const receipt = createReceipt().barcode('123456789');
    const contents = receipt.getContents();

    expect(contents[0].type).toBe('barcode');
    expect((contents[0] as { value: string }).value).toBe('123456789');
  });

  it('creates receipt from data object', () => {
    const receipt = createReceipt().fromData({
      header: {
        title: 'Test Store',
      },
      items: [
        { name: 'Item 1', quantity: 1, price: 10.00 },
        { name: 'Item 2', quantity: 2, price: 5.00 },
      ],
      totals: {
        total: 20.00,
      },
    });

    const contents = receipt.getContents();
    expect(contents.length).toBeGreaterThan(0);
  });
});
