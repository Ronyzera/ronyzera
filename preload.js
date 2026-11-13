// ============================================================
// RONYZERA — ponte entre o index.html e o Electron (processo principal)
// Expõe window.desktop para a página. A página NUNCA acessa o Node direto.
// ============================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  // Mostra o jogo que você está jogando (index.html manda a lista de nomes; só o nome do jogo volta)
  detectGame: (list) => ipcRenderer.invoke('desktop:detectGame', list),

  // Avisos do Windows (o app respeita o interruptor "Avisos do Windows" das configurações)
  notify: (title, body) => { try{ ipcRenderer.send('desktop:notify', String(title || ''), body == null ? '' : String(body)); }catch(e){} },

  // Configurações locais (atalhos globais, push-to-talk, bandeja, iniciar com o Windows)
  getSettings: () => ipcRenderer.invoke('desktop:getSettings'),
  setSettings: (cfg) => ipcRenderer.invoke('desktop:setSettings', cfg),

  // Captura de tecla global para o push-to-talk (retorna null quando não há gancho nativo:
  // nesse caso o index.html usa o fallback "com o app em foco")
  captureHook: () => ipcRenderer.invoke('desktop:captureHook'),

  // Atalho global disparado (mutar / ensurdecer) e eventos de push-to-talk externo
  onAction: (cb) => { try{ ipcRenderer.on('desktop:action', (_e, a) => { try{ cb(a); }catch(x){} }); }catch(e){} },
  onPtt: (cb) => { try{ ipcRenderer.on('desktop:ptt', (_e, d) => { try{ cb(d); }catch(x){} }); }catch(e){} }
});
