// Servidores, salas e backup: regras de nome, menus, ordem e foto.
const { criarApp, ok, iguais, semErros } = require('./harness');

const BASE = `
  myName = 'Ronyzera'; myAccountName = 'Ronyzera';
  SRV.list = [
    { id:'ntg', name:'RONYZERA', owner:'rony', v:1, img:'', rooms: DEFAULT_ROOMS },
    { id:'svA', name:'Servidor A', owner:'Ronyzera', v:1, img:'', rooms:[
      { id:'rA1', name:'Geral', icon:'\uD83C\uDFAE' },
      { id:'rA2', name:'Treinos', icon:'\uD83C\uDFAE' },
      { id:'rA3', name:'Fila', icon:'\uD83C\uDFAE' }
    ] }
  ];
  SRV.cur = 'svA'; PRESET_ROOMS = svRooms('svA');
  window.__toasts = [];
  window.botToast = t => window.__toasts.push(t);
  window.cnPeers = () => [];
`;

const testes = [
  {
    nome: 'sala com nome repetido é recusada e pede outro nome',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(async () => {
          const fila = ['Geral', 'Nova'];
          window.miniPrompt = async () => fila.shift();
          await svRoomAdd('svA');
          return {
            nomes: svRooms('svA').map(x => x.name),
            aviso: window.__toasts.find(t => t.indexOf('Já existe') === 0 || t.indexOf('⚠️ Já existe') === 0) || null
          };
        })()`);
        iguais(r.nomes.slice(-1), ['Nova'], 'só a sala nova entrou');
        ok(r.aviso && r.aviso.indexOf('Geral') > -1, 'faltou o aviso de nome repetido');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'renomear sala (e bloquear nome repetido)',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(async () => {
          window.miniPrompt = async () => 'Treino Rankeado';
          await svRoomRename('rA2');
          const depois = svRooms('svA').map(x => x.name);
          window.miniPrompt = async () => 'Geral';
          await svRoomRename('rA2');
          return { depois, final: svRooms('svA').map(x => x.name), aviso: window.__toasts.find(t => t.indexOf('⚠️') === 0) || null };
        })()`);
        iguais(r.depois, ['Geral', 'Treino Rankeado', 'Fila']);
        iguais(r.final, ['Geral', 'Treino Rankeado', 'Fila'], 'nome repetido não pode renomear');
        ok(r.aviso && r.aviso.indexOf('Já existe') > -1, 'faltou o aviso');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'menu da sala mostra convite, ordem, renomear e excluir',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(() => {
          roomMenuOpen('rA2', 20, 20);
          const m = document.getElementById('srvMenu');
          const itens = [...m.querySelectorAll('button')].map(b => b.dataset.smact);
          srvMenuClose();
          return itens;
        })()`);
        iguais(r, ['convite', 'subir', 'descer', 'renomear', 'excluir-sala']);
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'menu do servidor permite mover para os lados',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(() => {
          srvMenuOpen('svA', 10, 10);
          const itens = [...document.querySelectorAll('#srvMenu button')].map(b => b.dataset.smact);
          srvMenuClose();
          srvMenuOpen('ntg', 10, 10);
          const ntg = [...document.querySelectorAll('#srvMenu button')].map(b => b.dataset.smact);
          srvMenuClose();
          return { itens, ntg };
        })()`);
        ok(r.itens.includes('esq'), 'servidor no fim deveria poder ir para a esquerda');
        ok(!r.itens.includes('dir'), 'servidor no fim não deve ter "direita"');
        ok(r.ntg.includes('dir'), 'primeiro servidor deveria poder ir para a direita');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'arrastar servidor reordena e salva a ordem',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(() => {
          reordenarServidor('svA', 'ntg');
          const ordem1 = SRV.list.map(x => x.id);
          const salvo1 = JSON.parse(localStorage.getItem('ntg_servers') || '[]').map(x => x.id);
          moverServidorRel('svA', 1);
          const ordem2 = SRV.list.map(x => x.id);
          return { ordem1, salvo1, ordem2 };
        })()`);
        iguais(r.ordem1, ['svA', 'ntg']);
        iguais(r.salvo1, ['svA', 'ntg'], 'ordem salva no localStorage');
        iguais(r.ordem2, ['ntg', 'svA']);
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'fundador reordena salas e a ordem é compartilhada',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(async () => {
          const enviados = [];
          window.cnPeers = () => ['p1'];
          window.cnSend = (pid, o) => enviados.push(o);
          reordenarSala('rA3', 'rA1');
          await new Promise(r => setTimeout(r, 150));   // o anúncio é assinado antes de sair
          return {
            ordem: srvGet('svA').rooms.map(x => x.id),
            preset: PRESET_ROOMS.map(x => x.id),
            broadcast: enviados.filter(o => o && o.type === 'sv-dir').length,
            salvo: JSON.parse(localStorage.getItem('ntg_servers')).find(s => s.id === 'svA').rooms.map(x => x.id)
          };
        })()`);
        iguais(r.ordem, ['rA3', 'rA1', 'rA2']);
        iguais(r.preset, ['rA3', 'rA1', 'rA2']);
        iguais(r.salvo, ['rA3', 'rA1', 'rA2']);
        ok(r.broadcast > 0, 'fundador deveria avisar os outros');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'quem não é fundador ordena só no próprio app',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(() => {
          srvGet('svA').owner = 'outro-dono';
          const salvoAntes = srvGet('svA').rooms.map(x => x.id);
          reordenarSala('rA2', 'rA1');
          return {
            servidor: srvGet('svA').rooms.map(x => x.id),
            salvoAntes,
            naTela: PRESET_ROOMS.map(x => x.id),
            local: JSON.parse(localStorage.getItem('ntg_roomord_svA'))
          };
        })()`);
        iguais(r.servidor, ['rA1', 'rA2', 'rA3'], 'não deve alterar o servidor');
        iguais(r.naTela, ['rA2', 'rA1', 'rA3'], 'a tela segue a ordem local');
        iguais(r.local, ['rA2', 'rA1', 'rA3'], 'ordem local salva');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'barra lateral mostra a sala do servidor e a dica de criar',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(() => {
          SRV.list.push({ id:'svB', name:'Servidor Vazio', owner:'Ronyzera', v:1, img:'', rooms:[] });
          SRV.cur = 'svB'; PRESET_ROOMS = svRooms('svB');
          const html = roomsHtml(false);
          const temCanal = html.indexOf('data-srvchat="1"') > -1;
          const temDica = html.indexOf('data-newroom="1"') > -1;
          const dr = html.indexOf('draggable="true"');
          SRV.cur = 'ntg'; PRESET_ROOMS = svRooms('ntg');
          const ntg = roomsHtml(false).indexOf('data-srvchat="1"') > -1;
          return { temCanal, temDica, temArrastavel: dr > -1, ntgSemCanal: !ntg };
        })()`);
        ok(r.temCanal, 'servidor deveria ter o canal de texto');
        ok(r.temDica, 'servidor vazio deveria mostrar "criar"');
        ok(r.ntgSemCanal, 'RONYZERA usa o chat-geral, sem canal extra');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'backup exporta e importa sem salas padrão herdadas',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(async () => {
          let baixado = null;
          const orig = document.createElement.bind(document);
          document.createElement = tag => {
            const el = orig(tag);
            if(tag === 'a') el.click = () => { baixado = el.download; };
            return el;
          };
          svExportar();
          document.createElement = orig;
          openSettings('servidores');
          const arquivo = new File([JSON.stringify({ servidores: [
            { id:'svImp', name:'Importado', owner:'Ronyzera', v:5, img:'', rooms:[{ id:'rImp1', name:'Geral', icon:'\uD83C\uDFAE' }, { id:'ntg-cs2', name:'CS2', icon:'\uD83D\uDCA3' }] }
          ] })], 'backup.json', { type:'application/json' });
          const input = document.getElementById('srvImportFile');
          Object.defineProperty(input, 'files', { value: [arquivo], configurable: true });
          svImportar({ target: input });
          await new Promise(r => setTimeout(r, 150));
          const s = srvGet('svImp');
          return { baixado, existe: !!s, salas: s ? s.rooms.map(x => x.name) : [], herdou: s ? s.rooms.some(x => x.id.indexOf('ntg-') === 0) : null };
        })()`);
        ok(/^ronyzera-backup-\d{4}-\d{2}-\d{2}\.json$/.test(r.baixado || ''), 'nome do backup');
        ok(r.existe, 'backup importado');
        iguais(r.salas, ['Geral']);
        ok(r.herdou === false, 'não pode herdar salas padrão');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'clicar no nome do servidor abre a lista e troca de servidor (celular)',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(() => {
          const head = document.querySelector('.srvHead');
          head.click();
          const m = document.getElementById('srvMenu');
          const aberto = !m.classList.contains('hidden');
          const itens = [...m.querySelectorAll('button')].map(b => b.dataset.smact + ':' + (b.dataset.svid || ''));
          m.querySelector('button[data-svid="ntg"]').click();
          return {
            aberto, itens,
            fechou: m.classList.contains('hidden'),
            cur: SRV.cur,
            nome: document.querySelector('.srvHead .srvName').textContent
          };
        })()`);
        ok(r.aberto, 'menu deveria abrir ao clicar no nome');
        iguais(r.itens, ['pick:ntg', 'pick:svA', 'novo:', 'gerir:']);
        ok(r.fechou, 'menu fecha ao escolher');
        iguais(r.cur, 'ntg');
        iguais(r.nome, 'RONYZERA');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'nome do servidor mostra o total de não lidas dos outros servidores',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(() => {
          srvHeadRender();
          const antes = !!document.querySelector('.srvHead .svhBadge');
          srvUnreadAdd('ntg', false);
          srvUnreadAdd('ntg', false);
          const b = document.querySelector('.srvHead .svhBadge');
          const texto = b ? b.textContent : null;
          srvUnreadClear('ntg');
          return { antes, texto, depois: !!document.querySelector('.srvHead .svhBadge') };
        })()`);
        ok(!r.antes, 'sem badge no início');
        iguais(r.texto, '2');
        ok(!r.depois, 'badge some ao ler');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'sem espaço no armazenamento avisa em vez de falhar calado',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(() => {
          const oj = JSON.stringify;
          JSON.stringify = () => { throw new Error('QuotaExceededError'); };
          const okSave = srvsSave();
          JSON.stringify = oj;
          return { okSave, aviso: window.__toasts.find(t => t.indexOf('Sem espaço') > -1) || null };
        })()`);
        ok(r.okSave === false, 'deveria sinalizar falha');
        ok(r.aviso, 'faltou o aviso de cota');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'backup completo leva ajustes e perfis e substitui a lista ao restaurar',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(async () => {
          localStorage.setItem('ntg_theme', 'claro');
          localStorage.setItem('ntg_profile_testador', JSON.stringify({ password:'1234', photo:null }));
          localStorage.setItem('ntg_remember', 'testador');
          const b = backupCompleto();
          const arquivo = new File([JSON.stringify(b)], 'backup.json', { type:'application/json' });
          openSettings('servidores');
          const input = document.getElementById('srvImportFile');
          Object.defineProperty(input, 'files', { value: [arquivo], configurable: true });
          localStorage.removeItem('ntg_theme');
          localStorage.removeItem('ntg_profile_testador');
          SRV.list = SRV.list.filter(s => s.id === 'ntg');
          svImportar({ target: input });
          await new Promise(r => setTimeout(r, 150));
          return {
            tipo: b.tipo,
            semPadrao: b.servidores.every(s => s.id !== 'ntg'),
            temConfig: b.config.ntg_theme === 'claro',
            temPerfil: !!b.perfis['ntg_profile_testador'],
            semLembrete: !('ntg_remember' in b.config),
            temaVoltou: localStorage.getItem('ntg_theme'),
            perfilVoltou: !!localStorage.getItem('ntg_profile_testador'),
            servidorVoltou: !!srvGet('svA')
          };
        })()`);
        iguais(r.tipo, 'completo');
        ok(r.semPadrao, 'backup não deve guardar o servidor padrão');
        ok(r.temConfig && r.temPerfil, 'backup completo deve levar ajustes e perfis');
        ok(r.semLembrete, 'login lembrado não entra no backup');
        iguais(r.temaVoltou, 'claro', 'tema restaurado');
        ok(r.perfilVoltou, 'perfil restaurado');
        ok(r.servidorVoltou, 'servidores substituídos pelo backup');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'dono atualiza salas e quem está em chamada vê a mudança',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(() => {
          inRoom = true; roomId = 'rA2';
          PRESET_ROOMS = svRooms('svA');
          svsMerge([{ id:'svA', name:'Servidor A', owner:'Ronyzera', v:999, img:'', rooms:[
            { id:'rA1', name:'Geral', icon:'🎮' }, { id:'rA9', name:'Nova', icon:'🎮' }
          ] }], 'Ronyzera');
          return {
            recebeu: svRooms('svA').some(x => x.id === 'rA9'),
            ids: PRESET_ROOMS.map(x => x.id),
            nomes: PRESET_ROOMS.map(x => x.name)
          };
        })()`);
        ok(r.recebeu, 'servidor devia ter recebido a sala nova');
        iguais(r.ids[0], 'rA2', 'sala em uso continua visível no topo');
        ok(r.nomes.indexOf('Nova') > -1, 'sala nova aparece mesmo em chamada');
        semErros(app);
      } finally { app.fechar(); }
    }
  }
];

module.exports = { nome: 'Servidores, salas e backup', testes };
