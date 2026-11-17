// Celular: bloquear a tela / minimizar NÃO pode derrubar a pessoa da sala.
// No Android o `pagehide` dispara também quando a tela apaga (e não só ao fechar o app),
// então sair da sala ali fazia o app "sair sozinho". A tela também fica acesa durante a chamada.
const fs = require('fs');
const path = require('path');
const { criarApp, ok, iguais, semErros } = require('./harness');

const fonte = () => fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

const testes = [
  {
    nome: 'no celular, bloquear a tela (pagehide) NÃO sai da sala',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ${JSON.stringify(UA_ANDROID)} });
          let saiu = 0;
          window.leaveRoom = () => { saiu++; };
          inRoom = true;
          window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
          return { saiu, celular: ehCelular() };
        })()`);
        iguais(r.celular, true, 'tem que reconhecer o celular pelo user agent');
        iguais(r.saiu, 0, 'tela bloqueada não pode derrubar da sala');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'no PC, fechar a janela (pagehide) continua saindo da sala',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          let saiu = 0;
          window.leaveRoom = () => { saiu++; };
          window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
          return { saiu, celular: ehCelular() };
        })()`);
        iguais(r.celular, false);
        iguais(r.saiu, 1, 'fechar a janela no PC precisa avisar a saída');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'página guardada no cache (bfcache) não sai da sala em nenhum aparelho',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          let saiu = 0;
          window.leaveRoom = () => { saiu++; };
          window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
          return saiu;
        })()`);
        iguais(r, 0, 'ao voltar do cache a sala continua conectada');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'fechar de verdade (beforeunload) avisa a saída mesmo no celular',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ${JSON.stringify(UA_ANDROID)} });
          let saiu = 0;
          window.leaveRoom = () => { saiu++; };
          window.dispatchEvent(new Event('beforeunload'));
          window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
          return saiu;
        })()`);
        iguais(r, 1, 'ao fechar o app avisa uma vez e não duplica');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'tela fica acesa durante a sala e é liberada ao sair',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          const pedidos = [];
          let liberados = 0;
          Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: {
            request: async tipo => { pedidos.push(tipo); return { released: false, addEventListener(){}, release: async () => { liberados++; } }; }
          }});
          await manterTelaAcordada(true);
          await manterTelaAcordada(true);        // já está segura: não pede de novo
          const depoisDeDuas = pedidos.length;
          await manterTelaAcordada(false);
          return { pedidos, depoisDeDuas, liberados, solta: telaAcordada };
        })()`);
        iguais(r.pedidos, ['screen'], 'pede a trava de tela do sistema');
        iguais(r.depoisDeDuas, 1, 'não fica pedindo a mesma trava repetidamente');
        iguais(r.liberados, 1, 'ao sair da sala a trava é liberada');
        iguais(r.solta, null, 'não guarda trava já liberada');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'sem suporte a trava de tela o app não quebra',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          delete navigator.wakeLock;
          await manterTelaAcordada(true);
          return telaAcordada;
        })()`);
        iguais(r, null);
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'entrar na sala liga a trava e sair desliga (ligado ao fluxo real)',
    async fn(){
      const html = fonte();
      const entrada = (html.match(/inRoom = true;[\s\S]{0,200}?manterTelaAcordada\(true\)/) || [''])[0];
      const saida = (html.match(/inRoom = false;[\s\S]{0,200}?manterTelaAcordada\(false\)/) || [''])[0];
      ok(entrada.length > 0, 'entrar na sala precisa acender a trava de tela');
      ok(saida.length > 0, 'sair da sala precisa liberar a trava de tela');
      ok(!/pagehide'[^\n]*leaveRoom\(\)/.test(html), 'pagehide não pode chamar leaveRoom direto (derrubava no celular)');
    }
  }
];

module.exports = { nome: 'Celular: tela bloqueada', testes };
