/**
 * Cross-platform raw ESC/POS printing
 */
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';
import type { PrintResult } from '../types';

/**
 * Send raw data to printer using platform-specific commands
 * - Linux: lp -d <printer> -o raw <file>
 * - macOS: lp -d <printer> -o raw <file>
 * - Windows: copy /b <file> \\<computer>\<printer>
 */
export async function printRawData(
  data: Buffer,
  printerName: string
): Promise<PrintResult> {
  const jobId = `print-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const tempFile = `${os.tmpdir()}/receipt-${jobId}.bin`;

  // Write data to temp file
  fs.writeFileSync(tempFile, data);

  try {
    return await sendToPrinter(tempFile, printerName, jobId);
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
 * Send file to printer using platform-specific command
 */
function sendToPrinter(
  filePath: string,
  printerName: string,
  jobId: string
): Promise<PrintResult> {
  return new Promise((resolve) => {
    const platform = os.platform();
    let command: string;
    let args: string[];

    if (platform === 'win32') {
      // Windows: Copy to shared printer
      command = 'cmd.exe';
      args = ['/c', `copy /b "${filePath}" "\\\\%COMPUTERNAME%\\${printerName}"`];
    } else {
      // Linux/macOS: Use lp command (CUPS)
      command = 'lp';
      args = ['-d', printerName, '-o', 'raw', filePath];
    }

    const child = spawn(command, args, {
      shell: platform === 'win32',
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
        method: 'Shared printer copy',
        requirements: ['Printer shared on network', 'Raw printing enabled'],
      };
    default:
      return {
        platform,
        method: 'Unknown',
        requirements: ['Platform not supported'],
      };
  }
}
