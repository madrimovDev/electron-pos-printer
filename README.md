# electron-pos-printer

A powerful thermal POS printer library for Electron applications. Supports 58mm and 80mm thermal printers with raw ESC/POS commands.

## Features

- **Cross-platform**: Works on Windows, macOS, and Linux
- **Raw ESC/POS printing**: Direct thermal printer control
- **Support for 58mm and 80mm** thermal printers
- **Fluent API** for building receipts
- **Barcode and QR code** support
- **Table formatting** with automatic column widths
- **Full TypeScript** support
- **Works with Electron 28+**

## Installation

```bash
npm install electron-pos-printer
```

## Quick Start

### 1. Main Process (main.ts)

```typescript
import { app, BrowserWindow, ipcMain } from 'electron';
import { buildESCPOSData, printRawData } from 'electron-pos-printer';

// IPC handler for getting printers
ipcMain.handle('get-printers', async (event) => {
  return await event.sender.getPrintersAsync();
});

// IPC handler for printing
ipcMain.handle('print', async (event, contents, printerName, paperWidth) => {
  const escposData = buildESCPOSData(contents, paperWidth);
  return await printRawData(escposData, printerName);
});
```

### 2. Preload Script (preload.ts)

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('printer', {
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  print: (contents, printerName, paperWidth) =>
    ipcRenderer.invoke('print', contents, printerName, paperWidth),
});
```

### 3. Renderer Process (renderer.ts)

```typescript
// Get available printers
const printers = await window.printer.getPrinters();

// Build and print a receipt
const contents = [
  { type: 'text', value: 'MY STORE', style: { align: 'center', bold: true, size: 'double' } },
  { type: 'text', value: '123 Main Street', style: { align: 'center' } },
  { type: 'line' },
  { type: 'table', rows: [
    [{ text: 'Item', bold: true }, { text: 'Price', align: 'right', bold: true }],
    [{ text: 'Coffee' }, { text: '$4.50', align: 'right' }],
    [{ text: 'Sandwich' }, { text: '$8.99', align: 'right' }],
  ]},
  { type: 'line' },
  { type: 'table', rows: [
    [{ text: 'TOTAL:', bold: true }, { text: '$13.49', align: 'right', bold: true }],
  ]},
  { type: 'feed', lines: 1 },
  { type: 'qrcode', value: 'https://mystore.com/receipt/123' },
  { type: 'feed', lines: 3 },
  { type: 'cut' },
];

const result = await window.printer.print(contents, 'POS-80', 80);
console.log(result.success ? 'Printed!' : result.error);
```

## Using ReceiptBuilder (Fluent API)

```typescript
import { createReceipt, buildESCPOSData, printRawData } from 'electron-pos-printer';

const receipt = createReceipt(80) // 80mm paper
  .setCurrency({ symbol: '$', symbolPosition: 'before' })
  .title('MY STORE')
  .textCenter('123 Main Street')
  .textCenter('Tel: (555) 123-4567')
  .line()
  .tableRow([
    { text: 'Item', width: '60%', bold: true },
    { text: 'Price', width: '40%', align: 'right', bold: true },
  ])
  .dashedLine()
  .row('Coffee', '$4.50')
  .row('Sandwich', '$8.99')
  .doubleLine()
  .totalRow('TOTAL:', 13.49)
  .feed(2)
  .qrcode('https://receipt.example.com/123')
  .feed(3)
  .cut();

const escposData = buildESCPOSData(receipt.getContents(), 80);
await printRawData(escposData, 'POS-80');
```

## API Reference

### Content Types

| Type | Description | Properties |
|------|-------------|------------|
| `text` | Text content | `value`, `style` |
| `line` | Line separator | `character` |
| `table` | Table rows | `rows` |
| `feed` | Paper feed | `lines` |
| `cut` | Cut paper | `partial` |
| `barcode` | Barcode | `value`, `options` |
| `qrcode` | QR Code | `value`, `options` |

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

### ReceiptBuilder Methods

| Method | Description |
|--------|-------------|
| `text(value, style?)` | Add text |
| `textCenter(value)` | Add centered text |
| `textBold(value)` | Add bold text |
| `title(value)` | Large centered bold text |
| `line(char?)` | Line separator |
| `dashedLine()` | Dashed line |
| `doubleLine()` | Double line (===) |
| `feed(lines?)` | Feed paper |
| `cut(partial?)` | Cut paper |
| `tableRow(columns)` | Add table row |
| `row(label, value)` | Two-column row |
| `totalRow(label, amount)` | Bold total row |
| `barcode(value, options?)` | Add barcode |
| `qrcode(value, options?)` | Add QR code |

## Platform Support

| Platform | Method | Requirements |
|----------|--------|--------------|
| **Linux** | CUPS (`lp` command) | CUPS installed, printer configured |
| **macOS** | CUPS (`lp` command) | Printer in System Preferences |
| **Windows** | Print Spooler | Printer installed, PowerShell |

## Paper Width

| Width | Characters per Line |
|-------|---------------------|
| 58mm | 32 |
| 80mm | 48 |

## Requirements

- Node.js >= 18.0.0
- Electron >= 28.0.0

## License

MIT
