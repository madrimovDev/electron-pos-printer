import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  removeHandler: vi.fn(),
  fromWebContents: vi.fn(),
  printRawData: vi.fn(),
  printHTML: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle, removeHandler: mocks.removeHandler },
  BrowserWindow: { fromWebContents: mocks.fromWebContents },
}));

vi.mock('../printer/raw-printer', () => ({ printRawData: mocks.printRawData }));
vi.mock('../printer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../printer')>();
  return { ...actual, printHTML: mocks.printHTML };
});

const { setupPrinterIPC, printRaw } = await import('./main');
const { IPC_CHANNELS } = await import('../types');
import type { PrintContent, PrinterConfig } from '../types';

/** Returns the handler registered for a channel. */
function handlerFor(channel: string) {
  const call = mocks.handle.mock.calls.find(([name]) => name === channel);
  if (!call) throw new Error(`no handler registered for ${channel}`);
  return call[1] as (event: unknown, ...args: unknown[]) => Promise<unknown>;
}

const CONTENTS: PrintContent[] = [{ type: 'text', value: 'Hi' }];
const baseConfig: PrinterConfig = { printerName: 'TM-T20', paperWidth: 80 };
const fakeEvent = { sender: {} };

beforeEach(() => {
  mocks.handle.mockReset();
  mocks.fromWebContents.mockReset();
  mocks.printRawData.mockReset();
  mocks.printHTML.mockReset();
  mocks.printRawData.mockResolvedValue({ success: true, jobId: 'raw-1' });
  mocks.printHTML.mockResolvedValue({ success: true, jobId: 'html-1' });
  setupPrinterIPC();
});

describe('print handler', () => {
  it('takes the raw path by default', async () => {
    const result = await handlerFor(IPC_CHANNELS.PRINT)(fakeEvent, CONTENTS, baseConfig);
    expect(mocks.printRawData).toHaveBeenCalledTimes(1);
    expect(mocks.printHTML).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, mode: 'raw' });
  });

  it('does not look for a window in raw mode', async () => {
    await handlerFor(IPC_CHANNELS.PRINT)(fakeEvent, CONTENTS, baseConfig);
    expect(mocks.fromWebContents).not.toHaveBeenCalled();
  });

  it('succeeds in raw mode even when no window exists', async () => {
    mocks.fromWebContents.mockReturnValue(null);
    const result = await handlerFor(IPC_CHANNELS.PRINT)(fakeEvent, CONTENTS, baseConfig);
    expect(result).toMatchObject({ success: true });
  });

  it('sends ESC/POS bytes starting with ESC @ to the printer', async () => {
    await handlerFor(IPC_CHANNELS.PRINT)(fakeEvent, CONTENTS, baseConfig);
    const [data, printerName] = mocks.printRawData.mock.calls[0];
    expect(Buffer.isBuffer(data)).toBe(true);
    expect([...(data as Buffer).subarray(0, 2)]).toEqual([0x1b, 0x40]);
    expect(printerName).toBe('TM-T20');
  });

  it('passes the codepage through to the builder', async () => {
    await handlerFor(IPC_CHANNELS.PRINT)(fakeEvent, [{ type: 'text', value: 'П' }], {
      ...baseConfig,
      codepage: 'PC866',
    });
    const [data] = mocks.printRawData.mock.calls[0];
    // ESC t 17 immediately after ESC @, and П as the single byte 0x8F
    expect([...(data as Buffer).subarray(0, 5)]).toEqual([0x1b, 0x40, 0x1b, 0x74, 0x11]);
    expect((data as Buffer).includes(0x8f)).toBe(true);
  });

  it('takes the html path when asked', async () => {
    mocks.fromWebContents.mockReturnValue({ webContents: {} });
    const result = await handlerFor(IPC_CHANNELS.PRINT)(fakeEvent, CONTENTS, {
      ...baseConfig,
      mode: 'html',
    });
    expect(mocks.printHTML).toHaveBeenCalledTimes(1);
    expect(mocks.printRawData).not.toHaveBeenCalled();
    expect(result).toMatchObject({ mode: 'html' });
  });

  it('fails with a clear error when html mode has no window', async () => {
    mocks.fromWebContents.mockReturnValue(null);
    const result = await handlerFor(IPC_CHANNELS.PRINT)(fakeEvent, CONTENTS, {
      ...baseConfig,
      mode: 'html',
    });
    expect(result).toMatchObject({ success: false, mode: 'html' });
    expect((result as { error: string }).error).toMatch(/window/i);
  });

  it('turns a build error into a failed result rather than throwing', async () => {
    const result = await handlerFor(IPC_CHANNELS.PRINT)(fakeEvent, [
      { type: 'barcode', value: 'nope', options: { type: 'EAN13' } },
    ], baseConfig);
    expect(result).toMatchObject({ success: false, mode: 'raw' });
    expect((result as { error: string }).error).toMatch(/EAN13/);
  });
});

describe('printRaw', () => {
  it('prints without a BrowserWindow', async () => {
    const result = await printRaw(CONTENTS, baseConfig);
    expect(mocks.printRawData).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true, mode: 'raw' });
  });
});
