// TURN do usuário: o que resolve NAT restrito/CGNAT (voz e tela só passam por relay).
// A credencial padrão do app é compartilhada e pode estourar a cota — quando isso acontece, o
// usuário cola o TURN dele em Configurações → Voz e vídeo e a sala volta a funcionar.
const { criarApp, ok, iguais, semErros } = require('./harness');

const testes = [
  {
    nome: 'TURN salvo entra na frente do padrão (e os STUN continuam lá)',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          turnSalvarDoUsuario({ urls: ['turn:meu.com:3478', 'turns:meu.com:443?transport=tcp'], username: 'eu', credential: 'senha' });
          return { primeiro: ICE_SERVERS[0], total: ICE_SERVERS.length, temStun: ICE_SERVERS.some(s => (s.urls || []).some(u => u.indexOf('stun:') === 0)) };
        })()`);
        iguais(r.primeiro.username, 'eu', 'o TURN do usuário tem que ser o primeiro');
        iguais(r.primeiro.urls, ['turn:meu.com:3478', 'turns:meu.com:443?transport=tcp']);
        ok(r.total >= 2 && r.temStun, 'os STUN padrão continuam na lista: ' + JSON.stringify(r));
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'endereços em texto separado por vírgula e lixo descartado',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          turnSalvarDoUsuario({ urls: ' turn:a.com:3478 , stun:x:19302, lixo, turns:b.com:443?transport=tcp ', username: 'u', credential: 'c' });
          return { urls: turnDoUsuario().urls };
        })()`);
        iguais(r.urls, ['turn:a.com:3478', 'turns:b.com:443?transport=tcp'], 'só endereços turn/turns com porta entram');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'remover o TURN volta a usar só o padrão do app',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          turnSalvarDoUsuario({ urls: ['turn:a.com:3478'], username: 'u', credential: 'c' });
          const com = ICE_SERVERS.length;
          turnSalvarDoUsuario(null);
          return { com, sem: ICE_SERVERS.length, guardado: localStorage.getItem('ntg_turn'), lido: turnDoUsuario() };
        })()`);
        ok(r.com > r.sem, 'a lista encolhe ao remover: ' + JSON.stringify(r));
        iguais(r.guardado, null);
        iguais(r.lido, null);
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'testar TURN: relay recebido = funcionando',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          window.RTCPeerConnection = class {
            constructor(){ this.onicecandidate = null; }
            createDataChannel(){}
            createOffer(){ return Promise.resolve({ type:'offer', sdp:'' }); }
            setLocalDescription(){ setTimeout(() => this.onicecandidate({ candidate: { type:'relay', address:'1.2.3.4', port:5000 } }), 5); return Promise.resolve(); }
            close(){}
          };
          return await testarTurn({ urls:['turn:a.com:3478'], username:'u', credential:'c' }, 2000);
        })()`);
        iguais(r.ok, true, 'o TURN que devolve relay é aprovado');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'testar TURN: sem relay (credencial/cota) é reprovado com motivo',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          window.RTCPeerConnection = class {
            constructor(){ this.onicecandidate = null; }
            createDataChannel(){}
            createOffer(){ return Promise.resolve({ type:'offer', sdp:'' }); }
            setLocalDescription(){ setTimeout(() => this.onicecandidate({ candidate: null }), 5); return Promise.resolve(); }
            close(){}
          };
          return await testarTurn({ urls:['turn:a.com:3478'], username:'u', credential:'c' }, 2000);
        })()`);
        iguais(r.ok, false, 'sem endereço de relay o TURN não serve');
        iguais(r.motivo, 'sem relay');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'testar TURN sem endereço não inventa conexão',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => await testarTurn({ urls: [], username:'', credential:'' }))()`);
        iguais(r.ok, false);
        iguais(r.motivo, 'sem endereço');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'configurações: salvar o TURN pela tela aplica na hora',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          openSettings('audio');
          const urls = document.getElementById('setTurnUrls');
          if(!urls) return { achou: false };
          urls.value = 'turn:t.com:3478';
          document.getElementById('setTurnUser').value = 'usuario';
          document.getElementById('setTurnPass').value = 'segredo';
          document.getElementById('setTurnSave').click();
          return {
            achou: true,
            salvo: JSON.parse(localStorage.getItem('ntg_turn') || 'null'),
            primeiro: ICE_SERVERS[0],
            info: document.getElementById('setTurnInfo').textContent
          };
        })()`);
        iguais(r.achou, true, 'a aba Voz e vídeo precisa ter os campos de TURN');
        iguais(r.salvo.username, 'usuario');
        iguais(r.primeiro.urls, ['turn:t.com:3478']);
        ok(/Salvo/.test(r.info), 'a tela confirma que salvou: ' + r.info);
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'configurações: campo Cloudflare só aparece no app instalado',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          openSettings('audio');
          return { temDesktop: !!window.desktop, temCampo: !!document.getElementById('setCfKey') };
        })()`);
        iguais(r.temDesktop, false, 'o teste roda no navegador (sem ponte do desktop)');
        iguais(r.temCampo, false, 'sem app instalado não pode aparecer campo de Cloudflare');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'configurações: Cloudflare salvo no app vira relay na frente da lista',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          const salvos = [];
          window.desktop = {
            getSettings: async () => ({ settings: {} }),
            setSettings: async cfg => { salvos.push(cfg); return { settings: cfg }; },
            iceServers: async () => ([{ urls: 'turn:turn.cloudflare.com:3478?transport=udp', username: 'u-cf', credential: 'p-cf' }])
          };
          openSettings('audio');
          const temCampos = !!(document.getElementById('setCfKey') && document.getElementById('setCfToken') && document.getElementById('setCfTest'));
          document.getElementById('setCfKey').value = 'kid-123';
          document.getElementById('setCfToken').value = 'tok-456';
          document.getElementById('setCfSave').click();
          await new Promise(r => setTimeout(r, 40));
          return { temCampos, salvos, primeiro: ICE_SERVERS[0], info: document.getElementById('setCfInfo').textContent };
        })()`);
        iguais(r.temCampos, true, 'no app instalado a aba Voz e vídeo precisa dos campos do Cloudflare');
        const cf = r.salvos.filter(x => x && x.cloudflareTurn).pop();
        ok(!!cf, 'tem que gravar a chave no app: ' + JSON.stringify(r.salvos));
        iguais(cf.cloudflareTurn.keyId, 'kid-123');
        iguais(cf.cloudflareTurn.token, 'tok-456');
        iguais(r.primeiro.username, 'u-cf', 'a credencial do Cloudflare entra na frente do padrão');
        ok(/salvo/i.test(r.info), 'a tela confirma que salvou: ' + r.info);
        semErros(app);
      } finally { app.fechar(); }
    }
  }
];

module.exports = { nome: 'Servidor TURN', testes };
