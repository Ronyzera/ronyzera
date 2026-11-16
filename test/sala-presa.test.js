// Sala "presa": entra na sala que jÃ¡ teve gente e ficou impossÃ­vel de abrir.
// Causa: o id "dir-<sala>" continua registrado no servidor mas ninguÃ©m responde (saÃ­da forÃ§ada,
// PC dormindo, conexÃ£o velha). Salas novas funcionavam porque o id era novo.
const { criarApp, ok, iguais, semErros } = require('./harness');

const connFalsa = `({ open: true, send(){}, on(){}, close(){} })`;

const testes = [
  {
    nome: 'a sala tem geraÃ§Ãµes: dir-<sala>, dir-<sala>-2 e dir-<sala>-3',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => salaIds('minha-sala'))()`);
        iguais(r, ['dir-minha-sala', 'dir-minha-sala-2', 'dir-minha-sala-3']);
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'id principal ocupado e mudo: entra no anfitriÃ£o da geraÃ§Ã£o seguinte',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          myId = 'eu-1'; roomId = 'sala-presa'; leaving = false; recovering = false; isDirectory = false;
          lastRecoverEnd = 0; recuperaCiclos = 1;
          broadcastMyState = () => {};
          window.tryConnectDirectory = async () => { ultimaFalhaDir = 'sem-resposta'; return null; };
          window.salaProcurarGeracoes = async ids => ({ conn: ${connFalsa}, id: ids[0], livres: [] });
          window.claimDirectory = async () => { throw new Error('nÃ£o devia assumir a sala com anfitriÃ£o vivo'); };
          await recoverDirectory();
          return { adotou: !!dirConn, dir: isDirectory, status: document.getElementById('statusText').textContent };
        })()`);
        iguais(r.adotou, true, 'tem que entrar na sala que respondeu');
        iguais(r.dir, false, 'nÃ£o vira anfitriÃ£o quando existe anfitriÃ£o');
        iguais(r.status, 'Conectado');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'ninguÃ©m responde em nenhuma geraÃ§Ã£o: assume a primeira sala livre',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          myId = 'eu-2'; roomId = 'sala-presa'; leaving = false; recovering = false; isDirectory = false;
          lastRecoverEnd = 0; recuperaCiclos = 1;
          window.tryConnectDirectory = async () => { ultimaFalhaDir = 'sem-resposta'; return null; };
          window.salaProcurarGeracoes = async () => ({ conn: null, id: '', livres: ['dir-sala-presa-2'] });
          const assumidas = [];
          window.claimDirectory = async id => { assumidas.push(id); isDirectory = true; return true; };
          await recoverDirectory();
          return { assumidas, dir: isDirectory };
        })()`);
        iguais(r.assumidas, ['dir-sala-presa-2'], 'assume a sala livre em vez de esperar para sempre');
        iguais(r.dir, true);
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'sair da sala nÃ£o deixa nenhuma instÃ¢ncia nossa segurando o id',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          const mortos = [];
          const atual = { id: 'dir-sala-presa-2', destroy(){ mortos.push('atual'); } };
          const preso = { id: 'dir-sala-presa', destroy(){ mortos.push('preso'); } };
          const outra = { id: 'dir-outra-sala', destroy(){ mortos.push('outra'); } };
          livePeers.clear();
          livePeers.add(atual); livePeers.add(preso); livePeers.add(outra);
          peer = atual; roomId = 'sala-presa';
          soltarIdsDaSala();
          return { mortos };
        })()`);
        iguais(r.mortos, ['preso'], 'sÃ³ larga o id preso da sala; a instÃ¢ncia atual e outras salas ficam');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'assumir a sala larga antes um id que ficou preso com a gente',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          const mortos = [];
          livePeers.clear();
          const preso = { id: 'dir-x-2', destroy(){ mortos.push('preso'); } };
          livePeers.add(preso);
          peer = null; dirPeer = null; isDirectory = false; leaving = false; inRoom = false;
          window.startDirectoryServer = () => {};
          window.pruneStaleMembers = () => {};
          window.createPeer = async id => ({ id, destroy(){}, destroyed: false });
          const ok2 = await claimDirectory('dir-x-2');
          return { mortos, ok: ok2, dir: isDirectory };
        })()`);
        iguais(r.mortos, ['preso'], 'id preso por nÃ³s tem que ser largado antes de assumir');
        iguais(r.ok, true);
        iguais(r.dir, true);
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'sala com dois endereÃ§os: entra na que o pessoal estÃ¡ usando em vez de abrir uma vazia',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          roomId = 'sala-antiga'; leaving = false; joinSeq = 0; inRoom = false; isDirectory = false;
          PRESET_ROOMS = [{ id:'sala-antiga', name:'RONY' }, { id:'sala-nova', name:'RONY' }];
          broadcastMyState = () => {};
          window.nsAcquire = async () => ({ getAudioTracks(){ return []; }, getTracks(){ return []; } });
          window.startEchoDucking = () => {};
          window.loadIceServers = async () => {};
          window.cnStart = () => {};
          window.createPeer = async id => ({ id, destroy(){}, destroyed:false, on(){}, off(){}, connect(){ throw new Error('sem rede'); } });
          const sondados = [];
          window.salaSondar = async (p, ids) => { sondados.push(ids.slice()); return ids.map(id => ({ id, conn: id === 'dir-sala-nova' ? ${connFalsa} : null, livre: id !== 'dir-sala-nova' })); };
          window.claimDirectory = async () => { throw new Error('nÃ£o devia abrir sala nova'); };
          await startCall();
          return { adotou: !!dirConn, dono: dirOwnerId, sondados };
        })()`);
        iguais(r.adotou, true, 'tem que entrar na sala irmÃ£ que tem anfitriÃ£o');
        ok(r.sondados.some(l => l.indexOf('dir-sala-nova') > -1), 'tem que sondar o endereÃ§o da sala irmÃ£: ' + JSON.stringify(r.sondados));
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'sala vazia: vira anfitriÃ£ no endereÃ§o principal (sem esperar ninguÃ©m)',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          roomId = 'sala-x'; leaving = false; joinSeq = 0; inRoom = false; isDirectory = false;
          PRESET_ROOMS = [{ id:'sala-x', name:'Sala X' }];
          window.nsAcquire = async () => ({ getAudioTracks(){ return []; }, getTracks(){ return []; } });
          window.startEchoDucking = () => {};
          window.loadIceServers = async () => {};
          window.cnStart = () => {};
          window.createPeer = async id => ({ id, destroy(){}, destroyed:false, on(){}, off(){}, connect(){ throw new Error('sem rede'); } });
          window.salaSondar = async (p, ids) => ids.map(id => ({ id, livre: true }));
          const assumidas = [];
          window.claimDirectory = async (id, comoHost) => { assumidas.push(id + '|' + (comoHost ? 'host' : '?')); return true; };
          await startCall();
          return { assumidas };
        })()`);
        iguais(r.assumidas, ['dir-sala-x|host'], 'assume o endereÃ§o principal como anfitriÃ£');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'endereÃ§o principal preso: a sala nova Ã© aberta na segunda geraÃ§Ã£o',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          roomId = 'sala-y'; leaving = false; joinSeq = 0; inRoom = false; isDirectory = false;
          PRESET_ROOMS = [{ id:'sala-y', name:'Sala Y' }];
          window.nsAcquire = async () => ({ getAudioTracks(){ return []; }, getTracks(){ return []; } });
          window.startEchoDucking = () => {};
          window.loadIceServers = async () => {};
          window.cnStart = () => {};
          window.createPeer = async id => ({ id, destroy(){}, destroyed:false, on(){}, off(){}, connect(){ throw new Error('sem rede'); } });
          window.salaSondar = async (p, ids) => ids.map(id => id === 'dir-sala-y-2' ? { id, livre: true } : { id, silencio: true });
          const assumidas = [];
          window.claimDirectory = async (id, comoHost) => { assumidas.push(id + '|' + (comoHost ? 'host' : '?')); return true; };
          await startCall();
          return { assumidas };
        })()`);
        iguais(r.assumidas, ['dir-sala-y-2|host'], 'o endereÃ§o preso nÃ£o pode mais impedir a sala');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'entrada abandonada (saiu no meio) nÃ£o continua conectando nem vira anfitriÃ£',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          const criados = [];
          roomId = 'sala-x'; leaving = false; joinSeq = 0; inRoom = false; isDirectory = false;
          window.nsAcquire = async () => ({ getAudioTracks(){ return []; }, getTracks(){ return []; } });
          window.startEchoDucking = () => {};
          window.loadIceServers = async () => {};
          window.cnStart = () => {};
          window.createPeer = async id => { criados.push(id); return { id, destroy(){}, destroyed: false, on(){}, off(){}, connect(){ throw new Error('sem rede'); } }; };
          const entrada = startCall();
          leaveRoom();                        // saiu enquanto a sala ainda estava abrindo
          await entrada;
          return { criados, emSala: inRoom, dir: isDirectory, peerVivo: !!peer };
        })()`);
        iguais(r.emSala, false, 'sair nÃ£o pode deixar a tela "dentro da sala"');
        iguais(r.peerVivo, false, 'nenhuma conexÃ£o Ã³rfÃ£ sobrando');
        iguais(r.dir, false, 'nÃ£o vira anfitriÃ£ de uma sala que vocÃª abandonou');
        ok(r.criados.length === 0, 'nem chega a criar conexÃ£o depois de sair: ' + JSON.stringify(r.criados));
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'sozinho e com gente em outra geração: entra na sala do pessoal e larga a vazia',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          const mortos = [];
          roomId = 'sala-z'; leaving = false; recovering = false; inRoom = true;
          isDirectory = true; dirLocalId = 'dir-sala-z';
          dirPeer = { destroy(){ mortos.push('vazio'); }, destroyed: false };
          peer = { destroyed: false };
          myId = 'eu-z'; knownPeers.clear();
          broadcastMyState = () => {};
          window.salaSondar = async (p, ids) => ids.map(id => id === 'dir-sala-z-2' ? { id, conn: { open: true, peer: id, send(){}, on(){}, close(){} } } : { id, livre: true });
          const juntou = await salaJuntarSeSozinho();
          return { juntou, mortos, dir: isDirectory, dono: dirConn && dirConn.peer, endereco: dirLocalId };
        })()`);
        iguais(r.juntou, true, 'tem que entrar na sala onde o pessoal está');
        iguais(r.mortos, ['vazio'], 'a sala vazia que eu segurava tem que ser largada');
        iguais(r.dir, false, 'deixa de ser anfitrião da sala vazia');
        iguais(r.dono, 'dir-sala-z-2', 'passa a usar o canal do anfitrião encontrado');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'com gente na sala não sai procurando outra',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          roomId = 'sala-w'; leaving = false; inRoom = true; isDirectory = true; dirLocalId = 'dir-sala-w';
          dirPeer = { destroy(){ throw new Error('não devia largar a sala'); }, destroyed: false };
          peer = { destroyed: false };
          myId = 'eu-w'; knownPeers.clear(); knownPeers.set('amigo', 'Amigo');
          let sondou = 0;
          window.salaSondar = async () => { sondou++; return []; };
          const juntou = await salaJuntarSeSozinho();
          return { juntou, sondou, dir: isDirectory };
        })()`);
        iguais(r.juntou, false);
        iguais(r.sondou, 0, 'não pode ficar sondando quando a sala já tem gente');
        iguais(r.dir, true);
        semErros(app);
      } finally { app.fechar(); }
    }
  }
];

module.exports = { nome: 'Sala presa', testes };

