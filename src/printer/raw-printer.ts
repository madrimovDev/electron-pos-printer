/**
 * Cross-platform raw ESC/POS printing
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import type { PrintResult } from '../types';

/**
 * Send raw data to printer using platform-specific commands
 * - Linux: lp -d <printer> -o raw <file>
 * - macOS: lp -d <printer> -o raw <file>
 * - Windows: PowerShell with .NET RawPrinterHelper
 */
export async function printRawData(
  data: Buffer,
  printerName: string
): Promise<PrintResult> {
  const jobId = `print-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const tempFile = path.join(os.tmpdir(), `receipt-${jobId}.bin`);

  // Write data to temp file
  fs.writeFileSync(tempFile, data);

  try {
    const platform = os.platform();

    if (platform === 'win32') {
      return await printRawWindows(tempFile, printerName, jobId);
    } else {
      return await printRawUnix(tempFile, printerName, jobId);
    }
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Windows raw printing using PowerShell and .NET RawPrinterHelper
 */
function printRawWindows(
  filePath: string,
  printerName: string,
  jobId: string
): Promise<PrintResult> {
  return new Promise((resolve) => {
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
    $result = [RawPrinterHelper]::SendFileToPrinter("${printerName}", "${filePath.replace(/\\/g, '\\\\')}")
    if ($result) {
        Write-Output "SUCCESS"
        exit 0
    } else {
        Write-Error "Failed to send data to printer"
        exit 1
    }
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
`;

    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      psScript,
    ], {
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      if (code === 0 && stdout.includes('SUCCESS')) {
        resolve({ success: true, jobId });
      } else {
        resolve({
          success: false,
          jobId,
          error: stderr || stdout || 'Print failed',
        });
      }
    });

    child.on('error', (err) => {
      resolve({
        success: false,
        jobId,
        error: err.message,
      });
    });
  });
}

/**
 * Unix (Linux/macOS) raw printing using lp command (CUPS)
 */
function printRawUnix(
  filePath: string,
  printerName: string,
  jobId: string
): Promise<PrintResult> {
  return new Promise((resolve) => {
    const child = spawn('lp', ['-d', printerName, '-o', 'raw', filePath]);

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, jobId });
      } else {
        resolve({
          success: false,
          jobId,
          error: stderr || `Print failed with exit code ${code}`,
        });
      }
    });

    child.on('error', (err) => {
      resolve({
        success: false,
        jobId,
        error: err.message,
      });
    });
  });
}

/**
 * Check if raw printing is supported on current platform
 */
export function isRawPrintingSupported(): boolean {
  return ['linux', 'darwin', 'win32'].includes(os.platform());
}

/**
 * Get platform-specific printing info
 */
export function getPlatformPrintInfo(): {
  platform: string;
  method: string;
  requirements: string[];
} {
  const platform = os.platform();

  switch (platform) {
    case 'linux':
      return {
        platform: 'Linux',
        method: 'CUPS (lp command)',
        requirements: ['CUPS installed', 'Printer configured in CUPS'],
      };
    case 'darwin':
      return {
        platform: 'macOS',
        method: 'CUPS (lp command)',
        requirements: ['Printer configured in System Preferences'],
      };
    case 'win32':
      return {
        platform: 'Windows',
        method: 'Windows Print Spooler (winspool.drv)',
        requirements: ['Printer installed in Windows', 'PowerShell available'],
      };
    default:
      return {
        platform,
        method: 'Unknown',
        requirements: ['Platform not supported'],
      };
  }
}
