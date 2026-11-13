// Voz: recuperação rápida de ICE e painel de diagnóstico (microfone + rede).
const { criarApp, ok, iguais, semErros } = require('./harness');

const testes = [
  {
    nome: 'painel de diagnóstico mostra microfone e rede',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(`
          myName = 'Ronyzera'; myAccountName = 'Ronyzera';
          window.diagnoseNetwork = async () => ({ srflx: 2, relay: true, host: true });
          window.openMicStream = async () => { throw Object.assign(new Error('sem microfone'), { name: 'NotFoundError' }); };
          diagOpen();
        `);
        await app.esperar(250);
        const r = await app.run(`(() => {
          const p = document.getElementById('diagPanel');
          const linhas = [...p.querySelectorAll('#dgNetRows .dgRow')].map(x => x.textContent.trim());
          const info = p.querySelector('#dgMicInfo').textContent;
          diagClose();
          return {
            visivel: !p.classList.contains('hidden') ? 'abriu' : 'fechou',
            titulo: p.querySelector('h3').textContent,
            info,
            linhas,
            dica: p.querySelector('#dgNetHint').textContent
          };
        })()`);
        iguais(r.visivel, 'fechou', 'diagClose fecha');
        iguais(r.titulo, 'Testar microfone e rede');
        ok(r.info.indexOf('❌') === 0, 'erro de microfone explicado: ' + r.info);
        iguais(r.linhas.length, 3);
        ok(r.linhas[0].indexOf('liberado') > -1 && r.linhas[2].indexOf('respondeu') > -1, 'linhas de rede: ' + r.linhas.join(' / '));
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'ICE failed refaz a chamada em ~1,2 s',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          const chamadas = [];
          window.placeCall = (id, kind) => chamadas.push(id + '|' + kind);
          leaving = false; joinedRoom = true; inRoom = true;
          localMic = { getTracks: () => [{ readyState: 'live' }] };
          const pc = new EventTarget(); pc.iceConnectionState = 'connected';
          const call = { open: true, peerConnection: pc, on(){}, close(){} };
          outgoing.set('peerY', { mic: call });
          lastPlaced.clear();
          watchCallIce('peerY', 'mic', call, 'out');
          pc.iceConnectionState = 'failed';
          pc.dispatchEvent(new Event('iceconnectionstatechange'));
          await new Promise(r => setTimeout(r, 1400));
          return chamadas;
        })()`);
        iguais(r, ['peerY|mic']);
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'ICE disconnected que se recupera não refaz nada',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          const chamadas = [];
          window.placeCall = (id, kind) => chamadas.push(id + '|' + kind);
          leaving = false; joinedRoom = true; inRoom = true;
          localMic = { getTracks: () => [{ readyState: 'live' }] };
          const pc = new EventTarget(); pc.iceConnectionState = 'connected';
          const call = { open: true, peerConnection: pc, on(){}, close(){} };
          outgoing.set('peerZ', { mic: call });
          lastPlaced.clear();
          watchCallIce('peerZ', 'mic', call, 'out');
          pc.iceConnectionState = 'disconnected';
          pc.dispatchEvent(new Event('iceconnectionstatechange'));
          await new Promise(r => setTimeout(r, 900));
          const antes = chamadas.slice();
          pc.iceConnectionState = 'connected';
          pc.dispatchEvent(new Event('iceconnectionstatechange'));
          await new Promise(r => setTimeout(r, 3800));
          return { antes, depois: chamadas };
        })()`);
        iguais(r.antes, []);
        iguais(r.depois, []);
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'quem recebe pede recarga pelo canal de controle',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          const pedidos = [];
          window.ctlSend = (id, msg) => pedidos.push(id + ':' + msg.type + ':' + msg.kind);
          knownPeers.set('peerW', 'W');
          leaving = false; joinedRoom = true; inRoom = true;
          const pc = new EventTarget(); pc.iceConnectionState = 'connected';
          const call = { open: true, peerConnection: pc, on(){}, close(){} };
          lastRecall.clear();
          watchCallIce('peerW', 'mic', call, 'in');
          pc.iceConnectionState = 'failed';
          pc.dispatchEvent(new Event('iceconnectionstatechange'));
          await new Promise(r => setTimeout(r, 1400));
          return pedidos;
        })()`);
        iguais(r, ['peerW:re-call:mic']);
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'pedido de recarga recebido redisca a chamada',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          const chamadas = [];
          window.placeCall = (id, kind) => chamadas.push(id + '|' + kind);
          localMic = { getTracks: () => [{ readyState: 'live' }] };
          knownPeers.set('peerX', 'Fulano');
          lastPlaced.clear();
          handleCtlData('peerX', { type: 're-call', kind: 'mic' });
          return chamadas;
        })()`);
        iguais(r, ['peerX|mic']);
        semErros(app);
      } finally { app.fechar(); }
    }
  }
];

module.exports = { nome: 'Voz e conexão', testes };
