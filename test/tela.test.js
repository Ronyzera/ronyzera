// Transmissão de tela ("ver tela"): quem pede tem que receber mesmo que o roster ainda não tenha chegado,
// o pedido tem que insistir até o vídeo abrir e a recuperação tem que refazer a TELA (não o microfone).
const fs = require('fs');
const path = require('path');
const { criarApp, ok, iguais, semErros } = require('./harness');

const fonte = () => fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const testes = [
  {
    nome: 'quem pede para ver a tela recebe mesmo sem estar no roster',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          const chamadas = [];
          localScreen = { id:'tela', getTracks(){ return [{ readyState:'live', kind:'video' }]; }, getVideoTracks(){ return [{ readyState:'live', kind:'video' }]; } };
          window.placeCall = (id, kind, stream) => { chamadas.push({ id, kind, tela: stream === localScreen }); };
          window.ctlSend = () => {};
          leaving = false; myId = 'eu'; outgoing.clear();
          knownPeers.clear();                       // roster vazio: era exatamente o caso que não recebia nada
          handleCtlData('amigo-1', { type:'screen-watch', on:true });
          return { chamadas, watchers: [...screenWatchers] };
        })()`);
        iguais(r.chamadas.length, 1, 'tem que discar a tela para quem pediu');
        iguais(r.chamadas[0].id, 'amigo-1');
        iguais(r.chamadas[0].kind, 'screen');
        iguais(r.chamadas[0].tela, true, 'manda o stream da tela');
        iguais(r.watchers, ['amigo-1']);
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'não derruba a tela de quem já está assistindo (pedido repetido não reconecta)',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          const chamadas = [];
          localScreen = { getTracks(){ return [{ readyState:'live', kind:'video' }]; }, getVideoTracks(){ return [{ readyState:'live', kind:'video' }]; } };
          window.placeCall = (id, kind) => { chamadas.push(id + '|' + kind); };
          leaving = false; myId = 'eu'; outgoing.clear();
          outgoing.set('amigo-2', { screen: { open: true, peerConnection: { iceConnectionState: 'connected' } } });
          screenWatchAtender('amigo-2');                       // já está vendo: não mexe
          const parado = chamadas.length;
          outgoing.set('amigo-2', { screen: { open: true, peerConnection: { iceConnectionState: 'failed' } } });
          screenWatchAtender('amigo-2');                       // caiu: refaz
          return { parado, depois: chamadas.slice() };
        })()`);
        iguais(r.parado, 0, 'pedido repetido não pode derrubar/reconectar a tela boa');
        iguais(r.depois, ['amigo-2|screen'], 'só refaz quando o ICE caiu');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'recuperação da tela usa localScreen (antes usava o microfone)',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          const chamadas = [];
          localScreen = { id:'tela', getTracks(){ return [{ readyState:'live', kind:'video' }]; }, getVideoTracks(){ return [{ readyState:'live', kind:'video' }]; } };
          localMic = { id:'mic', getTracks(){ return [{ readyState:'live', kind:'audio' }]; }, getVideoTracks(){ return []; } };
          window.placeCall = (id, kind, stream) => { chamadas.push({ kind, tela: stream === localScreen, mic: stream === localMic }); };
          window.ctlSend = () => {};
          leaving = false; joinedRoom = true; inRoom = true; myId = 'eu'; outgoing.clear();
          outgoing.set('amigo-3', { screen: { open: true, peerConnection: { iceConnectionState: 'failed' } } });
          tentarRefazerChamada('amigo-3', 'screen');
          // "re-call" de tela vindo de quem NÃO pediu para assistir: não pode gastar upload à toa
          const antes = chamadas.length;
          handleCtlData('curioso-4', { type:'re-call', kind:'screen' });
          const semPedido = chamadas.length;
          screenWatchers.add('amigo-4');
          handleCtlData('amigo-4', { type:'re-call', kind:'screen' });
          return { chamadas: chamadas.slice(0, 2), antes, semPedido, total: chamadas.length };
        })()`);
        iguais(r.chamadas[0].kind, 'screen');
        iguais(r.chamadas[0].tela, true, 'tem que reenviar a tela, não o microfone');
        iguais(r.chamadas[0].mic, false, 'nunca reenviar o microfone no lugar da tela');
        iguais(r.antes, 1);
        iguais(r.semPedido, 1, 'não manda tela para quem não pediu');
        iguais(r.total, 2, 'atende quem pediu de verdade');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'pedido de "ver tela" insiste até o vídeo abrir (não desiste no primeiro erro)',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          const pedidos = [];
          localScreen = null; outgoing.clear(); knownPeers.clear();
          leaving = false; myId = 'eu'; hiddenScreens.clear();
          window.ctlSend = (id, msg) => { if(msg && msg.type === 'screen-watch') pedidos.push(id); };
          screenWatchStart('amigo-5');
          const primeiro = pedidos.length;
          const tile = document.getElementById('stage-amigo-5-screen');
          const aviso = tile && tile.querySelector('.offMsg').textContent;
          const off = !!(tile && tile.classList.contains('off'));
          const palco = document.getElementById('stage').classList.contains('live');
          await new Promise(r2 => setTimeout(r2, 3400));       // mais de um ciclo de repetição
          const depois = pedidos.length;
          screenWatchParar('amigo-5');
          return { primeiro, depois, sobrou: screenWatchReq.size, off, aviso, palco };
        })()`);
        iguais(r.primeiro, 1, 'pede logo ao clicar');
        iguais(r.off, true, 'o quadro tem que mostrar o aviso (antes ficava preto, sem mensagem)');
        ok(/Conectando/i.test(r.aviso), 'aviso de conexão no quadro: ' + r.aviso);
        iguais(r.palco, true, 'o palco abre para mostrar o quadro');
        ok(r.depois >= 2, 'tem que pedir de novo enquanto o vídeo não chega (pediu ' + r.depois + 'x)');
        iguais(r.sobrou, 0, 'ao parar, o pedido é cancelado');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'quadro que abre sem imagem não fica preto: pede a transmissão de novo',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          let pedidos = 0;
          window.ctlSend = () => { pedidos++; };
          leaving = false; myId = 'eu'; hiddenScreens.clear(); screenWatchReq.clear(); screenImgChk.clear();
          const t = stageTile('amigo-6', 'screen');
          t.classList.remove('off');
          screenImgVigiar('amigo-6');                 // canal aberto, mas videoWidth fica 0 (nenhuma imagem)
          await new Promise(r2 => setTimeout(r2, 6300));
          return { off: t.classList.contains('off'), pedidos, msg: t.querySelector('.offMsg').textContent };
        })()`);
        iguais(r.off, true, 'sem imagem o quadro volta para o aviso (não fica preto)');
        ok(r.pedidos >= 1, 'tem que pedir a transmissão de novo');
        ok(/sem imagem/i.test(r.msg), 'mensagem dizendo o que houve: ' + r.msg);
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'sair da sala cancela todos os pedidos de tela pendentes',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          window.ctlSend = () => {};
          leaving = false; myId = 'eu';
          screenWatchPedir('a-1'); screenWatchPedir('b-2');
          const antes = screenWatchReq.size;
          screenWatchPararTodas();
          return { antes, depois: screenWatchReq.size };
        })()`);
        iguais(r.antes, 2);
        iguais(r.depois, 0);
        const html = fonte();
        const saida = (html.match(/function leaveRoom\(\)\{[\s\S]{0,1200}?screenWatchPararTodas\(\)/) || [''])[0];
        ok(saida.length > 0, 'leaveRoom precisa cancelar os pedidos de tela');
        semErros(app);
      } finally { app.fechar(); }
    }
  }
];

module.exports = { nome: 'Transmissão de tela', testes };
