const { contextBridge, ipcRenderer } = require('electron');

// IPC Channel names
const IPC_CHANNELS = {
  GET_PRINTERS: 'pos-printer:get-printers',
  PRINT: 'pos-printer:print',
};

// Expose POS Printer API to renderer
contextBridge.exposeInMainWorld('posPrinter', {
  getPrinters: () => ipcRenderer.invoke(IPC_CHANNELS.GET_PRINTERS),
  print: (contents, config) => ipcRenderer.invoke(IPC_CHANNELS.PRINT, contents, config),
});

console.log('POS Printer API exposed to renderer');
