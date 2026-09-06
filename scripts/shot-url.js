const { app, BrowserWindow } = require('electron');
const fs = require('fs');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 420, height: 900, show: false });
  const errs = [];
  win.webContents.on('console-message', (e, level, msg) => errs.push(msg));
  await win.loadURL(process.argv[2]);
  await new Promise((r) => setTimeout(r, 3000));
  fs.writeFileSync(process.argv[3], (await win.webContents.capturePage()).toPNG());
  console.log('console:', errs.join(' | ') || 'clean');
  app.quit();
});
