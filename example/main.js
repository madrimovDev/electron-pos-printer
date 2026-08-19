const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { writeFileSync } = require('fs');
const {
  setupPrinterIPC,
  buildESCPOSData,
  dumpESCPOS,
  resolveCodepage,
} = require('@madrimov/electron-pos-printer');

/** Extra channel used only by this example, to inspect output without a printer. */
const DUMP_CHANNEL = 'example:dump';

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

/**
 * Writes the annotated dump of a receipt to disk instead of printing it.
 * Useful for checking codepage output when no thermal printer is available.
 */
function setupDumpIPC() {
  ipcMain.handle(DUMP_CHANNEL, async (_event, contents, config) => {
    const data = buildESCPOSData(contents, {
      paperWidth: config.paperWidth,
      codepage: config.codepage,
      codepageTable: config.codepageTable,
    });
    const target = path.join(app.getPath('downloads'), 'receipt-dump.txt');
    // Use the library's own precedence rule instead of re-deriving it here,
    // so the example cannot drift from resolveCodepage()'s behaviour.
    const { table } = resolveCodepage(config.codepage, config.codepageTable);
    writeFileSync(target, dumpESCPOS(data, { table }), 'utf8');
    return { path: target, bytes: data.length };
  });
}

app.whenReady().then(() => {
  setupPrinterIPC();
  setupDumpIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
