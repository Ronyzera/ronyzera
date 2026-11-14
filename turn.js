// ============================================================
// RONYZERA — servidores ICE/TURN usados na voz e na tela.
// Fica no processo principal (main.js) para a página não carregar
// credencial fixa no HTML. Duas formas de configurar:
//   1) coturn com "use-auth-secret": { urls, secret, ttl }  -> usuário/senha temporários (HMAC-SHA1)
//   2) TURN comum: { urls, username, credential }           -> credencial fixa
// Em %appdata%/RONYZERA/configuracoes.json use a chave "turn" ou defina a
// variável de ambiente RONYZERA_TURN com o mesmo JSON.
// No navegador/APK (sem processo principal) o index.html busca um "turn.json"
// publicado ao lado do site, com { urls, username, credential }.
// ============================================================
const crypto = require('crypto');

const STUN = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun.cloudflare.com:3478',
  'stun:stun.relay.metered.ca:80'
];

// Credencial pública do app (pode ser trocada pela configuração acima).
const PADRAO = {
  urls: [
    'turn:standard.relay.metered.ca:80',
    'turn:standard.relay.metered.ca:80?transport=tcp',
    'turn:standard.relay.metered.ca:443',
    'turns:standard.relay.metered.ca:443?transport=tcp',
    'turn:global.relay.metered.ca:80',
    'turn:global.relay.metered.ca:443'
  ],
  username: '7c19419341d3341b671456e9',
  credential: 'ZvsUOi39GWKUvBIt'
};

function paraLista(urls){
  return (Array.isArray(urls) ? urls : [urls]).map(u => String(u || '').trim()).filter(Boolean);
}

// Credencial temporária no padrão do coturn (use-auth-secret):
// username = "<expiração>:<nome>" e credential = base64(HMAC-SHA1(secret, username))
function hmacTurn(cfg, agora){
  const secret = String((cfg && cfg.secret) || '');
  const urls = paraLista(cfg && cfg.urls);
  const ttl = Math.max(60, Math.min(86400, +((cfg && cfg.ttl) || 3600)));
  const expira = Math.floor((agora || Date.now()) / 1000) + ttl;
  const nome = String((cfg && cfg.nome) || 'ronyzera').slice(0, 24);
  const username = expira + ':' + nome;
  const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
  return urls.map(u => ({ urls: u, username, credential }));
}

function iceServers(turn, agora){
  const lista = [{ urls: STUN.slice() }];
  const cfg = turn || PADRAO;
  if(cfg){
    if(cfg.secret) lista.push(...hmacTurn(cfg, agora));
    else if(cfg.urls){
      const urls = paraLista(cfg.urls);
      if(urls.length) lista.push({ urls, username: String(cfg.username || ''), credential: String(cfg.credential || '') });
    }
  }
  return lista;
}

module.exports = { iceServers, hmacTurn, STUN, PADRAO };
