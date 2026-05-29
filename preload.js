const { ipcRenderer } = require('electron');

// Exposer electronAPI directement sur window (sans contextBridge)
window.electronAPI = {
  // Configuration
  loadConfig: (filename) => ipcRenderer.invoke('load-config', filename),
  
  // Projet
  saveProject: (data, filePath) => ipcRenderer.invoke('save-project', { data, filePath }),
  openProject: () => ipcRenderer.invoke('open-project'),
  
  // Export
  exportCsv: (data, fileName) => ipcRenderer.invoke('export-csv', { data, fileName }),
  exportJson: (data, fileName) => ipcRenderer.invoke('export-json', { data, fileName }),
  exportPdf: (htmlContent, fileName) => ipcRenderer.invoke('export-pdf', { htmlContent, fileName }),
  exportDxf: (dxfContent, fileName) => ipcRenderer.invoke('export-dxf', { dxfContent, fileName }),
  
  // Import
  importCsv: () => ipcRenderer.invoke('import-csv'),
  
  // Quitter
  quitApp: () => ipcRenderer.send('quit-app'),
  
  // Evenements
  on: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args)),
  off: (channel, func) => ipcRenderer.off(channel, func),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args)
};

// Exposer des utilitaires
window.utils = {
  formatNumber: (value, decimals = 2) => {
    if (value === null || value === undefined) return '';
    return parseFloat(value).toFixed(decimals).replace('.', ',');
  },
  convert: {
    m3hToM3s: (q) => q / 3600,
    m3sToM3h: (q) => q * 3600,
    mmToM: (d) => d / 1000,
    mToMm: (d) => d * 1000
  }
};
