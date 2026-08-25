const { app, BrowserWindow } = require('electron');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    show: false,
    backgroundColor: '#212226',
    title: 'Bare Electron Floor',
    webPreferences: { sandbox: true, contextIsolation: true }
  });
  await win.loadURL('data:text/html,<html><body></body></html>');
  win.once('ready-to-show', () => {
    win.show();
    console.log('[bare] ready-to-show');
  });
  setTimeout(() => app.quit(), 45000);
});
