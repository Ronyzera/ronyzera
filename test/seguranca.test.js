// Dependências locais e CSP: o app precisa conectar mesmo sem CDN e não pode
// carregar script de qualquer origem.
const fs = require('fs');
const path = require('path');
const { criarApp, ok, semErros } = require('./harness');

const RAIZ = path.join(__dirname, '..');
function ler(nome){ return fs.readFileSync(path.join(RAIZ, nome), 'utf8'); }

const testes = [
  {
    nome: 'PeerJS vem do pacote local (sem unpkg)',
    async fn(){
      const html = ler('index.html');
      ok(!/unpkg\.com\/peerjs/i.test(html), 'ainda busca o PeerJS no unpkg');
      ok(html.indexOf('<script src="vendor/peerjs.min.js"></script>') > -1, 'script local do PeerJS ausente');
      const vendor = path.join(RAIZ, 'vendor', 'peerjs.min.js');
      ok(fs.existsSync(vendor), 'vendor/peerjs.min.js não existe');
      ok(fs.statSync(vendor).size > 50000, 'vendor/peerjs.min.js parece incompleto');
      ok(fs.existsSync(path.join(RAIZ, 'vendor', 'peerjs.LICENSE.txt')), 'licença do PeerJS ausente');
      const pkg = JSON.parse(ler('package.json'));
      ok(Array.isArray(pkg.build.files) && pkg.build.files.indexOf('vendor/**/*') > -1, 'build não empacota a pasta vendor');
      ok(/\/vendor\//.test(ler('main.js')) || /path\.join\(__dirname, 'vendor'/.test(ler('main.js')), 'servidor local não serve a pasta vendor');
    }
  },
  {
    nome: 'CSP existe, bloqueia objeto e não libera CDN de script',
    async fn(){
      const html = ler('index.html');
      const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/i);
      ok(m, 'meta CSP ausente');
      const csp = m[1];
      ok(/default-src 'self'/.test(csp), "default-src 'self'");
      ok(/script-src[^;]*'self'/.test(csp), 'script-src sem self');
      ok(/object-src 'none'/.test(csp), 'object-src none');
      ok(/base-uri 'self'/.test(csp), 'base-uri self');
      ok(!/script-src[^;]*unpkg/i.test(csp), 'unpkg liberado em script-src');
      const app = await criarApp();
      try{ semErros(app); } finally { app.fechar(); }
    }
  }
];

module.exports = { nome: 'Segurança e dependências', testes };
