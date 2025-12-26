import type {
  PrintContent,
  TableContent,
  TextStyle,
  TableColumn,
  BarcodeOptions,
  QRCodeOptions,
  ImageOptions,
  ReceiptData,
  CurrencyOptions,
  PaperWidth,
} from '../types';
import { DEFAULTS } from '../types';
import { formatCurrency, formatDate, getCharsPerLine } from './format';

/**
 * Receipt builder for creating print-ready content
 * Provides a fluent API for building receipts
 */
export class ReceiptBuilder {
  private contents: PrintContent[] = [];
  private paperWidth: PaperWidth;
  private charsPerLine: number;
  private currencyOptions: CurrencyOptions;

  constructor(paperWidth: PaperWidth = DEFAULTS.PAPER_WIDTH) {
    this.paperWidth = paperWidth;
    this.charsPerLine = getCharsPerLine(paperWidth);
    this.currencyOptions = {};
  }

  /**
   * Set currency formatting options
   */
  setCurrency(options: CurrencyOptions): this {
    this.currencyOptions = options;
    return this;
  }

  /**
   * Add text content
   */
  text(value: string, style?: TextStyle): this {
    this.contents.push({
      type: 'text',
      value,
      style,
    });
    return this;
  }

  /**
   * Add centered text
   */
  textCenter(value: string, style?: Omit<TextStyle, 'align'>): this {
    return this.text(value, { ...style, align: 'center' });
  }

  /**
   * Add right-aligned text
   */
  textRight(value: string, style?: Omit<TextStyle, 'align'>): this {
    return this.text(value, { ...style, align: 'right' });
  }

  /**
   * Add bold text
   */
  textBold(value: string, style?: Omit<TextStyle, 'bold'>): this {
    return this.text(value, { ...style, bold: true });
  }

  /**
   * Add title (centered, bold, double size)
   */
  title(value: string): this {
    return this.text(value, { align: 'center', bold: true, size: 'double' });
  }

  /**
   * Add subtitle (centered, bold)
   */
  subtitle(value: string): this {
    return this.text(value, { align: 'center', bold: true });
  }

  /**
   * Add a line separator
   */
  line(character?: string): this {
    this.contents.push({
      type: 'line',
      character,
    });
    return this;
  }

  /**
   * Add dashed line
   */
  dashedLine(): this {
    return this.line('-');
  }

  /**
   * Add equals line
   */
  doubleLine(): this {
    return this.line('=');
  }

  /**
   * Add empty lines
   */
  feed(lines: number = DEFAULTS.FEED_LINES): this {
    this.contents.push({
      type: 'feed',
      lines,
    });
    return this;
  }

  /**
   * Add paper cut command
   */
  cut(partial: boolean = false): this {
    this.contents.push({
      type: 'cut',
      partial,
    });
    return this;
  }

  /**
   * Add table row
   */
  tableRow(columns: (string | TableColumn)[]): this {
    const row: TableColumn[] = columns.map((col) =>
      typeof col === 'string' ? { text: col } : col
    );

    // Find existing table or create new one
    const lastContent = this.contents[this.contents.length - 1];
    if (lastContent && lastContent.type === 'table') {
      (lastContent as TableContent).rows.push(row);
    } else {
      this.contents.push({
        type: 'table',
        rows: [row],
      });
    }
    return this;
  }

  /**
   * Add a simple two-column row (label: value)
   */
  row(label: string, value: string, labelBold = false): this {
    return this.tableRow([
      { text: label, align: 'left', bold: labelBold },
      { text: value, align: 'right' },
    ]);
  }

  /**
   * Add an item row (name, qty, price)
   */
  itemRow(name: string, qty: number, price: number): this {
    return this.tableRow([
      { text: name, width: '50%', align: 'left' },
      { text: qty.toString(), width: '15%', align: 'center' },
      { text: formatCurrency(price, this.currencyOptions), width: '35%', align: 'right' },
    ]);
  }

  /**
   * Add a total row (bold, right-aligned)
   */
  totalRow(label: string, amount: number): this {
    return this.tableRow([
      { text: label, align: 'left', bold: true },
      { text: formatCurrency(amount, this.currencyOptions), align: 'right', bold: true },
    ]);
  }

  /**
   * Add barcode
   */
  barcode(value: string, options?: Partial<BarcodeOptions>): this {
    this.contents.push({
      type: 'barcode',
      value,
      options: {
        type: options?.type || 'CODE128',
        width: options?.width || DEFAULTS.BARCODE_WIDTH,
        height: options?.height || DEFAULTS.BARCODE_HEIGHT,
        showText: options?.showText ?? true,
        textPosition: options?.textPosition || 'below',
        align: options?.align || 'center',
      },
    });
    return this;
  }

  /**
   * Add QR code
   */
  qrcode(value: string, options?: Partial<QRCodeOptions>): this {
    this.contents.push({
      type: 'qrcode',
      value,
      options: {
        size: options?.size || DEFAULTS.QR_SIZE,
        errorCorrection: options?.errorCorrection || DEFAULTS.QR_ERROR_CORRECTION,
        align: options?.align || 'center',
      },
    });
    return this;
  }

  /**
   * Add image
   */
  image(source: string, options?: ImageOptions): this {
    this.contents.push({
      type: 'image',
      source,
      options,
    });
    return this;
  }

  /**
   * Add raw content
   */
  raw(content: PrintContent): this {
    this.contents.push(content);
    return this;
  }

  /**
   * Build receipt from ReceiptData
   */
  fromData(data: ReceiptData): this {
    // Header
    if (data.header) {
      if (data.header.logo) {
        this.image(data.header.logo, { align: 'center' });
      }
      if (data.header.title) {
        this.title(data.header.title);
      }
      if (data.header.subtitle) {
        this.subtitle(data.header.subtitle);
      }
      if (data.header.address) {
        data.header.address.forEach((line) => this.textCenter(line));
      }
      if (data.header.phone) {
        this.textCenter(data.header.phone);
      }
      this.line();
    }

    // Meta information
    if (data.meta) {
      if (data.meta.orderNumber) {
        this.row('Order #:', data.meta.orderNumber);
      }
      if (data.meta.date) {
        this.row('Date:', formatDate(data.meta.date));
      }
      if (data.meta.cashier) {
        this.row('Cashier:', data.meta.cashier);
      }
      if (data.meta.customer) {
        this.row('Customer:', data.meta.customer);
      }
      this.line();
    }

    // Items header
    this.tableRow([
      { text: 'Item', width: '50%', align: 'left', bold: true },
      { text: 'Qty', width: '15%', align: 'center', bold: true },
      { text: 'Price', width: '35%', align: 'right', bold: true },
    ]);
    this.dashedLine();

    // Items
    data.items.forEach((item) => {
      this.itemRow(item.name, item.quantity, item.price);
    });

    this.line();

    // Totals
    if (data.totals) {
      if (data.totals.subtotal !== undefined) {
        this.row('Subtotal:', formatCurrency(data.totals.subtotal, this.currencyOptions));
      }
      if (data.totals.tax !== undefined) {
        this.row('Tax:', formatCurrency(data.totals.tax, this.currencyOptions));
      }
      if (data.totals.discount !== undefined && data.totals.discount > 0) {
        this.row('Discount:', `-${formatCurrency(data.totals.discount, this.currencyOptions)}`);
      }
      this.doubleLine();
      this.totalRow('TOTAL:', data.totals.total);
    }

    // Payment
    if (data.payment) {
      this.feed(1);
      this.row('Payment:', data.payment.method);
      this.row('Amount:', formatCurrency(data.payment.amount, this.currencyOptions));
      if (data.payment.change !== undefined && data.payment.change > 0) {
        this.row('Change:', formatCurrency(data.payment.change, this.currencyOptions));
      }
    }

    // Footer
    if (data.footer && data.footer.length > 0) {
      this.feed(1);
      this.line();
      data.footer.forEach((line) => this.textCenter(line));
    }

    this.feed();
    this.cut();

    return this;
  }

  /**
   * Get all contents
   */
  getContents(): PrintContent[] {
    return [...this.contents];
  }

  /**
   * Clear all contents
   */
  clear(): this {
    this.contents = [];
    return this;
  }

  /**
   * Get paper width
   */
  getPaperWidth(): PaperWidth {
    return this.paperWidth;
  }

  /**
   * Get characters per line
   */
  getCharsPerLine(): number {
    return this.charsPerLine;
  }
}

/**
 * Create a new receipt builder
 */
export function createReceipt(paperWidth?: PaperWidth): ReceiptBuilder {
  return new ReceiptBuilder(paperWidth);
}
