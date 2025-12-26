const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const os = require('os');

// IPC Channel names
const IPC_CHANNELS = {
  GET_PRINTERS: 'pos-printer:get-printers',
  PRINT: 'pos-printer:print',
};

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools();
}

// Setup IPC handlers
function setupPrinterIPC() {
  // Get printers
  ipcMain.handle(IPC_CHANNELS.GET_PRINTERS, async (event) => {
    try {
      const printers = await event.sender.getPrintersAsync();
      console.log('Found printers:', printers.length);
      return printers;
    } catch (err) {
      console.error('Error getting printers:', err);
      return [];
    }
  });

  // Print content using RAW ESC/POS commands
  ipcMain.handle(IPC_CHANNELS.PRINT, async (event, contents, config) => {
    const jobId = `print-${Date.now()}`;
    const paperWidth = config.paperWidth || 80;
    const charsPerLine = paperWidth === 58 ? 32 : 48;

    try {
      // Build ESC/POS commands from contents
      const escposData = buildESCPOS(contents, charsPerLine);

      // Save to temp file (cross-platform)
      const tempFile = path.join(os.tmpdir(), `receipt-${jobId}.bin`);
      fs.writeFileSync(tempFile, escposData);

      console.log('ESC/POS data saved to:', tempFile);
      console.log('Data length:', escposData.length, 'bytes');

      // Print using platform-specific command
      return printRaw(tempFile, config.printerName, jobId);
    } catch (err) {
      console.error('Print error:', err);
      return { success: false, jobId, error: err.message };
    }
  });

  console.log('Printer IPC handlers registered');
}

/**
 * Cross-platform raw printing
 * - Linux: lp -d <printer> -o raw <file>
 * - macOS: lp -d <printer> -o raw <file>
 * - Windows: PowerShell with .NET RawPrinterHelper
 */
function printRaw(filePath, printerName, jobId) {
  return new Promise((resolve) => {
    const platform = os.platform();

    console.log(`Platform: ${platform}, Printer: ${printerName}`);

    if (platform === 'win32') {
      // Windows: Use PowerShell with .NET to send raw data
      printRawWindows(filePath, printerName, jobId, resolve);
    } else {
      // Linux/macOS: Use lp command (CUPS)
      printRawUnix(filePath, printerName, jobId, resolve);
    }
  });
}

/**
 * Windows raw printing using PowerShell and .NET
 */
function printRawWindows(filePath, printerName, jobId, resolve) {
  // PowerShell script that uses .NET RawPrinterHelper
  const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", CharSet = CharSet.Ansi, SetLastError = true)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", CharSet = CharSet.Ansi, SetLastError = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendBytesToPrinter(string szPrinterName, IntPtr pBytes, Int32 dwCount)
    {
        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "RAW Document";
        di.pDataType = "RAW";
        bool bSuccess = false;

        if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero))
        {
            if (StartDocPrinter(hPrinter, 1, di))
            {
                if (StartPagePrinter(hPrinter))
                {
                    int dwWritten = 0;
                    bSuccess = WritePrinter(hPrinter, pBytes, dwCount, out dwWritten);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return bSuccess;
    }

    public static bool SendFileToPrinter(string szPrinterName, string szFileName)
    {
        byte[] bytes = System.IO.File.ReadAllBytes(szFileName);
        IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
        bool bSuccess = SendBytesToPrinter(szPrinterName, pUnmanagedBytes, bytes.Length);
        Marshal.FreeCoTaskMem(pUnmanagedBytes);
        return bSuccess;
    }
}
"@

try {
    \$result = [RawPrinterHelper]::SendFileToPrinter("${printerName}", "${filePath.replace(/\\/g, '\\\\')}")
    if (\$result) {
        Write-Output "SUCCESS"
        exit 0
    } else {
        Write-Error "Failed to send data to printer"
        exit 1
    }
} catch {
    Write-Error \$_.Exception.Message
    exit 1
}
`;

  const child = spawn('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-Command', psScript
  ], {
    windowsHide: true
  });

  let stdout = '';
  let stderr = '';

  child.stdout?.on('data', (data) => {
    stdout += data.toString();
  });

  child.stderr?.on('data', (data) => {
    stderr += data.toString();
  });

  child.on('close', (code) => {
    // Clean up temp file
    try { fs.unlinkSync(filePath); } catch (e) {}

    if (code === 0 && stdout.includes('SUCCESS')) {
      console.log('Print job submitted successfully');
      resolve({ success: true, jobId });
    } else {
      console.error('Print error:', stderr || stdout);
      resolve({ success: false, jobId, error: stderr || stdout || 'Print failed' });
    }
  });

  child.on('error', (err) => {
    try { fs.unlinkSync(filePath); } catch (e) {}
    console.error('Spawn error:', err);
    resolve({ success: false, jobId, error: err.message });
  });
}

/**
 * Unix (Linux/macOS) raw printing using lp command
 */
function printRawUnix(filePath, printerName, jobId, resolve) {
  const child = spawn('lp', ['-d', printerName, '-o', 'raw', filePath]);

  let stdout = '';
  let stderr = '';

  child.stdout?.on('data', (data) => {
    stdout += data.toString();
  });

  child.stderr?.on('data', (data) => {
    stderr += data.toString();
  });

  child.on('close', (code) => {
    // Clean up temp file
    try { fs.unlinkSync(filePath); } catch (e) {}

    if (code === 0) {
      console.log('Print job submitted:', stdout || 'OK');
      resolve({ success: true, jobId });
    } else {
      console.error('Print error:', stderr || `Exit code: ${code}`);
      resolve({ success: false, jobId, error: stderr || `Print failed with code ${code}` });
    }
  });

  child.on('error', (err) => {
    try { fs.unlinkSync(filePath); } catch (e) {}
    console.error('Spawn error:', err);
    resolve({ success: false, jobId, error: err.message });
  });
}

// ESC/POS Commands
const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

const CMD = {
  INIT: Buffer.from([ESC, 0x40]),                    // Initialize printer
  LF: Buffer.from([LF]),                              // Line feed
  ALIGN_LEFT: Buffer.from([ESC, 0x61, 0x00]),        // Left align
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),      // Center align
  ALIGN_RIGHT: Buffer.from([ESC, 0x61, 0x02]),       // Right align
  BOLD_ON: Buffer.from([ESC, 0x45, 0x01]),           // Bold on
  BOLD_OFF: Buffer.from([ESC, 0x45, 0x00]),          // Bold off
  UNDERLINE_ON: Buffer.from([ESC, 0x2D, 0x01]),      // Underline on
  UNDERLINE_OFF: Buffer.from([ESC, 0x2D, 0x00]),     // Underline off
  DOUBLE_ON: Buffer.from([ESC, 0x21, 0x30]),         // Double width & height
  DOUBLE_OFF: Buffer.from([ESC, 0x21, 0x00]),        // Normal size
  DOUBLE_HEIGHT: Buffer.from([ESC, 0x21, 0x10]),     // Double height only
  DOUBLE_WIDTH: Buffer.from([ESC, 0x21, 0x20]),      // Double width only
  CUT: Buffer.from([GS, 0x56, 0x41, 0x00]),          // Partial cut
  FEED: (n) => Buffer.from([ESC, 0x64, n]),          // Feed n lines
};

// Build ESC/POS data from contents
function buildESCPOS(contents, charsPerLine) {
  const buffers = [CMD.INIT];

  for (const item of contents) {
    switch (item.type) {
      case 'text': {
        const style = item.style || {};

        // Alignment
        if (style.align === 'center') buffers.push(CMD.ALIGN_CENTER);
        else if (style.align === 'right') buffers.push(CMD.ALIGN_RIGHT);
        else buffers.push(CMD.ALIGN_LEFT);

        // Size
        if (style.size === 'double') buffers.push(CMD.DOUBLE_ON);
        else if (style.size === 'double-height') buffers.push(CMD.DOUBLE_HEIGHT);
        else if (style.size === 'double-width') buffers.push(CMD.DOUBLE_WIDTH);

        // Bold
        if (style.bold) buffers.push(CMD.BOLD_ON);

        // Underline
        if (style.underline) buffers.push(CMD.UNDERLINE_ON);

        // Text content
        buffers.push(Buffer.from(item.value, 'utf8'));
        buffers.push(CMD.LF);

        // Reset styles
        if (style.bold) buffers.push(CMD.BOLD_OFF);
        if (style.underline) buffers.push(CMD.UNDERLINE_OFF);
        if (style.size) buffers.push(CMD.DOUBLE_OFF);
        buffers.push(CMD.ALIGN_LEFT);
        break;
      }

      case 'line': {
        const char = item.character || '-';
        buffers.push(Buffer.from(char.repeat(charsPerLine), 'utf8'));
        buffers.push(CMD.LF);
        break;
      }

      case 'table': {
        for (const row of item.rows) {
          const colWidths = calculateColumnWidths(row, charsPerLine);
          let line = '';

          row.forEach((col, i) => {
            const width = colWidths[i];
            let text = col.text || '';

            // Truncate or pad
            if (text.length > width) {
              text = text.substring(0, width);
            } else {
              const padding = width - text.length;
              if (col.align === 'right') {
                text = ' '.repeat(padding) + text;
              } else if (col.align === 'center') {
                const left = Math.floor(padding / 2);
                text = ' '.repeat(left) + text + ' '.repeat(padding - left);
              } else {
                text = text + ' '.repeat(padding);
              }
            }
            line += text;
          });

          // Check if any column is bold
          const hasBold = row.some(col => col.bold);
          if (hasBold) buffers.push(CMD.BOLD_ON);

          buffers.push(Buffer.from(line, 'utf8'));
          buffers.push(CMD.LF);

          if (hasBold) buffers.push(CMD.BOLD_OFF);
        }
        break;
      }

      case 'feed': {
        const lines = item.lines || 1;
        buffers.push(CMD.FEED(lines));
        break;
      }

      case 'cut': {
        buffers.push(CMD.FEED(3)); // Feed before cut
        buffers.push(CMD.CUT);
        break;
      }

      case 'qrcode': {
        // QR Code commands
        const data = item.value;
        const size = (item.options?.size || 6);

        // QR Code: Set size
        buffers.push(Buffer.from([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, size]));
        // QR Code: Set error correction (M)
        buffers.push(Buffer.from([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31]));
        // QR Code: Store data
        const dataBytes = Buffer.from(data, 'utf8');
        const len = dataBytes.length + 3;
        const pL = len & 0xFF;
        const pH = (len >> 8) & 0xFF;
        buffers.push(Buffer.from([GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30]));
        buffers.push(dataBytes);
        // QR Code: Print
        buffers.push(Buffer.from([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]));
        buffers.push(CMD.LF);
        break;
      }

      case 'barcode': {
        // Simple CODE128 barcode
        const data = item.value;
        // Set barcode height
        buffers.push(Buffer.from([GS, 0x68, 80]));
        // Set barcode width
        buffers.push(Buffer.from([GS, 0x77, 2]));
        // Print HRI below
        buffers.push(Buffer.from([GS, 0x48, 0x02]));
        // Print CODE128
        buffers.push(Buffer.from([GS, 0x6B, 0x49, data.length + 2, 0x7B, 0x42]));
        buffers.push(Buffer.from(data, 'ascii'));
        buffers.push(CMD.LF);
        break;
      }
    }
  }

  return Buffer.concat(buffers);
}

// Calculate column widths for table
function calculateColumnWidths(columns, totalWidth) {
  const widths = [];
  let usedWidth = 0;
  let flexCount = 0;

  // First pass: calculate fixed widths
  for (const col of columns) {
    if (col.width) {
      if (typeof col.width === 'string' && col.width.endsWith('%')) {
        const percent = parseInt(col.width) / 100;
        const w = Math.floor(totalWidth * percent);
        widths.push(w);
        usedWidth += w;
      } else {
        widths.push(col.width);
        usedWidth += col.width;
      }
    } else {
      widths.push(null);
      flexCount++;
    }
  }

  // Second pass: distribute remaining width
  if (flexCount > 0) {
    const remaining = totalWidth - usedWidth;
    const flexWidth = Math.floor(remaining / flexCount);
    for (let i = 0; i < widths.length; i++) {
      if (widths[i] === null) {
        widths[i] = flexWidth;
      }
    }
  }

  return widths;
}

// Build HTML from print contents (for preview)
function buildHTML(contents, paperWidth) {
  const width = paperWidth === 58 ? '48mm' : '72mm';
  const fontSize = paperWidth === 58 ? '11px' : '12px';

  const styles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      font-size: ${fontSize};
      line-height: 1.3;
      width: ${width};
      padding: 2mm;
      background: white;
    }
    .text { margin: 2px 0; white-space: pre-wrap; }
    .text-left { text-align: left; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-bold { font-weight: bold; }
    .text-double { font-size: 1.5em; font-weight: bold; }
    .line { border-bottom: 1px dashed #000; margin: 4px 0; }
    .table { width: 100%; border-collapse: collapse; }
    .table td { padding: 2px 0; vertical-align: top; }
    .feed { height: 1em; }
    .qrcode { text-align: center; padding: 10px; }
    @media print {
      @page { margin: 0; size: ${width} auto; }
    }
  `;

  let body = '';

  for (const item of contents) {
    switch (item.type) {
      case 'text': {
        const style = item.style || {};
        const classes = ['text'];
        if (style.align) classes.push(`text-${style.align}`);
        if (style.bold) classes.push('text-bold');
        if (style.size === 'double') classes.push('text-double');
        body += `<p class="${classes.join(' ')}">${escapeHtml(item.value)}</p>`;
        break;
      }
      case 'line':
        body += '<div class="line"></div>';
        break;
      case 'table':
        body += '<table class="table">';
        for (const row of item.rows) {
          body += '<tr>';
          for (const col of row) {
            const align = col.align || 'left';
            const bold = col.bold ? 'font-weight:bold;' : '';
            body += `<td style="text-align:${align};${bold}">${escapeHtml(col.text)}</td>`;
          }
          body += '</tr>';
        }
        body += '</table>';
        break;
      case 'feed':
        const lines = item.lines || 1;
        body += `<div class="feed" style="height:${lines}em"></div>`;
        break;
      case 'qrcode':
        body += `<div class="qrcode">[QR: ${escapeHtml(item.value)}]</div>`;
        break;
      case 'cut':
        body += '<div style="page-break-after: always;"></div>';
        break;
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>${styles}</style>
</head>
<body>${body}</body>
</html>`;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

app.whenReady().then(() => {
  setupPrinterIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
