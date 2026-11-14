// Montagem da lista ICE: STUN sempre presente e TURN com credencial fixa ou
// temporária (padrão do coturn: usuario "expira:nome" + HMAC-SHA1 do segredo).
const crypto = require('crypto');
const turn = require('../turn.js');
const { criarApp, ok, iguais, semErros } = require('./harness');

function turnDe(lista){
  return (Array.isArray(lista) ? lista : []).find(x => x && x.username !== undefined);
}

const testes = [
  {
    nome: 'sem configuração usa STUN + TURN padrão do app',
    async fn(){
      const lista = turn.iceServers(null);
      ok(Array.isArray(lista) && lista.length >= 2, 'lista ICE incompleta');
      const stun = lista[0];
      ok(Array.isArray(stun.urls) && stun.urls.every(u => /^stun:/.test(u)), 'primeiro item deve ser STUN');
      const t = turnDe(lista);
      ok(t, 'faltou o TURN padrão');
      iguais(t.username, turn.PADRAO.username);
      iguais(t.credential, turn.PADRAO.credential);
      ok(t.urls.length >= 2, 'poucas URLs de TURN');
    }
  },
  {
    nome: 'configuração estática troca URL, usuário e senha',
    async fn(){
      const cfg = { urls: ['turn:meu.turn:3478', 'turns:meu.turn:5349'], username: 'eu', credential: 's3nha' };
      const t = turnDe(turn.iceServers(cfg));
      iguais(t.username, 'eu');
      iguais(t.credential, 's3nha');
      iguais(t.urls, cfg.urls);
      ok(JSON.stringify(turn.iceServers(cfg)).indexOf(turn.PADRAO.credential) < 0, 'vazou a credencial padrão');
    }
  },
  {
    nome: 'segredo do coturn gera usuário/senha temporários (HMAC-SHA1)',
    async fn(){
      const cfg = { urls: 'turn:coturn.local:3478', secret: 'segredo-do-servidor', ttl: 600, nome: 'rony' };
      const agora = 1700000000000;
      const t = turnDe(turn.iceServers(cfg, agora));
      const expira = Math.floor(agora / 1000) + 600;
      iguais(t.username, expira + ':rony', 'usuário do coturn');
      const esperado = crypto.createHmac('sha1', cfg.secret).update(t.username).digest('base64');
      iguais(t.credential, esperado, 'credencial do coturn');
      ok(JSON.stringify(t).indexOf(cfg.secret) < 0, 'o segredo não pode sair na lista');
      // ttl curto/longo é limitado entre 1 min e 24 h
      const curto = turnDe(turn.iceServers({ urls: 'turn:x', secret: 's', ttl: 5, nome: 'a' }, agora));
      iguais(curto.username, (Math.floor(agora / 1000) + 60) + ':a', 'ttl mínimo');
      const longo = turnDe(turn.iceServers({ urls: 'turn:x', secret: 's', ttl: 999999, nome: 'a' }, agora));
      iguais(longo.username, (Math.floor(agora / 1000) + 86400) + ':a', 'ttl máximo');
    }
  },
  {
    nome: 'configuração vazia não inventa TURN quebrado',
    async fn(){
      for(const cfg of [{}, { urls: [] }, { urls: '' }]){
        const lista = turn.iceServers(cfg);
        iguais(lista.length, 1, 'só deveria sobrar o STUN');
        ok(Array.isArray(lista[0].urls), 'primeiro item deve ser STUN');
      }
    }
  },
  {
    nome: 'no navegador a credencial vem do turn.json (e o app instalado tem prioridade)',
    async fn(){
      const app = await criarApp();
      try{
        // sem a meta que aponta o arquivo nem tenta buscar (nada de 404 no console)
        const sem = await app.run(`(async () => {
          let buscou = false;
          window.fetch = async () => { buscou = true; return { ok:false, json: async () => ({}) }; };
          iceLoaded = false; ICE_SERVERS = [{ urls:['stun:x'] }];
          await loadIceServers();
          return { ice: ICE_SERVERS, buscou };
        })()`);
        iguais(sem.ice.length, 1, 'sem turn.json não pode inventar TURN');
        ok(!sem.buscou, 'não deveria buscar turn.json sem a meta');
        // com a meta + turn.json: entra um TURN com as credenciais publicadas pelo site
        const com = await app.run(`(async () => {
          const meta = document.createElement('meta');
          meta.name = 'ronyzera-turn'; meta.content = 'turn.json';
          document.head.appendChild(meta);
          let alvo = '';
          window.fetch = async u => { alvo = u; return { ok: true, json: async () => ({ urls:['turn:web.exemplo:3478'], username:'web', credential:'s3nha' }) }; };
          iceLoaded = false; ICE_SERVERS = [{ urls:['stun:x'] }];
          await loadIceServers();
          return { ice: ICE_SERVERS, alvo };
        })()`);
        iguais(com.alvo, 'turn.json', 'deveria buscar o arquivo apontado pela meta');
        iguais(com.ice.length, 2, 'deveria somar o TURN do turn.json');
        iguais(com.ice[1].urls, ['turn:web.exemplo:3478']);
        iguais(com.ice[1].username, 'web');
        // arquivo incompleto é ignorado
        const quebrado = await app.run(`(async () => {
          window.fetch = async () => ({ ok: true, json: async () => ({ urls:['turn:x'] }) });
          iceLoaded = false; ICE_SERVERS = [{ urls:['stun:x'] }];
          await loadIceServers();
          return ICE_SERVERS;
        })()`);
        iguais(quebrado.length, 1, 'turn.json sem usuário/senha não vale');
        // app instalado: a ponte do processo principal manda na lista
        const desktop = await app.run(`(async () => {
          window.fetch = async () => { throw new Error('não deveria buscar turn.json'); };
          window.desktop = { iceServers: async () => ([{ urls:['stun:x'] }, { urls:['turn:app:3478'], username:'app', credential:'c' }]) };
          iceLoaded = false; ICE_SERVERS = [{ urls:['stun:x'] }];
          await loadIceServers();
          return ICE_SERVERS;
        })()`);
        iguais(desktop.length, 2, 'a ponte do app deveria ser usada');
        iguais(desktop[1].urls, ['turn:app:3478']);
        semErros(app);
      } finally { app.fechar(); }
    }
  }
];

module.exports = { nome: 'ICE e TURN', testes };
