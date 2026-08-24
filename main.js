const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Reseau Ventilation Pro - NF DTU 65.14',
    icon: path.join(__dirname, 'assets', 'icon.ico')
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // mainWindow.webContents.openDevTools(); // Désactivé en production

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

ipcMain.handle('load-config', async (event, filename) => {
  try {
    const configPath = path.join(__dirname, 'renderer', 'config', filename);
    const data = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Erreur chargement config:', error);
    return null;
  }
});

ipcMain.handle('save-project', async (event, { data, filePath }) => {
  try {
    if (!filePath) {
      const { filePath: newPath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Enregistrer le projet',
        defaultPath: 'projet_ventilation.json',
        filters: [
          { name: 'JSON', extensions: ['json'] },
          { name: 'Tous', extensions: ['*'] }
        ]
      });
      if (!newPath) return { success: false, message: 'Sauvegarde annulee' };
      filePath = newPath;
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('open-project', async (event) => {
  try {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Ouvrir un projet',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }, { name: 'Tous', extensions: ['*'] }]
    });
    if (!filePaths || filePaths.length === 0) {
      return { success: false, message: 'Aucun fichier selectionne' };
    }
    const data = fs.readFileSync(filePaths[0], 'utf8');
    return { success: true, data: JSON.parse(data), path: filePaths[0] };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('export-csv', async (event, { data, fileName }) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Exporter CSV',
      defaultPath: fileName || 'tableur.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (!filePath) return { success: false, message: 'Export annule' };
    const headers = Object.keys(data[0] || {});
    const csv = [headers.join(';'), ...data.map(r => headers.map(h => r[h] || '').join(';'))].join('\n');
    fs.writeFileSync(filePath, '\uFEFF' + csv, 'utf8');
    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('export-json', async (event, { data, fileName }) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Exporter JSON',
      defaultPath: fileName || 'projet.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (!filePath) return { success: false, message: 'Export annule' };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('export-dxf', async (event, { dxfContent, fileName }) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Exporter DXF',
      defaultPath: fileName || 'reseau.dxf',
      filters: [{ name: 'DXF', extensions: ['dxf'] }]
    });
    if (!filePath) return { success: false, message: 'Export annule' };
    fs.writeFileSync(filePath, dxfContent, 'utf8');
    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('import-csv', async (event) => {
  try {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Importer CSV',
      properties: ['openFile'],
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (!filePaths || filePaths.length === 0) {
      return { success: false, message: 'Aucun fichier selectionne' };
    }
    const content = fs.readFileSync(filePaths[0], 'utf8');
    return { success: true, content, path: filePaths[0] };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.on('quit-app', () => app.quit());

const createMenu = () => {
  const { Menu } = require('electron');
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Fichier',
      submenu: [
        { label: 'Nouveau', accelerator: 'Ctrl+N', click: () => mainWindow.webContents.send('new-project') },
        { label: 'Ouvrir', accelerator: 'Ctrl+O', click: () => mainWindow.webContents.send('open-project') },
        { label: 'Enregistrer', accelerator: 'Ctrl+S', click: () => mainWindow.webContents.send('save-project') },
        { type: 'separator' },
        { label: 'Exporter CSV', click: () => mainWindow.webContents.send('export-csv') },
        { label: 'Exporter PDF', click: () => mainWindow.webContents.send('export-pdf') },
        { label: 'Exporter DXF', click: () => mainWindow.webContents.send('export-dxf') },
        { label: 'Exporter JSON', click: () => mainWindow.webContents.send('export-json') },
        { label: 'Importer CSV', click: () => mainWindow.webContents.send('import-csv') },
        { type: 'separator' },
        { label: 'Quitter', accelerator: 'Ctrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        { label: 'Tableur', accelerator: 'Ctrl+1', click: () => mainWindow.webContents.send('show-volet', 'tableur') },
        { label: 'Dessin', accelerator: 'Ctrl+2', click: () => mainWindow.webContents.send('show-volet', 'dessin') },
        { label: 'Basculer', accelerator: 'Tab', click: () => mainWindow.webContents.send('toggle-volet') }
      ]
    },
    {
      label: 'Outils',
      submenu: [
        { label: 'Calculer', accelerator: 'F5', click: () => mainWindow.webContents.send('calculate-all') },
        { label: 'Verifier', accelerator: 'F6', click: () => mainWindow.webContents.send('check-consistency') },
        { label: 'Preferences', click: () => mainWindow.webContents.send('show-settings') }
      ]
    },
    {
      label: 'Aide',
      submenu: [
        { label: 'A propos', click: () => mainWindow.webContents.send('show-about') }
      ]
    }
  ]));
};

app.whenReady().then(() => {
  createWindow();
  createMenu();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
