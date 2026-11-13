const { app, BrowserWindow, session, desktopCapturer, ipcMain, shell, dialog, globalShortcut, Notification, Tray, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const http = require('http');
const fs = require('fs');
const path = require('path');

require('./detectar-jogo-electron.js');   // registra o "desktop:detectGame" (mostra o jogo que você está jogando)

// Porta fixa: o endereço (origem) do app precisa ser sempre o mesmo para o Windows
// guardar seu login, foto e histórico do chat entre uma abertura e outra.
const PORT = 47831;
let win = null, server = null, origin = '', tray = null, quitting = false;

function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const url = (req.url || '/').split('?')[0];
      if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    const tryListen = (p, fallback) => {
      const onErr = err => {
        if (fallback && err && err.code === 'EADDRINUSE') tryListen(0, false);
        else reject(err);
      };
      server.once('error', onErr);
      server.listen(p, '127.0.0.1', () => {
        server.removeListener('error', onErr);
        resolve(server.address().port);
      });
    };
    tryListen(PORT, true);
  });
}

// ---------- seletor de tela/janela para a transmissão ----------
let pendingSources = [], pendingResolve = null;
ipcMain.handle('picker:list', () =>
  pendingSources.map(s => ({ id: s.id, name: s.name, thumb: s.thumbnail.toDataURL(), screen: s.id.startsWith('screen:') })));
ipcMain.on('picker:choose', (_e, id) => { if (pendingResolve) pendingResolve(id); });

function pickSource(sources) {
  return new Promise(resolve => {
    pendingSources = sources;
    const pw = new BrowserWindow({
      parent: win, modal: true, width: 760, height: 560, title: 'O que você quer transmitir?',
      autoHideMenuBar: true, backgroundColor: '#130a24', minimizable: false,
      webPreferences: { preload: path.join(__dirname, 'picker-preload.js'), contextIsolation: true, nodeIntegration: false }
    });
    let done = false;
    const finish = v => { if (done) return; done = true; pendingResolve = null; resolve(v); };
    pendingResolve = id => { finish(sources.find(s => s.id === id) || null); try { pw.close(); } catch (e) {} };
    pw.on('closed', () => finish(null));
    pw.loadFile(path.join(__dirname, 'picker.html'));
  });
}

// ---------- ponte "window.desktop" (jogo, avisos, atalhos globais e afins) ----------
// As configurações ficam num arquivo JSON em %appdata%/RONYZERA; o preload expõe a ponte para o index.html.
const DEFAULT_CFG = { ptt: { on:false, kind:'code', code:'', label:'' }, keyMute:'', keyDeafen:'', notifications:false, closeToTray:false, autostart:false };
let desktopCfg = { ...DEFAULT_CFG };
function cfgPath(){ return path.join(app.getPath('userData'), 'configuracoes.json'); }
function loadCfg(){
  let s = {};
  try{ s = JSON.parse(fs.readFileSync(cfgPath(), 'utf8')); }catch(e){}
  desktopCfg = Object.assign({}, DEFAULT_CFG, s, { ptt: Object.assign({}, DEFAULT_CFG.ptt, (s && s.ptt) || {}) });
}
function saveCfg(){ try{ fs.writeFileSync(cfgPath(), JSON.stringify(desktopCfg, null, 2), 'utf8'); }catch(e){} }
function applyShortcuts(){
  try{ globalShortcut.unregisterAll(); }catch(e){}
  const act = { keyMute: 'toggleMic', keyDeafen: 'toggleDeafen' }, ok = { keyMute: true, keyDeafen: true };
  for(const k of Object.keys(act)){
    const acc = String(desktopCfg[k] || '');
    if(!acc) continue;
    try{
      ok[k] = globalShortcut.register(acc, () => {
        try{ if(win && !win.isDestroyed()) win.webContents.send('desktop:action', act[k]); }catch(e){}
      });
    }catch(e){ ok[k] = false; }
  }
  return ok;
}
function applyAutostart(){
  try{ app.setLoginItemSettings({ openAtLogin: !!desktopCfg.autostart, args: ['--hidden'] }); }catch(e){}
}
function ensureTray(){   // "Fechar na bandeja": o ícone perto do relógio mantém o app vivo
  if(tray || !desktopCfg.closeToTray) return;
  try{
    tray = new Tray(path.join(__dirname, 'icon.ico'));
    const open = () => { try{ if(win){ win.show(); win.focus(); } }catch(e){} };
    tray.setToolTip('RONYZERA');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Abrir RONYZERA', click: open },
      { type: 'separator' },
      { label: 'Sair', click: () => app.quit() }
    ]));
    tray.on('double-click', open);
  }catch(e){ tray = null; }
}
ipcMain.handle('desktop:getSettings', () => ({ settings: desktopCfg, hook: false }));
ipcMain.handle('desktop:setSettings', (_e, cfg) => {
  try{
    if(cfg && typeof cfg === 'object'){
      desktopCfg = Object.assign(desktopCfg, cfg, { ptt: Object.assign({}, desktopCfg.ptt, (cfg && cfg.ptt) || {}) });
      saveCfg(); applyAutostart(); ensureTray();
    }
  }catch(e){}
  return { hotkeys: applyShortcuts(), settings: desktopCfg, hook: false };
});
ipcMain.handle('desktop:captureHook', async () => null);   // sem gancho nativo: o push-to-talk funciona com o app em foco
ipcMain.on('desktop:notify', (_e, title, body) => {
  if(!desktopCfg.notifications) return;                    // respeita o interruptor "Avisos do Windows"
  try{ if(Notification.isSupported()) new Notification({ title: String(title || 'RONYZERA').slice(0, 64), body: String(body || '').slice(0, 200) }).show(); }catch(e){}
});

function setupSession() {
  const ses = session.defaultSession;
  const allowed = new Set(['media', 'display-capture', 'fullscreen', 'clipboard-sanitized-write', 'notifications']);
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 360, height: 200 } });
      const chosen = await pickSource(sources);
      if (!chosen) return callback({});
      const streams = { video: chosen };
      if (request.audioRequested) streams.audio = 'loopback';   // som do sistema (Windows)
      callback(streams);
    } catch (e) {
      callback({});
    }
  });
}

function createWindow() {
  const iconPath = path.join(__dirname, 'icon.ico');
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    backgroundColor: '#05020c', autoHideMenuBar: true, title: 'RONYZERA',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    show: !process.argv.includes('--hidden'),    // "Iniciar com o Windows": abre escondido na bandeja
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js') }
  });
  win.removeMenu();
  win.loadURL(origin + '/');
  win.on('close', e => {          // "Fechar na bandeja": minimiza pro relógio em vez de sair
    if(desktopCfg.closeToTray && tray && !quitting){ e.preventDefault(); try{ win.hide(); }catch(x){} }
  });
  // links externos abrem no navegador padrão; o app nunca navega para fora do endereço local
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(origin)) { e.preventDefault(); shell.openExternal(url); } });
  win.on('closed', () => { win = null; });
}

// ---------- atualização automática (GitHub Releases) ----------
function setupUpdater() {
  if (!app.isPackaged) return;                     // só no app instalado, não no "npm start"
  const logFile = path.join(app.getPath('userData'), 'updater.log');
  const log = (...a) => { try { fs.appendFileSync(logFile, new Date().toISOString() + ' ' + a.join(' ') + '\n'); } catch (e) {} };
  // O electron-builder tira a seção "build" do package.json do app instalado; a configuração real fica em app-update.yml
  let cfg = '';
  try { cfg = fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8'); }
  catch (e) { log('app-update.yml nao encontrado: atualizador desligado'); return; }
  const owner = ((/^owner:\s*(.+)$/m.exec(cfg) || [])[1] || '').trim();
  if (!owner || /SEU_/i.test(owner)) { log('owner nao configurado: atualizador desligado'); return; }
  log('atualizador ativo | versao instalada', app.getVersion(), '| repositorio', owner);
  autoUpdater.logger = { info: m => log('info', m), warn: m => log('warn', m), error: m => log('error', m), debug: () => {} };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;         // "Depois" = instala quando você fechar o app
  autoUpdater.on('update-available', i => log('nova versao encontrada', i.version));
  autoUpdater.on('update-not-available', () => log('nenhuma atualizacao nova'));
  autoUpdater.on('error', e => log('erro', e && e.message));
  autoUpdater.on('update-downloaded', info => {
    log('download concluido', info.version);
    if (!win) return;
    dialog.showMessageBox(win, {
      type: 'info', buttons: ['Reiniciar agora', 'Depois'], defaultId: 0, cancelId: 1,
      title: 'Atualização pronta', message: 'A versão ' + info.version + ' do RONYZERA foi baixada.',
      detail: 'Reinicie para atualizar. Se escolher "Depois", ela é instalada quando você fechar o app.'
    }).then(r => { if (r.response === 0) autoUpdater.quitAndInstall(); });
  });
  const check = () => { autoUpdater.checkForUpdates().catch(e => log('falha ao procurar', e && e.message)); };
  setTimeout(check, 5000);
  setInterval(check, 60 * 60 * 1000);              // procura de novo a cada hora
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); try{ win.show(); win.focus(); }catch(e){} } });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => { try{ globalShortcut.unregisterAll(); }catch(e){} });
  app.whenReady().then(async () => {
    loadCfg();
    const port = await startServer();
    origin = 'http://127.0.0.1:' + port;
    setupSession();
    createWindow();
    ensureTray();
    applyAutostart();
    applyShortcuts();
    setupUpdater();
  });
  app.on('window-all-closed', () => { try { server && server.close(); } catch (e) {} app.quit(); });
}
