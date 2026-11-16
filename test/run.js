// Executa todas as suítes (npm test). Sem dependências além do jsdom.
const suites = [
  require('./sintaxe.test.js'),
  require('./estilo.test.js'),
  require('./seguranca.test.js'),
  require('./contas.test.js'),
  require('./turn.test.js'),
  require('./servidores.test.js'),
  require('./convites.test.js'),
  require('./chat-servidor.test.js'),
  require('./voz.test.js'),
  require('./presenca.test.js'),
  require('./tela.test.js'),
  require('./midia.test.js'),
  require('./sala-presa.test.js'),
  require('./turn.test.js')
];

(async () => {
  let total = 0, falhas = 0;
  const começou = Date.now();
  for(const suite of suites){
    console.log('\n' + suite.nome);
    for(const t of suite.testes){
      total++;
      const t0 = Date.now();
      try{
        await t.fn();
        console.log('  \u2713 ' + t.nome + ' (' + (Date.now() - t0) + ' ms)');
      }catch(e){
        falhas++;
        console.log('  \u2717 ' + t.nome + '\n      ' + ((e && e.message) || e));
      }
    }
  }
  const seg = ((Date.now() - começou) / 1000).toFixed(1);
  console.log('\n' + (total - falhas) + '/' + total + ' testes passaram em ' + seg + 's' +
    (falhas ? ' — ' + falhas + ' falhou/falharam' : ''));
  process.exit(falhas ? 1 : 0);
})();
