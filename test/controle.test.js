// Canal de controle (ctl): é por ele que viaja o pedido "ver tela" e os avisos da sala.
// Um canal que fica preso em "conectando" nunca abre nem fecha: antes ficava guardado para
// sempre e TODA mensagem era descartada em silêncio (o pedido de tela nunca chegava no PC).
const fs = require('fs');
const path = require('path');
const { criarApp, ok, iguais, semErros } = require('./harness');

const fonte = () => fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// canal de controle falso: abre quando mandamos (ou fica preso, como na rede real)
const FALSO = `
  function canalFalso(abreLogo){
    const h = { on: {}, once: {} };
    const c = {
      open: false, enviados: [], fechado: false, _criado: Date.now(),
      send(m){ this.enviados.push(m); },
      on(ev, fn){ (h.on[ev] = h.on[ev] || []).push(fn); },
      once(ev, fn){ (h.once[ev] = h.once[ev] || []).push(fn); },
      emitir(ev){ (h.on[ev] || []).forEach(f => f()); (h.once[ev] || []).forEach(f => f()); },
      close(){ this.fechado = true; }
    };
    if(abreLogo){ c.open = true; }
    return c;
  }`;

const testes = [
  {
    nome: 'canal aberto: manda na hora',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          ${FALSO}
          const c = canalFalso(true);
          peer = { connect: () => c };
          ctlOut.clear(); leaving = false;
          const ok1 = ctlSend('amigo-1', { type:'screen-watch', on:true });
          return { ok1, enviados: c.enviados.length, tipo: c.enviados[0] && c.enviados[0].type };
        })()`);
        iguais(r.ok1, true);
        iguais(r.enviados, 1, 'canal aberto não pode segurar a mensagem');
        iguais(r.tipo, 'screen-watch');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'canal preso em "conectando" não é reaproveitado para sempre',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          ${FALSO}
          const velho = canalFalso(false);
          velho._criado = Date.now() - 6000;          // criado há 6 s e nunca abriu
          const novo = canalFalso(true);
          let n = 0;
          peer = { connect: () => { n++; return novo; } };
          ctlOut.clear(); ctlOut.set('amigo-2', velho); leaving = false;
          const c = ctlGet('amigo-2');
          return { mesmo: c === velho, velhoFechado: velho.fechado, novo: c === novo };
        })()`);
        iguais(r.mesmo, false, 'não pode devolver o canal morto');
        iguais(r.velhoFechado, true, 'o canal preso tem que ser fechado');
        iguais(r.novo, true, 'tem que abrir um canal novo');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'mensagem perdida em canal que não abre é reenviada em canal novo',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          ${FALSO}
          const preso = canalFalso(false);
          const bom = canalFalso(true);
          let n = 0;
          peer = { connect: () => { n++; return n === 1 ? preso : bom; } };
          ctlOut.clear(); leaving = false;
          const ok1 = ctlSend('amigo-3', { type:'screen-watch', on:true });
          const imediato = preso.enviados.length;
          await new Promise(r2 => setTimeout(r2, 1400));
          return { ok1, imediato, conexoes: n, entregues: bom.enviados.length, tipo: bom.enviados[0] && bom.enviados[0].type, presoFechado: preso.fechado };
        })()`);
        iguais(r.ok1, false, 'não abriu: não pode dizer que enviou');
        iguais(r.imediato, 0);
        ok(r.conexoes >= 2, 'tem que abrir um canal novo para reenviar');
        iguais(r.entregues, 1, 'a mensagem tem que chegar pelo canal novo');
        iguais(r.tipo, 'screen-watch');
        iguais(r.presoFechado, true, 'descarta o canal que não abriu');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'depois de sair da sala não fica reabrindo canal de controle',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          ${FALSO}
          let n = 0;
          peer = { connect: () => { n++; return canalFalso(false); } };
          ctlOut.clear();
          leaving = false;
          ctlSend('amigo-4', { type:'x' });
          leaving = true;
          await new Promise(r2 => setTimeout(r2, 1400));
          return n;
        })()`);
        iguais(r, 1, 'saiu da sala: não pode continuar tentando');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'o diagnóstico mostra o estado do canal de controle',
    async fn(){
      const html = fonte();
      ok(/function ctlEstado\(/.test(html), 'precisa da função que informa o estado do ctl');
      ok(/· ctl: ' \+ ctlEstado\(id\)/.test(html), 'a linha do "Testar sala" precisa mostrar o ctl');
      const app = await criarApp();
      try{
        const r = await app.run(`(() => {
          ${FALSO}
          ctlOut.clear(); ctlIn.clear();
          const semCanal = ctlEstado('x');
          const aberto = canalFalso(true); ctlOut.set('y', aberto);
          const okCtl = ctlEstado('y');
          const preso = canalFalso(false); preso._criado = Date.now() - 9000; ctlOut.set('z', preso);
          return { semCanal, okCtl, preso: ctlEstado('z') };
        })()`);
        iguais(r.semCanal, 'sem canal');
        iguais(r.okCtl, 'ok');
        iguais(r.preso, 'preso');
        semErros(app);
      } finally { app.fechar(); }
    }
  }
];

module.exports = { nome: 'Canal de controle (pedido de tela)', testes };
