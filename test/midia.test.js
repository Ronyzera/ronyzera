// Caminho da mídia (voz/tela): chamada que nunca abre tem que ser refeita, e o app precisa AVISAR
// quando não há microfone. Também trava o painel "Testar sala" que mostra o estado real das conexões.
const { criarApp, ok, iguais, semErros } = require('./harness');

const micVivo = `({ id:'mic', getTracks(){ return [{ readyState:'live', kind:'audio' }]; }, getVideoTracks(){ return []; }, getAudioTracks(){ return [{ readyState:'live', kind:'audio', enabled:true }]; } })`;

const testes = [
  {
    nome: 'chamada que nunca abriu é refeita (antes ficava mudo para sempre)',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          const chamadas = [];
          localMic = ${micVivo};
          window.placeCall = (id, kind) => { chamadas.push(id + '|' + kind); };
          leaving = false; joinedRoom = true; inRoom = true; myId = 'eu'; outgoing.clear(); lastPlaced.clear();
          // nunca abriu (open=false) e o ICE falhou: era o caso em que ninguém tentava de novo
          outgoing.set('amigo-7', { mic: { open: false, peerConnection: { iceConnectionState: 'failed' } } });
          tentarRefazerChamada('amigo-7', 'mic');
          const depoisFalha = chamadas.length;
          // conectada e aberta: não pode ficar refazendo (derrubaria o áudio bom)
          outgoing.set('amigo-8', { mic: { open: true, peerConnection: { iceConnectionState: 'connected' } } });
          tentarRefazerChamada('amigo-8', 'mic');
          return { depoisFalha, total: chamadas.length };
        })()`);
        iguais(r.depoisFalha, 1, 'chamada que não abriu precisa ser refeita');
        iguais(r.total, 1, 'chamada conectada não pode ser derrubada');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'sem microfone o app avisa em vez de ficar só "conectado"',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          inRoom = true; localMic = null;
          const sem = avisoSemMic();
          const texto = document.getElementById('statusText').textContent;
          localMic = ${micVivo};
          const com = avisoSemMic();
          return { sem, com, texto };
        })()`);
        iguais(r.sem, true, 'sem microfone tem que avisar');
        ok(/Sem microfone/i.test(r.texto), 'status explicando que está sem microfone: ' + r.texto);
        iguais(r.com, false, 'com microfone não avisa nada');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'painel "Testar sala" mostra o estado real da voz com cada pessoa',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          diagPanelEl();
          inRoom = true; myId = 'eu'; deafened = false;
          localMic = ${micVivo};
          knownPeers.clear(); knownPeers.set('eu', 'Eu'); knownPeers.set('a-1', 'Amigo A'); knownPeers.set('b-2', 'Amigo B');
          incoming.clear(); outgoing.clear();
          incoming.set('a-1|mic', { open: true, peerConnection: { iceConnectionState: 'connected' } });
          outgoing.set('b-2', { mic: { open: false, peerConnection: { iceConnectionState: 'failed' } } });
          await diagSalaTestar();
          const txt = document.getElementById('dgSalaRows').textContent;
          const dica = document.getElementById('dgSalaHint').textContent;
          return { txt, dica };
        })()`);
        ok(r.txt.indexOf('Amigo A') > -1 && r.txt.indexOf('ouve: ok') > -1, 'mostra quem está ok: ' + r.txt);
        ok(r.txt.indexOf('Amigo B') > -1 && r.txt.indexOf('fala: failed') > -1, 'mostra quem falhou: ' + r.txt);
        ok(/TURN/.test(r.dica), 'explica o TURN na dica: ' + r.dica);
        semErros(app);
      } finally { app.fechar(); }
    }
  }
];

module.exports = { nome: 'Mídia da sala', testes };
