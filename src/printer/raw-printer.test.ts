import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

const state = vi.hoisted(() => ({ platform: 'linux' as string, spawn: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: state.spawn }));

// Only the two names raw-printer.ts imports. Spreading the whole module and
// overriding platform() is the shape that silently fails under default interop.
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { tmpdir: actual.tmpdir, platform: () => state.platform };
});

const { printRawData, WINDOWS_RAW_PRINT_SCRIPT, WINDOWS_ENV_PRINTER, WINDOWS_ENV_FILE } =
  await import('./raw-printer');

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
}

/** A spawn() stand-in that closes with the given exit code. */
function fakeChild(exitCode: number, stdout = ''): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  setImmediate(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
    child.emit('close', exitCode);
  });
  return child;
}

const lastCall = () => state.spawn.mock.calls[0];

beforeEach(() => {
  state.spawn.mockReset();
  state.platform = 'linux';
});

describe('printRawData on Unix', () => {
  it('invokes lp with raw output and no shell', async () => {
    state.spawn.mockImplementation(() => fakeChild(0));
    const result = await printRawData(Buffer.from([0x1b, 0x40]), 'TM-T20');

    expect(result.success).toBe(true);
    const [command, args] = lastCall();
    expect(command).toBe('lp');
    expect(args.slice(0, 4)).toEqual(['-d', 'TM-T20', '-o', 'raw']);
  });

  it('passes a hostile printer name through as a single argument', async () => {
    state.spawn.mockImplementation(() => fakeChild(0));
    const name = 'Printer"; rm -rf / #';
    await printRawData(Buffer.alloc(1), name);

    const [, args] = lastCall();
    expect(args[1]).toBe(name);
  });

  it('reports failure when lp exits non-zero', async () => {
    state.spawn.mockImplementation(() => fakeChild(1));
    const result = await printRawData(Buffer.alloc(1), 'TM-T20');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('reports failure when spawn itself errors', async () => {
    state.spawn.mockImplementation(() => {
      const child = new EventEmitter() as FakeChild;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      setImmediate(() => child.emit('error', new Error('ENOENT')));
      return child;
    });
    const result = await printRawData(Buffer.alloc(1), 'TM-T20');
    expect(result.success).toBe(false);
    expect(result.error).toContain('ENOENT');
  });
});

describe('printRawData on Windows', () => {
  beforeEach(() => {
    state.platform = 'win32';
  });

  it('runs a script that contains no interpolated values', async () => {
    state.spawn.mockImplementation(() => fakeChild(0, 'SUCCESS'));
    const name = 'Kassa "Bosh" #1';
    await printRawData(Buffer.alloc(1), name);

    const [command, args] = lastCall();
    expect(command).toBe('powershell.exe');
    const script = args[args.length - 1];
    expect(script).toBe(WINDOWS_RAW_PRINT_SCRIPT);
    expect(script).not.toContain(name);
  });

  it('passes the printer name and file path through the environment', async () => {
    state.spawn.mockImplementation(() => fakeChild(0, 'SUCCESS'));
    const name = 'Printer"; rm -rf / #';
    await printRawData(Buffer.alloc(1), name);

    const [, , options] = lastCall();
    expect(options.env[WINDOWS_ENV_PRINTER]).toBe(name);
    expect(options.env[WINDOWS_ENV_FILE]).toMatch(/receipt-print-.*\.bin$/);
  });

  it('keeps the rest of the environment', async () => {
    state.spawn.mockImplementation(() => fakeChild(0, 'SUCCESS'));
    await printRawData(Buffer.alloc(1), 'TM-T20');
    const [, , options] = lastCall();
    expect(options.env.PATH).toBe(process.env.PATH);
  });

  it('hides the console window', async () => {
    state.spawn.mockImplementation(() => fakeChild(0, 'SUCCESS'));
    await printRawData(Buffer.alloc(1), 'TM-T20');
    expect(lastCall()[2].windowsHide).toBe(true);
  });

  it('fails when the script does not report SUCCESS', async () => {
    state.spawn.mockImplementation(() => fakeChild(0, 'nothing'));
    const result = await printRawData(Buffer.alloc(1), 'TM-T20');
    expect(result.success).toBe(false);
  });

  it('reads its inputs from the environment', () => {
    expect(WINDOWS_RAW_PRINT_SCRIPT).toContain(`$env:${WINDOWS_ENV_PRINTER}`);
    expect(WINDOWS_RAW_PRINT_SCRIPT).toContain(`$env:${WINDOWS_ENV_FILE}`);
  });
});

describe('temp file handling', () => {
  it('removes the temp file after printing', async () => {
    const { existsSync } = await import('node:fs');
    state.spawn.mockImplementation(() => fakeChild(0));
    await printRawData(Buffer.alloc(1), 'TM-T20');
    const [, args] = lastCall();
    expect(existsSync(args[4])).toBe(false);
  });
});
