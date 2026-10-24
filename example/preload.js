const { contextBridge, ipcRenderer } = require('electron');
const { exposePosPrinterAPI } = require('@madrimov/electron-pos-printer');

exposePosPrinterAPI();

// Example-only extra: dump to a file instead of printing.
contextBridge.exposeInMainWorld('examplePrinter', {
  dump: (contents, config) => ipcRenderer.invoke('example:dump', contents, config),
});
