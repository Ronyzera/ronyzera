// Anúncios assinados de servidor: a chave do dono é fixada no primeiro anúncio e
// só ela pode mudar/apagar depois. Convite ?srv= pede o servidor a quem está online.
const { criarApp, ok, iguais, semErros } = require('./harness');

const BASE = `
  myName = 'Ronyzera'; myAccountName = 'Ronyzera';
  SRV.list = [{ id:'ntg', name:'RONYZERA', owner:'rony', v:1, img:'', rooms: DEFAULT_ROOMS }];
  SRV.cur = 'ntg'; PRESET_ROOMS = svRooms('ntg');
  window.__toasts = [];
  window.botToast = t => window.__toasts.push(t);
  window.cnPeers = () => [];
  window.cnSend = () => {};
`;

// Monta (e assina) um servidor qualquer dentro do app
const CRIAR = `
  async function montar(id, nome){
    const s = { id, name:nome, owner:String(myAccountName || myName), v:1000, img:'',
      rooms:[{ id:'rx1', name:'Geral', icon:'\\uD83C\\uDFAE' }] };
    await svAssinar(s);
    return s;
  }
`;

const testes = [
  {
    nome: 'anúncio assinado entra e fixa a chave do dono',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(async () => {
          ${CRIAR}
          const s = await montar('svX', 'Servidor X');
          const enviado = JSON.parse(JSON.stringify(s));
          SRV.list = SRV.list.filter(x => x.id !== 'svX'); srvsSave();     // ainda não tenho
          const mudou = await svsOnDir({ list:[enviado], from:'Ronyzera' }, 'p9');
          const cur = srvGet('svX');
          // o mesmo dono manda uma versão mais nova: aceita e mantém a chave
          const novo = Object.assign({}, enviado, { name:'Servidor X2', v: enviado.v + 10 });
          await svAssinar(novo);
          const mudouNovo = await svsOnDir({ list:[novo], from:'Ronyzera' }, 'p9');
          // versão mais antiga (rollback) é ignorada
          const velho = Object.assign({}, enviado, { name:'Voltou no tempo', v: 1 });
          await svAssinar(velho);
          const mudouVelho = await svsOnDir({ list:[velho], from:'Ronyzera' }, 'p9');
          return {
            mudou, mudouNovo, mudouVelho,
            nome: srvGet('svX') && srvGet('svX').name,
            chave: cur && cur.ownerKey,
            fp: (await svMinhaChave()).fp,
            assinado: !!(cur && cur.sig && cur.ownerPub)
          };
        })()`);
        ok(r.mudou === true, 'o anúncio assinado deveria entrar');
        ok(r.assinado, 'guardou sem assinatura');
        ok(r.chave && r.chave === r.fp, 'a chave do dono não foi fixada');
        ok(r.mudouNovo === true, 'atualização do mesmo dono foi recusada');
        iguais(r.nome, 'Servidor X2', 'versão antiga não pode voltar');
        ok(r.mudouVelho === false, 'rollback deveria ser ignorado');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'outra chave (ou anúncio sem assinatura) não muda servidor já fixado',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(async () => {
          ${CRIAR}
          const s = await montar('svY', 'Servidor Y');
          const enviado = JSON.parse(JSON.stringify(s));
          SRV.list = SRV.list.filter(x => x.id !== 'svY'); srvsSave();
          await svsOnDir({ list:[enviado], from:'Ronyzera' }, 'p9');
          const chaveBoa = srvGet('svY').ownerKey;
          // atacante com chave própria tenta renomear
          localStorage.removeItem('ntg_keypair'); svKeyCache = null;
          const falso = Object.assign({}, enviado, { name:'Invadido', v: enviado.v + 500 });
          delete falso.sig; delete falso.ownerKey; delete falso.ownerPub;
          await svAssinar(falso);
          const mudouFalso = await svsOnDir({ list:[falso], from:'Ronyzera' }, 'p10');
          // anúncio antigo sem assinatura, vindo do "dono"
          const semSig = Object.assign({}, enviado, { name:'Sem assinatura', v: enviado.v + 900 });
          delete semSig.sig; delete semSig.ownerKey; delete semSig.ownerPub;
          const mudouSemSig = await svsOnDir({ list:[semSig], from:'Ronyzera' }, 'p10');
          // nome de outra pessoa tentando mexer
          const deOutro = Object.assign({}, enviado, { name:'De outro', v: enviado.v + 950 });
          delete deOutro.sig; delete deOutro.ownerKey; delete deOutro.ownerPub;
          const mudouOutro = await svsOnDir({ list:[deOutro], from:'Intruso' }, 'p10');
          const cur = srvGet('svY');
          return {
            mudouFalso, mudouSemSig, mudouOutro,
            nome: cur && cur.name, chave: cur && cur.ownerKey, chaveBoa
          };
        })()`);
        ok(r.mudouFalso === false, 'anúncio de outra chave foi aceito');
        ok(r.mudouSemSig === false, 'anúncio sem assinatura derrubou a chave fixada');
        ok(r.mudouOutro === false, 'anúncio de outro nome foi aceito');
        iguais(r.nome, 'Servidor Y', 'o servidor não podia mudar de nome');
        iguais(r.chave, r.chaveBoa, 'a chave fixada mudou');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'quem recebe um anúncio assinado repassa para os outros peers',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(async () => {
          ${CRIAR}
          const s = await montar('svZ', 'Servidor Z');
          const enviado = JSON.parse(JSON.stringify(s));
          SRV.list = SRV.list.filter(x => x.id !== 'svZ'); srvsSave();
          const enviados = [];
          window.cnPeers = () => ['p2', 'p3'];
          window.cnSend = (pid, o) => enviados.push({ pid, o });
          await svsOnDir({ list:[enviado], from:'Ronyzera' }, 'p2');
          const reles = enviados.filter(e => e.o && e.o.type === 'sv-dir');
          const repetido = await svsOnDir({ list:[enviado], from:'Ronyzera' }, 'p2');
          return {
            temSrv: !!srvGet('svZ'),
            destinos: reles.map(e => e.pid),
            qtd: reles.length,
            listaOk: !!(reles[0] && reles[0].o.list && reles[0].o.list[0].sig),
            repetido,
            qtdDepois: enviados.filter(e => e.o && e.o.type === 'sv-dir').length
          };
        })()`);
        ok(r.temSrv, 'não adicionou o servidor');
        iguais(r.destinos, ['p3'], 'só deveria repassar para quem não mandou');
        ok(r.listaOk, 'repassou sem a assinatura');
        iguais(r.repetido, false, 'o mesmo anúncio não deveria mexer de novo');
        iguais(r.qtdDepois, r.qtd, 'repassou o mesmo anúncio duas vezes');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'exclusão só vale assinada pela chave do dono',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(async () => {
          ${CRIAR}
          const s = await montar('svW', 'Servidor W');
          const enviado = JSON.parse(JSON.stringify(s));
          SRV.list = SRV.list.filter(x => x.id !== 'svW'); srvsSave();
          await svsOnDir({ list:[enviado], from:'Ronyzera' }, 'p9');
          const assinarDel = async (id) => {
            const k = await svMinhaChave();
            const texto = JSON.stringify({ t:'sv-del', id:String(id) });
            const sig = await crypto.subtle.sign({ name:'ECDSA', hash:'SHA-256' }, k.key, new TextEncoder().encode(texto));
            return { type:'sv-del', id, ownerKey:k.fp, ownerPub:k.pub, sig:svB64(sig), from:myName };
          };
          const doDono = await assinarDel('svW');
          // chave de outra instalação não apaga
          localStorage.removeItem('ntg_keypair'); svKeyCache = null;
          const daOutra = await assinarDel('svW');
          await svsOnDel(daOutra, 'p10');
          const depoisOutra = !!srvGet('svW');
          await svsOnDel({ type:'sv-del', id:'svW', from:'Ronyzera' }, 'p10');   // sem assinatura
          const depoisSem = !!srvGet('svW');
          await svsOnDel(doDono, 'p9');
          return { depoisOutra, depoisSem, depoisDono: !!srvGet('svW') };
        })()`);
        ok(r.depoisOutra, 'outra chave conseguiu apagar');
        ok(r.depoisSem, 'exclusão sem assinatura conseguiu apagar');
        ok(!r.depoisDono, 'o dono não conseguiu apagar');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'backup leva a assinatura e a chave do dono (não perde o servidor na volta)',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(async () => {
          ${CRIAR}
          const s = await montar('svK', 'Servidor K');
          SRV.list.push(s); srvsSave();
          const bk = backupCompleto();
          const guardado = bk.servidores.find(x => x.id === 'svK');
          // o mesmo tratamento da importação
          const limpo = svServidorLimpo(JSON.parse(JSON.stringify(guardado)));
          const verifica = await svVerificarServer(limpo);
          return {
            temChave: !!guardado.ownerKey, temSig: !!guardado.sig,
            limpoChave: !!limpo.ownerKey, limpoSig: !!limpo.sig, verifica,
            salas: limpo.rooms.map(x => x.name)
          };
        })()`);
        ok(r.temChave && r.temSig, 'backup perdeu a assinatura do servidor');
        ok(r.limpoChave && r.limpoSig, 'a importação descartou a assinatura');
        ok(r.verifica, 'a assinatura não confere depois do backup');
        iguais(r.salas, ['Geral'], 'as salas do servidor deveriam continuar');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'convite ?srv= pede o servidor e entra quando ele chega',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(async () => {
          ${CRIAR}
          const s = await montar('svC', 'Servidor do Convite');
          const enviado = JSON.parse(JSON.stringify(s));
          SRV.list = SRV.list.filter(x => x.id !== 'svC'); srvsSave();
          myName = 'Convidado'; myAccountName = 'Convidado';     // quem abriu o link não tem o servidor
          const pedidos = [];
          window.cnPeers = () => ['p5'];
          window.cnSend = (pid, o) => pedidos.push({ pid, o });
          svConvite = 'svC'; svConviteFeito = false;
          svsConviteIniciar();
          const pediu = pedidos.filter(e => e.o && e.o.type === 'sv-want').map(e => e.o.id);
          await svsOnDir({ list:[enviado], from:'Ronyzera' }, 'p5');
          return {
            pediu,
            tem: !!srvGet('svC'),
            atual: SRV.cur,
            convite: svConvite,
            toast: window.__toasts.filter(t => t.indexOf('convite') > -1)
          };
        })()`);
        iguais(r.pediu, ['svC'], 'não pediu o servidor do convite');
        ok(r.tem, 'o servidor do convite não foi adicionado');
        iguais(r.atual, 'svC', 'deveria abrir o servidor do convite');
        iguais(r.convite, '', 'o convite deveria ser consumido');
        ok(r.toast.length > 0, 'faltou o aviso de servidor do convite');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'servidor já conhecido não pede de novo e oferece o convite na rede',
    async fn(){
      const app = await criarApp();
      try{
        await app.run(BASE);
        const r = await app.run(`(async () => {
          ${CRIAR}
          const s = await montar('svD', 'Servidor D');
          SRV.list.push(JSON.parse(JSON.stringify(s))); srvsSave();
          const enviados = [];
          window.cnPeers = () => ['p6'];
          window.cnSend = (pid, o) => enviados.push({ pid, o });
          await svsOnWant({ type:'sv-want', id:'svD', hop:0 }, 'p6');
          const dir = enviados.filter(e => e.o && e.o.type === 'sv-dir');
          // quem não tem o servidor só repassa o pedido (com limite de saltos)
          enviados.length = 0;
          window.cnPeers = () => ['p6', 'p7'];
          await svsOnWant({ type:'sv-want', id:'svInexistente', hop:0 }, 'p6');
          const hop1 = enviados.filter(e => e.o && e.o.type === 'sv-want' && e.o.hop === 1).map(e => e.pid);
          enviados.length = 0;
          await svsOnWant({ type:'sv-want', id:'svInexistente', hop:2 }, 'p6');
          const parou = enviados.length;
          return { resposta: dir.length, dono: dir[0] && dir[0].o.list[0].owner, assinado: !!(dir[0] && dir[0].o.list[0].sig), hop1, parou };
        })()`);
        iguais(r.resposta, 1, 'deveria mandar o servidor para quem pediu');
        iguais(r.dono, 'Ronyzera');
        ok(r.assinado, 'mandou o convite sem assinatura');
        iguais(r.hop1, ['p7'], 'deveria repassar o pedido para os outros');
        iguais(r.parou, 0, 'pedido com muitos saltos deveria parar');
        semErros(app);
      } finally { app.fechar(); }
    }
  }
];

module.exports = { nome: 'Convites e anúncios assinados', testes };
