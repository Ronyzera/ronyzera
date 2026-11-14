// Chat de texto por servidor e badges de não lidas nos ícones da barra.
const { criarApp, ok, iguais, semErros } = require('./harness');

const BASE = `
  myName = 'Ronyzera'; myAccountName = 'Ronyzera';
  SRV.list = [
    { id:'ntg', name:'RONYZERA', owner:'rony', v:1, img:'', rooms: DEFAULT_ROOMS },
    { id:'svA', name:'Cla do Ze', owner:'Ronyzera', v:1, img:'', rooms:[{ id:'rA1', name:'Geral', icon:'\uD83C\uDFAE' }] },
    { id:'svB', name:'Servidor B', owner:'Ronyzera', v:1, img:'', rooms:[{ id:'rB1', name:'Geral', icon:'\uD83C\uDFAE' }] }
  ];
  SRV.cur = 'svA'; PRESET_ROOMS = svRooms('svA');
  window.__toasts = [];
  window.botToast = t => window.__toasts.push(t);
  CN.myId = 'meu-id';
  CN.names.set('peer-1', 'Fulano');
  window.__enviados = [];
  window.cnPeers = () => ['peer-1'];
  window.cnSend = (pid, o) => window.__enviados.push({ pid, o });
`;

const testes = [
  {
    nome: 'o canal do servidor abre com nome e sem entrar em sala',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(() => {
          setStageView('srv');
          return {
            titulo: document.getElementById('chatTitle').textContent,
            canonico: document.getElementById('chanName').textContent,
            placeholder: document.getElementById('chatInput').placeholder,
            chatview: document.getElementById('callCard').classList.contains('chatview'),
            srvview: document.getElementById('callCard').classList.contains('srvview')
          };
        })()`);
        ok(r.titulo.indexOf('Cla do Ze') > -1, 'título com o nome do servidor: ' + r.titulo);
        iguais(r.canonico, 'chat-cla-do-ze');
        ok(r.chatview && r.srvview, 'classe do chat do servidor');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'enviar mensagem usa a rede global com a etiqueta do servidor',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(() => {
          setStageView('srv');
          const inp = document.getElementById('chatInput');
          inp.value = 'oi galera';
          chatSendText();
          return {
            enviados: window.__enviados,
            hist: (chatHistory.get('srv:svA') || []).map(m => m.text),
            inputVazio: inp.value === '',
            bolhas: document.getElementById('chatLog').children.length
          };
        })()`);
        iguais(r.hist, ['oi galera']);
        iguais(r.enviados.length, 1);
        iguais(r.enviados[0].o.type, 'chat-srv');
        iguais(r.enviados[0].o.srv, 'svA');
        iguais(r.enviados[0].o.text, 'oi galera');
        ok(r.inputVazio && r.bolhas === 1, 'mensagem local e campo limpo');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'mensagem de outro servidor mostra badge no ícone e some ao abrir',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(() => {
          setStageView('cards');
          chatIncoming('peer-1', { type:'chat-srv', srv:'svA', id:'m1', name:'Fulano', ts:Date.now(), text:'e aí' }, 'gen');
          const icone = document.querySelector('.srvIcon[data-sv="svA"] .svBadge');
          const linha = document.querySelector('#sidebar .callItem[data-srvchat] .cbadge');
          const estado1 = { icone: icone ? icone.textContent : null, linha: linha ? linha.textContent : null, hist: (chatHistory.get('srv:svA') || []).length };
          setStageView('srv');
          const depois = document.querySelector('.srvIcon[data-sv="svA"] .svBadge');
          const divisor = document.querySelector('#chatLog .chatNewDiv');
          return { estado1, badgeSumiu: !depois, bolhas: document.querySelectorAll('#chatLog .cmsg').length, divisor: divisor ? divisor.textContent : null };
        })()`);
        iguais(r.estado1.icone, '1');
        iguais(r.estado1.linha, '1');
        iguais(r.estado1.hist, 1);
        ok(r.badgeSumiu, 'abrir o canal deve limpar o badge');
        iguais(r.bolhas, 1, 'mensagem aparece no canal ao abrir');
        iguais(r.divisor, 'Novas mensagens', 'divisor de novas mensagens');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'badge de menção fica diferente (@)',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(() => {
          setStageView('cards');
          chatIncoming('peer-1', { type:'chat-srv', srv:'svA', id:'m2', name:'Fulano', ts:Date.now(), text:'@Ronyzera olha isso' }, 'gen');
          const b = document.querySelector('.srvIcon[data-sv="svA"] .svBadge');
          return { texto: b ? b.textContent : null, ment: b ? b.classList.contains('ment') : false };
        })()`);
        iguais(r.texto, '@1');
        ok(r.ment, 'classe de menção');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'mensagem de servidor que você não tem é ignorada',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(() => {
          setStageView('cards');
          chatIncoming('peer-1', { type:'chat-srv', srv:'nao-tenho', id:'m3', name:'Fulano', ts:Date.now(), text:'oi' }, 'gen');
          return {
            hist: chatHistory.get('srv:nao-tenho') ? chatHistory.get('srv:nao-tenho').length : 0,
            badges: document.querySelectorAll('.srvIcon .svBadge').length
          };
        })()`);
        iguais(r.hist, 0);
        iguais(r.badges, 0);
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'chat da sala não conta no badge do servidor',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(() => {
          roomId = 'rA1'; inRoom = true; setStageView('cards');
          chatPush({ id:'m4', from:'peer-1', name:'Fulano', ts:Date.now(), text:'oi na sala' });
          return {
            salaNaoLida: chatUnread,
            badges: document.querySelectorAll('.srvIcon .svBadge').length
          };
        })()`);
        iguais(r.salaNaoLida, 1);
        iguais(r.badges, 0, 'badge do servidor é só do canal de texto do servidor');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'trocar de servidor mantém o badge do outro e abre o canal certo',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(() => {
          setStageView('cards');
          chatIncoming('peer-1', { type:'chat-srv', srv:'svB', id:'m5', name:'Fulano', ts:Date.now(), text:'no B' }, 'gen');
          const antes = document.querySelector('.srvIcon[data-sv="svB"] .svBadge');
          setStageView('srv');                 // abre o canal do A (servidor atual)
          switchServer('svB');                 // ao trocar, o canal acompanha
          const depois = document.querySelector('.srvIcon[data-sv="svB"] .svBadge');
          return {
            antes: antes ? antes.textContent : null,
            titulo: document.getElementById('chatTitle').textContent,
            depois: !!depois,
            hist: (chatHistory.get('srv:svB') || []).length
          };
        })()`);
        iguais(r.antes, '1');
        ok(r.titulo.indexOf('Servidor B') > -1, 'título acompanha o servidor');
        ok(!r.depois, 'badge do servidor aberto é limpo');
        iguais(r.hist, 1);
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'receber no canal aberto não gera badge',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(() => {
          setStageView('srv');
          chatIncoming('peer-1', { type:'chat-srv', srv:'svA', id:'m6', name:'Fulano', ts:Date.now(), text:'oi agora' }, 'gen');
          return {
            badges: document.querySelectorAll('.srvIcon .svBadge').length,
            bolhas: document.getElementById('chatLog').children.length
          };
        })()`);
        iguais(r.badges, 0);
        iguais(r.bolhas, 1);
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'busca no chat marca ocorrências e navega com Enter/Esc',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(() => {
          setStageView('srv');
          chatPush({ id:'s1', from:'peer-1', name:'Fulano', ts:Date.now(), text:'oi mundo oi' }, 'srv:svA');
          chatBuscaToggle(true);
          const inp = document.getElementById('chatSearchInput');
          inp.value = 'oi';
          inp.dispatchEvent(new Event('input', { bubbles:true }));
          const marcas = [...document.querySelectorAll('#chatLog mark.buscaMark')];
          const primeiro = {
            total: marcas.length,
            texto: marcas.map(m => m.textContent),
            atual: (document.querySelector('mark.buscaAtual') || {}).textContent || null,
            contagem: document.getElementById('chatSearchCount').textContent,
            corpo: document.querySelector('#chatLog .ctext').textContent
          };
          inp.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true }));
          const depoisEnter = document.getElementById('chatSearchCount').textContent;
          inp.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true, cancelable:true }));
          return {
            primeiro, depoisEnter,
            fechou: document.getElementById('chatSearch').classList.contains('hidden'),
            marcasRestantes: document.querySelectorAll('#chatLog mark.buscaMark').length
          };
        })()`);
        iguais(r.primeiro.total, 2, 'duas ocorrências marcadas');
        iguais(r.primeiro.texto, ['oi', 'oi']);
        iguais(r.primeiro.atual, 'oi');
        iguais(r.primeiro.contagem, '1/2');
        iguais(r.primeiro.corpo, 'oi mundo oi', 'texto original preservado');
        iguais(r.depoisEnter, '2/2');
        ok(r.fechou, 'Esc fecha a busca');
        iguais(r.marcasRestantes, 0, 'marcas somem ao fechar');
        semErros(app);
      } finally { app.fechar(); }
    }
  }
];

module.exports = { nome: 'Chat de texto por servidor', testes };
