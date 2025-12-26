# electron-pos-printer

A powerful thermal POS printer library for Electron applications. Supports 58mm and 80mm thermal printers with ESC/POS commands.

## Features

- Support for 58mm and 80mm thermal printers
- Fluent API for building receipts
- Barcode and QR code support
- Table formatting with automatic column widths
- Currency formatting
- Full TypeScript support
- Works with Electron 28+

## Installation

```bash
npm install electron-pos-printer
```

## Quick Start

### Main Process Setup

```typescript
// main.ts
import { app, BrowserWindow } from 'electron';
import { setupPrinterIPC } from 'electron-pos-printer';

app.whenReady().then(() => {
  // Setup IPC handlers for printer operations
  setupPrinterIPC();

  const mainWindow = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });
});
```

### Preload Script

```typescript
// preload.ts
import { exposePosPrinterAPI } from 'electron-pos-printer';

// Expose the POS printer API to the renderer
exposePosPrinterAPI();
```

### Renderer Process

```typescript
// renderer.ts
import { createPosPrinter, createReceipt } from 'electron-pos-printer';

const printer = createPosPrinter();

// Get available printers
const printers = await printer.getPrinters();
console.log('Available printers:', printers);

// Create a receipt
const receipt = createReceipt(80) // 80mm paper
  .setCurrency({ symbol: 'USD', symbolPosition: 'before' })
  .title('MY STORE')
  .textCenter('123 Main Street')
  .textCenter('Tel: +1 234 567 8900')
  .line()
  .tableRow([
    { text: 'Item', width: '50%', bold: true },
    { text: 'Qty', width: '15%', align: 'center', bold: true },
    { text: 'Price', width: '35%', align: 'right', bold: true },
  ])
  .dashedLine()
  .itemRow('Coffee', 2, 4.50)
  .itemRow('Sandwich', 1, 8.99)
  .itemRow('Cookie', 3, 2.00)
  .line()
  .totalRow('TOTAL:', 23.99)
  .feed()
  .textCenter('Thank you for your purchase!')
  .feed()
  .qrcode('https://mystore.com/receipt/12345')
  .feed()
  .cut();

// Print the receipt
const result = await printer.printReceipt(receipt, 'POS-58');
console.log('Print result:', result);
```

## API Reference

### ReceiptBuilder Methods

| Method | Description |
|--------|-------------|
| `text(value, style?)` | Add text with optional styling |
| `textCenter(value)` | Add centered text |
| `textRight(value)` | Add right-aligned text |
| `textBold(value)` | Add bold text |
| `title(value)` | Add title (centered, bold, double size) |
| `subtitle(value)` | Add subtitle (centered, bold) |
| `line(char?)` | Add line separator |
| `dashedLine()` | Add dashed line |
| `doubleLine()` | Add double line (===) |
| `feed(lines?)` | Add empty lines |
| `cut(partial?)` | Add paper cut command |
| `tableRow(columns)` | Add table row |
| `row(label, value)` | Add simple label-value row |
| `itemRow(name, qty, price)` | Add item row |
| `totalRow(label, amount)` | Add total row (bold) |
| `barcode(value, options?)` | Add barcode |
| `qrcode(value, options?)` | Add QR code |
| `image(source, options?)` | Add image |
| `fromData(receiptData)` | Build from ReceiptData object |

### Text Styles

```typescript
interface TextStyle {
  bold?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  size?: 'normal' | 'double-height' | 'double-width' | 'double';
  invert?: boolean;
}
```

### Quick Receipt from Data

```typescript
const receipt = createReceipt(80).fromData({
  header: {
    title: 'MY STORE',
    address: ['123 Main St', 'City, State 12345'],
    phone: '+1 234 567 8900',
  },
  items: [
    { name: 'Coffee', quantity: 2, price: 4.50 },
    { name: 'Sandwich', quantity: 1, price: 8.99 },
  ],
  totals: {
    subtotal: 17.99,
    tax: 1.44,
    total: 19.43,
  },
  payment: {
    method: 'Cash',
    amount: 20.00,
    change: 0.57,
  },
  footer: ['Thank you!', 'Visit again!'],
});
```

## Paper Width

| Width | Characters per Line |
|-------|---------------------|
| 58mm  | 32                  |
| 80mm  | 48                  |

## Requirements

- Node.js >= 18.0.0
- Electron >= 28.0.0

## License

MIT
