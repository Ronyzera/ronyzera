// Garante que os scripts embutidos no index.html compilam (erro de digitação não passa batido).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const testes = [
  {
    nome: 'os scripts do index.html compilam',
    async fn(){
      const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
      const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
      let m, n = 0;
      while((m = re.exec(html))){
        const codigo = m[1];
        if(!codigo.trim()) continue;
        n++;
        try{ new vm.Script(codigo, { filename: 'index.html#script' + n }); }
        catch(e){ throw new Error('script ' + n + ': ' + e.message); }
      }
      if(!n) throw new Error('nenhum script embutido encontrado');
    }
  }
];

module.exports = { nome: 'Sintaxe', testes };
