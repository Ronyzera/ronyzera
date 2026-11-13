// ============================================================
// RONYZERA — detecção de jogo no app Electron (Windows)
// O index.html chama window.desktop.detectGame(lista) a cada 15 s.
// Só o NOME do jogo volta para a página (ela nunca recebe a lista de processos).
// ============================================================

// ---------- 1) main.js (processo principal) ----------
const { ipcMain } = require('electron');
const { execFile } = require('child_process');

let procCache = { t: 0, names: [] };
function listProcesses() {
  return new Promise(resolve => {
    if (Date.now() - procCache.t < 5000) return resolve(procCache.names);
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
      if (err) return resolve([]);
      const names = out.split(/\r?\n/).map(l => (l.match(/^"([^"]+)"/) || [])[1]).filter(Boolean).map(n => n.toLowerCase());
      procCache = { t: Date.now(), names };
      resolve(names);
    });
  });
}
const globToRe = p => new RegExp('^' + p.toLowerCase().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');

ipcMain.handle('desktop:detectGame', async (_e, list) => {
  if (!Array.isArray(list) || list.length > 500) return null;
  const names = await listProcesses();
  for (const item of list) {
    if (!Array.isArray(item) || typeof item[0] !== 'string' || typeof item[1] !== 'string') continue;
    const re = globToRe(item[0]);
    if (names.some(n => re.test(n))) return item[1].slice(0, 60);
  }
  return null;
});

// ---------- 2) preload.js ----------
// Dentro do objeto que você já expõe com contextBridge.exposeInMainWorld('desktop', { ... }), adicione:
//
//   detectGame: (list) => ipcRenderer.invoke('desktop:detectGame', list),
