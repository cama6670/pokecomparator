// Renders the app in Electron and saves screenshots (used for visual checks).
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const out = process.argv[2] || 'shots';
fs.mkdirSync(out, { recursive: true });
app.whenReady().then(async () => {
  const sizes = process.argv[3] === 'desktop' ? [[1100, 900, 'desktop']] : [[420, 900, 'phone']];
  for (const [w, h, name] of sizes) {
    const win = new BrowserWindow({ width: w, height: h, show: false, webPreferences: { contextIsolation: true } });
    await win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
    if (process.env.PC_STATE) {
      await win.webContents.executeJavaScript(`localStorage.setItem('pc-state', ${JSON.stringify(process.env.PC_STATE)}); location.reload();`);
      await new Promise((r) => setTimeout(r, 800));
    }
    await new Promise((r) => setTimeout(r, 1200));
    const errs = [];
    win.webContents.on('console-message', (e, level, msg) => errs.push(msg));
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(out, `${name}.png`), img.toPNG());
    // Full page height
    const height = await win.webContents.executeJavaScript('document.documentElement.scrollHeight');
    win.setContentSize(w, Math.min(height, 3000));
    await new Promise((r) => setTimeout(r, 400));
    fs.writeFileSync(path.join(out, `${name}-full.png`), (await win.webContents.capturePage()).toPNG());
    // Open search overlay
    await win.webContents.executeJavaScript(`document.querySelector('[data-pick="1"]').click(); document.getElementById('searchInput').value='mega char'; document.getElementById('searchInput').dispatchEvent(new Event('input'));`);
    await new Promise((r) => setTimeout(r, 1500));
    fs.writeFileSync(path.join(out, `${name}-search.png`), (await win.webContents.capturePage()).toPNG());
    console.log(name, 'height', height, 'console:', errs.join(' | ') || 'clean');
    win.destroy();
  }
  app.quit();
});
