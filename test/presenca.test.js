// Presença na sala: quem some sem sair (internet caiu, PC desligou) não pode deixar fantasma
// nem travar a sala por 30-60s. Estes testes travam os prazos e a recuperação do anfitrião.
const { criarApp, ok, iguais, semErros } = require('./harness');

const testes = [
  {
    nome: 'prazos de presença: fantasma em 15 s e anfitrião sumido em 12 s',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`({
          check: DIR_CHECK_MS, silencio: DIR_SILENCIO_MS, host: HOST_SILENCIO_MS, janela: RECUPERA_JANELA_MS,
          tentativa: RECUPERA_TENTATIVA_MS,
          vazio: silenciosoHa(undefined, 100000, 15000),
          recente: silenciosoHa(90000, 100000, 15000),
          velho: silenciosoHa(80000, 100000, 15000),
          zero: silenciosoHa(0, 100000, 15000)
        })`);
        ok(r.silencio <= 20000, 'participante fantasma demora demais para sair: ' + r.silencio + 'ms');
        ok(r.host <= 15000, 'anfitrião sumido demora demais para ser detectado: ' + r.host + 'ms');
        ok(r.check <= 4000, 'conferência do anfitrião espaçada demais: ' + r.check + 'ms');
        ok(r.janela <= 45000, 'janela de recuperação longa demais: ' + r.janela + 'ms');
        // negociar o canal de dados leva 2-5s: tentar em 1,2s nunca conecta e a sala fica "reorganizando" para sempre
        ok(r.tentativa >= 4000, 'tentativa de reconectar curta demais (o canal não abre): ' + r.tentativa + 'ms');
        iguais(r.vazio, false, 'quem nunca deu sinal não é fantasma ainda');
        iguais(r.recente, false, 'sinal recente não é fantasma');
        iguais(r.velho, true, 'sinal velho é fantasma');
        iguais(r.zero, false, '0 conta como "nunca deu sinal" (não é fantasma)');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'createPeer destrói a instância quando o id está ocupado (sem zumbis disputando a sala)',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          const criados = [];
          window.Peer = class {
            constructor(id){
              this.id = id; this.destroyed = false; this.h = {};
              criados.push(this);
              setTimeout(() => this.emit('error', { type: 'unavailable-id', message: 'ID is taken' }), 5);
            }
            on(ev, fn){ (this.h[ev] = this.h[ev] || []).push(fn); }
            once(ev, fn){ this.on(ev, fn); }
            emit(ev, v){ (this.h[ev] || []).slice().forEach(fn => fn(v)); }
            destroy(){ this.destroyed = true; }
          };
          let erro = null;
          try{ await createPeer('dir-sala'); }catch(e){ erro = String((e && (e.type || e.message)) || 'erro'); }
          return { erro, total: criados.length, destruidos: criados.filter(p => p.destroyed).length };
        })()`);
        iguais(r.total, 1, 'uma instância por tentativa');
        iguais(r.destruidos, 1, 'instância com erro precisa ser destruída');
        ok(r.erro && r.erro.indexOf('unavailable-id') > -1, 'erro repassado: ' + r.erro);
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'createPeer mantém a instância que abriu e registra o keep-alive',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          const criados = [];
          window.Peer = class {
            constructor(id){
              this.id = id; this.destroyed = false; this.h = {};
              criados.push(this);
              setTimeout(() => this.emit('open', id), 5);
            }
            on(ev, fn){ (this.h[ev] = this.h[ev] || []).push(fn); }
            once(ev, fn){ this.on(ev, fn); }
            emit(ev, v){ (this.h[ev] || []).slice().forEach(fn => fn(v)); }
            destroy(){ this.destroyed = true; }
          };
          const p = await createPeer('eu-123');
          return { mesmo: p === criados[0], destruido: criados[0].destroyed, registrado: livePeers.has(p), id: p.id };
        })()`);
        iguais(r.mesmo, true);
        iguais(r.destruido, false, 'quem abriu não é destruído');
        iguais(r.registrado, true, 'entra no keep-alive');
        iguais(r.id, 'eu-123');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'anfitrião sumido: assume a sala na primeira rodada, sem fila de 30 tentativas',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          myId = 'eu-1'; roomId = 'sala-teste'; leaving = false; recovering = false; isDirectory = false; lastRecoverEnd = 0;
          knownPeers.clear(); knownPeers.set('outro-2', 'Outro');
          let conecta = 0, assume = 0;
          // 'livre' = o broker avisou que ninguém está com "dir-<sala>" (antes: qualquer falha virava tentativa de assumir)
          window.tryConnectDirectory = async () => { conecta++; ultimaFalhaDir = 'livre'; return null; };
          window.claimDirectory = async () => { assume++; isDirectory = true; dirOwnerId = myId; return true; };
          const t0 = Date.now();
          await recoverDirectory();
          return { conecta, assume, dir: isDirectory, dono: dirOwnerId, ms: Date.now() - t0 };
        })()`);
        iguais(r.dir, true, 'assumiu a sala');
        iguais(r.dono, 'eu-1');
        iguais(r.assume, 1, 'tenta assumir já na primeira rodada');
        iguais(r.conecta, 1);
        ok(r.ms < 3000, 'recuperação lenta: ' + r.ms + 'ms');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'anfitrião sumido: quem acha o novo dono entra sem virar anfitrião',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          myId = 'eu-3'; roomId = 'sala-teste'; leaving = false; recovering = false; isDirectory = false; lastRecoverEnd = 0;
          broadcastMyState = () => {};
          let assumiu = 0;
          window.tryConnectDirectory = async () => ({ open: true, send(){}, on(){}, close(){} });
          window.claimDirectory = async () => { assumiu++; return true; };
          await recoverDirectory();
          return { dir: isDirectory, adotou: !!dirConn, assumiu };
        })()`);
        iguais(r.dir, false, 'não vira anfitrião se já existe um');
        iguais(r.adotou, true, 'adotou o novo anfitrião');
        iguais(r.assumiu, 0, 'nem tenta assumir quando acha o anfitrião');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'recarregar a página tem trava contra loop (3x em 2 min)',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          sessionStorage.removeItem('ntg_reloads'); sessionStorage.removeItem('ntg_reload_t');
          const chamadas = [];
          for(let i = 0; i < 4; i++) chamadas.push(recarregarComGuarda('teste'));
          return { chamadas, contador: sessionStorage.getItem('ntg_reloads') };
        })()`);
        iguais(r.chamadas, [true, true, true, false], 'depois de 3 recargas seguidas para de recarregar');
        iguais(r.contador, '3');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'peer que não reconecta nunca cai na recarga de segurança',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          sessionStorage.removeItem('ntg_reloads'); sessionStorage.removeItem('ntg_reload_t');
          const h = {};
          const p = {
            destroyed: false, disconnected: true,
            on(ev, fn){ (h[ev] = h[ev] || []).push(fn); },
            emit(ev){ (h[ev] || []).slice().forEach(fn => fn()); },
            reconnect(){}
          };
          leaving = false;
          keepPeerRegistered(p);
          for(let i = 0; i < 7; i++) p.emit('disconnected');
          const antes = sessionStorage.getItem('ntg_reloads') || '0';
          p.emit('disconnected');
          const depois = sessionStorage.getItem('ntg_reloads') || '0';
          return { antes, depois };
        })()`);
        iguais(r.antes, '0', 'com poucas falhas ainda não recarrega');
        iguais(r.depois, '1', 'com 8 falhas seguidas recarrega uma vez');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'sala presa numa conexão antiga mostra aviso próprio (em vez de "configure TURN")',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          myId = 'eu-9'; roomId = 'sala-presa'; leaving = false; recovering = false; isDirectory = false; lastRecoverEnd = 0; recuperaCiclos = 0;
          window.tryConnectDirectory = async () => { ultimaFalhaDir = 'livre'; return null; };
          window.claimDirectory = async () => { isDirectory = true; return true; };
          await recoverDirectory('Entrando na sala — o anfitrião ainda não respondeu; tentando de novo...');
          return { status: document.getElementById('statusText').textContent, dir: isDirectory };
        })()`);
        iguais(r.dir, true, 'assumiu assim que liberou');
        ok(r.status.indexOf('anfitrião ainda não respondeu') > -1, 'status explicando o motivo real: ' + r.status);
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'assumir a sala só quando o id está livre (ou o anfitrião virou fantasma)',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          const teste = (falha, ciclos) => { ultimaFalhaDir = falha; recuperaCiclos = ciclos; return podeAssumirSala(); };
          return {
            livre: teste('livre', 0),
            semResposta: teste('sem-resposta', 0),
            sinalizacao: teste('sinalizacao', 1),
            fantasma: teste('sem-resposta', 3)
          };
        })()`);
        iguais(r.livre, true, 'id livre: pode assumir a sala');
        iguais(r.semResposta, false, 'id ocupado: espera o anfitrião responder, sem tomar o id dele');
        iguais(r.sinalizacao, false, 'falha da nossa sinalização não vira "assumir"');
        iguais(r.fantasma, true, 'depois de 3 janelas sem NENHUMA resposta, assume (anfitrião zumbi)');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'com o anfitrião na sala, o app não toma o id dele (era o "reorganizando" eterno)',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          myId = 'eu-5'; roomId = 'sala-cheia'; leaving = false; recovering = false; isDirectory = false; recuperaCiclos = 0;
          let conecta = 0, assume = 0;
          window.tryConnectDirectory = async () => {
            conecta++;
            ultimaFalhaDir = 'sem-resposta';     // o id existe, mas o canal não abriu (rede lenta/NAT)
            if(conecta >= 3) leaving = true;     // encerra a janela sem esperar os 25s
            return null;
          };
          window.claimDirectory = async () => { assume++; return true; };
          await recoverDirectory();
          return { conecta, assume, recovering };
        })()`);
        iguais(r.assume, 0, 'nunca tenta assumir a sala de quem já está dentro');
        ok(r.conecta >= 3, 'continua tentando conectar: ' + r.conecta + ' tentativas');
        iguais(r.recovering, false, 'sai do estado de recuperação para tentar de novo depois');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'quem é anfitrião não entra na recuperação',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          leaving = false; recovering = false; isDirectory = true;
          let tentou = 0;
          window.tryConnectDirectory = async () => { tentou++; return null; };
          window.claimDirectory = async () => { tentou++; return true; };
          await recoverDirectory();
          return tentou;
        })()`);
        iguais(r, 0, 'anfitrião atual não tenta se trocar');
        semErros(app);
      } finally { app.fechar(); }
    }
  }
];

module.exports = { nome: 'Presença na sala', testes };
