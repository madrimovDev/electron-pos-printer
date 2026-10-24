import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PosPrinter, createPosPrinter } from './renderer';

const printMock = vi.fn();
const getPrintersMock = vi.fn();

beforeEach(() => {
  printMock.mockReset();
  getPrintersMock.mockReset();
  printMock.mockResolvedValue({ success: true, jobId: 'job-1' });
  vi.stubGlobal('window', {
    posPrinter: {
      print: printMock,
      getPrinters: getPrintersMock,
    },
  });
});

describe('PosPrinter.printReceipt', () => {
  it('produces the previous defaults when no config is supplied', async () => {
    const printer = createPosPrinter();
    const receipt = printer.createReceipt(80).text('Hello');

    await printer.printReceipt(receipt, 'TM-T20');

    expect(printMock).toHaveBeenCalledTimes(1);
    const [, config] = printMock.mock.calls[0];
    expect(config).toEqual({
      printerName: 'TM-T20',
      paperWidth: 80,
      charsPerLine: receipt.getCharsPerLine(),
      silent: true,
    });
  });

  it('lets a supplied codepage reach the print call', async () => {
    const printer = createPosPrinter();
    const receipt = printer.createReceipt(80).text('Магазин');

    await printer.printReceipt(receipt, 'TM-T20', { codepage: 'PC866' });

    const [, config] = printMock.mock.calls[0];
    expect(config).toMatchObject({
      printerName: 'TM-T20',
      codepage: 'PC866',
    });
  });

  it('lets config override the silent default', async () => {
    const printer = createPosPrinter();
    const receipt = printer.createReceipt(80).text('Hello');

    await printer.printReceipt(receipt, 'TM-T20', { silent: false });

    const [, config] = printMock.mock.calls[0];
    expect(config).toMatchObject({ silent: false });
  });
});

describe('PosPrinter.printText', () => {
  it('produces the previous defaults when no config is supplied', async () => {
    const printer = new PosPrinter();

    await printer.printText('Hello', 'TM-T20');

    const [, config] = printMock.mock.calls[0];
    expect(config).toEqual({
      printerName: 'TM-T20',
      paperWidth: 80,
      charsPerLine: config.charsPerLine,
      silent: true,
    });
    expect(config.paperWidth).toBe(80);
  });

  it('threads a supplied codepage through to the print call', async () => {
    const printer = new PosPrinter();

    await printer.printText('Магазин', 'TM-T20', 80, { codepage: 'PC866' });

    const [, config] = printMock.mock.calls[0];
    expect(config).toMatchObject({
      printerName: 'TM-T20',
      paperWidth: 80,
      codepage: 'PC866',
    });
  });
});
