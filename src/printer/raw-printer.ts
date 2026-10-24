/**
 * Cross-platform raw ESC/POS printing
 */
import { promises as fsp } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import type { PrintResult } from '../types';

/** Environment variable carrying the target printer name into the PowerShell script. */
export const WINDOWS_ENV_PRINTER = 'POS_PRINTER_NAME';
/** Environment variable carrying the spool file path into the PowerShell script. */
export const WINDOWS_ENV_FILE = 'POS_PRINTER_FILE';

/**
 * Raw-print helper for Windows.
 *
 * The script is a constant: the printer name and file path arrive through the
 * environment rather than being interpolated into the source. Interpolation
 * broke on any name containing a quote and was injection-shaped, and passing
 * the values as argv instead would still expose Node's Windows argument-quoting
 * edge cases (trailing backslashes, embedded quotes) — exactly the inputs being
 * guarded. The environment has no quoting surface at all.
 */
export const WINDOWS_RAW_PRINT_SCRIPT = `
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

$printerName = $env:${WINDOWS_ENV_PRINTER}
$filePath = $env:${WINDOWS_ENV_FILE}

if ([string]::IsNullOrEmpty($printerName)) {
    Write-Error "${WINDOWS_ENV_PRINTER} is not set"
    exit 1
}
if ([string]::IsNullOrEmpty($filePath)) {
    Write-Error "${WINDOWS_ENV_FILE} is not set"
    exit 1
}

try {
    if ([RawPrinterHelper]::SendFileToPrinter($printerName, $filePath)) {
        Write-Output "SUCCESS"
        exit 0
    }
    Write-Error "Failed to send data to printer"
    exit 1
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
`;

/**
 * Send raw data to printer using platform-specific commands
 * - Linux: lp -d <printer> -o raw <file>
 * - macOS: lp -d <printer> -o raw <file>
 * - Windows: PowerShell with .NET RawPrinterHelper
 */
export async function printRawData(data: Buffer, printerName: string): Promise<PrintResult> {
  const jobId = `print-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const tempFile = join(tmpdir(), `receipt-${jobId}.bin`);

  // Written asynchronously: writeFileSync blocks Electron's main process, and a
  // large receipt with a logo is not a trivial write.
  await fsp.writeFile(tempFile, data);

  try {
    return platform() === 'win32'
      ? await printRawWindows(tempFile, printerName, jobId)
      : await printRawUnix(tempFile, printerName, jobId);
  } finally {
    await fsp.unlink(tempFile).catch(() => {
      // The spool job already read the file; a failed cleanup is not an error.
    });
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
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_RAW_PRINT_SCRIPT],
      {
        windowsHide: true,
        env: {
          ...process.env,
          [WINDOWS_ENV_PRINTER]: printerName,
          [WINDOWS_ENV_FILE]: filePath,
        },
      }
    );

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
        resolve({ success: false, jobId, error: stderr || stdout || 'Print failed' });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, jobId, error: err.message });
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
  return ['linux', 'darwin', 'win32'].includes(platform());
}

/**
 * Get platform-specific printing info
 */
export function getPlatformPrintInfo(): {
  platform: string;
  method: string;
  requirements: string[];
} {
  const currentPlatform = platform();

  switch (currentPlatform) {
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
        platform: currentPlatform,
        method: 'Unknown',
        requirements: ['Platform not supported'],
      };
  }
}
