// Contas locais: a senha nunca fica em texto puro e o formato antigo migra no login.
const { criarApp, ok, iguais, semErros } = require('./harness');

const testes = [
  {
    nome: 'senha nova vira hash PBKDF2 (sem texto puro no localStorage)',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          const res = await entrarConta('Ana', 'segredo123', {});
          const bruto = localStorage.getItem(profileKey('Ana'));
          const prof = JSON.parse(bruto);
          return {
            res, bruto, prof,
            certa: await senhaConfere(prof, 'segredo123'),
            errada: await senhaConfere(prof, 'outra'),
            vazia: await senhaConfere(prof, '')
          };
        })()`);
        ok(r.res && r.res.ok, 'não criou a conta');
        ok(r.prof.password === undefined, 'ainda guarda a senha em texto puro');
        ok(r.prof.pw && r.prof.pw.hash && r.prof.pw.salt, 'faltou hash ou sal');
        ok(r.prof.pw.iter >= 100000, 'poucas iterações: ' + r.prof.pw.iter);
        ok(r.prof.pw.hash.length === 44, 'hash deveria ter 256 bits em base64');
        ok(r.bruto.indexOf('segredo123') < 0, 'a senha aparece no localStorage');
        iguais(r.certa, 'ok', 'senha certa');
        iguais(r.errada, 'errada', 'senha errada');
        iguais(r.vazia, 'errada', 'senha vazia');
        // dois cadastros da mesma senha usam sais diferentes
        const r2 = await app.run(`(async () => {
          await entrarConta('Bia', 'segredo123', {});
          return {
            ana: JSON.parse(localStorage.getItem(profileKey('Ana'))).pw.hash,
            bia: JSON.parse(localStorage.getItem(profileKey('Bia'))).pw.hash
          };
        })()`);
        ok(r2.ana !== r2.bia, 'mesma senha gerou o mesmo hash (sal repetido)');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'perfil antigo em texto puro migra para hash no login certo',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          localStorage.setItem(profileKey('Bia'), JSON.stringify({ password:'antiga', photo:null }));
          const errado = await entrarConta('Bia', 'chute', {});
          const depoisErro = JSON.parse(localStorage.getItem(profileKey('Bia')));
          const certo = await entrarConta('Bia', 'antiga', {});
          const depois = JSON.parse(localStorage.getItem(profileKey('Bia')));
          return { errado, depoisErro, certo, depois, confere: await senhaConfere(depois, 'antiga') };
        })()`);
        iguais(r.errado.erro, 'senha', 'senha errada precisa ser recusada');
        iguais(r.depoisErro.password, 'antiga', 'não pode migrar antes de acertar a senha');
        ok(r.certo && r.certo.ok, 'não entrou com a senha antiga certa');
        ok(r.depois.password === undefined, 'continuou com texto puro depois do login');
        ok(r.depois.pw && r.depois.pw.hash, 'não criou o hash na migração');
        iguais(r.confere, 'ok', 'hash migrado não confere');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'conta nova exige senha; login lembrado consegue entrar sem digitar',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => ({
          vazia: await entrarConta('Novo', '', {}),
          criada: await entrarConta('Novo', 'abc12345', {}),
          lembrada: await entrarConta('Novo', '', { pularSenha: true }),
          semPular: await entrarConta('Novo', '', { pularSenha: false }),
          comOutra: await entrarConta('Novo', 'xxx', { pularSenha: true })
        }))()`);
        iguais(r.vazia.erro, 'vazia', 'conta nova não pode nascer sem senha');
        ok(r.criada.ok, 'não criou a conta com senha');
        ok(r.lembrada.ok, 'login lembrado deveria entrar sem senha');
        iguais(r.semPular.erro, 'senha', 'sem o login lembrado a senha é obrigatória');
        iguais(r.comOutra.erro, 'senha', 'senha errada nunca passa');
        semErros(app);
      } finally { app.fechar(); }
    }
  },
  {
    nome: 'senha salva não é preenchida no campo (só o aviso de login lembrado)',
    async fn(){
      const app = await criarApp();
      try{
        const r = await app.run(`(async () => {
          await entrarConta('Ana', 'segredo123', {});
          localStorage.setItem('ntg_remember', 'ana');
          $('nickname').value = 'Ana';
          updateAuthUI();
          return {
            valor: $('password').value,
            tipo: $('password').type,
            dica: $('accountHint').textContent,
            rotulo: $('passwordLabel').textContent
          };
        })()`);
        iguais(r.valor, '', 'o campo de senha não pode vir preenchido');
        iguais(r.tipo, 'password', 'campo precisa ser do tipo password');
        ok(r.dica.indexOf('lembrado') > -1, 'faltou o aviso de login lembrado');
        iguais(r.rotulo, 'Senha', 'conta existente pede "Senha"');
        semErros(app);
      } finally { app.fechar(); }
    }
  }
];

module.exports = { nome: 'Contas e senhas', testes };
