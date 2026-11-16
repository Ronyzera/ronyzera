// Travas de CSS do cartão da sala: o botão "ver tela" já quebrou de linha (ficava enorme)
// e pulava para a direita no hover porque o button:hover global troca o transform.
const fs = require('fs');
const path = require('path');

function css(){
  return fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
}
// pega o bloco de declarações de um seletor (o primeiro que casar)
function bloco(texto, seletor){
  const alvo = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(?:^|[},])\\s*' + alvo + '\\s*(?:,[^{}]*)?\\{([^}]*)\\}', 'm');
  const m = re.exec(texto);
  if(!m) throw new Error('regra ' + seletor + ' não encontrada no index.html');
  return m[1].replace(/\s+/g, ' ');
}

const testes = [
  {
    nome: 'botão "ver tela" da carta fica em uma linha só e compacto',
    async fn(){
      const regra = bloco(css(), '.pcWatch');
      if(!/white-space\s*:\s*nowrap/i.test(regra)) throw new Error('falta white-space:nowrap (o texto quebra em várias linhas)');
      const fonte = /font-size\s*:\s*([\d.]+)rem/i.exec(regra);
      if(!fonte) throw new Error('falta font-size');
      if(parseFloat(fonte[1]) > 0.66) throw new Error('fonte grande demais para a carta: ' + fonte[1] + 'rem');
      const pad = /padding\s*:\s*([\d.]+)px\s+([\d.]+)px/i.exec(regra);
      if(!pad) throw new Error('falta padding');
      if(parseFloat(pad[1]) > 4) throw new Error('padding vertical grande demais: ' + pad[1] + 'px');
      if(!/max-width\s*:\s*calc\(100%/.test(regra)) throw new Error('falta max-width relativo à carta');
    }
  },
  {
    nome: 'botão "ver tela" não desliza para a direita no hover',
    async fn(){
      const regra = bloco(css(), '.pcWatch:hover');
      if(!/transform\s*:\s*translateX\(-50%\)/.test(regra)) throw new Error('hover sem translateX(-50%): o botão pula para a direita (button:hover global sobrescreve o transform)');
      const ativo = bloco(css(), '.pcWatch:active');
      if(!/transform\s*:\s*translateX\(-50%\)/.test(ativo)) throw new Error(':active sem translateX(-50%)');
      // o base precisa continuar centralizado
      if(!/transform\s*:\s*translateX\(-50%\)/.test(bloco(css(), '.pcWatch'))) throw new Error('regra base sem translateX(-50%)');
    }
  },
  {
    nome: 'no mobile a carta usa um "ver tela" ainda menor',
    async fn(){
      const regra = bloco(css(), '.pcard .pcWatch');
      const fonte = /font-size\s*:\s*([\d.]+)rem/i.exec(regra);
      if(!fonte || parseFloat(fonte[1]) > 0.6) throw new Error('fonte mobile grande demais');
    }
  },
  {
    nome: 'foto do rank de horas é recortada no círculo',
    async fn(){
      const html = css();
      const img = bloco(html, '#dxRank .rr .rkAv img');
      if(!/width\s*:\s*100%/.test(img) || !/height\s*:\s*100%/.test(img)) throw new Error('a foto não ocupa o círculo');
      if(!/object-fit\s*:\s*cover/.test(img)) throw new Error('falta object-fit:cover (a foto aparece só num canto)');
      const caixa = bloco(html, '#dxRank .rr .rkAv');
      if(!/overflow\s*:\s*hidden/.test(caixa)) throw new Error('círculo sem overflow:hidden');
      if(!/border-radius\s*:\s*50%/.test(caixa)) throw new Error('círculo sem border-radius:50%');
      if(!/display\s*:\s*flex/.test(caixa) || !/align-items\s*:\s*center/.test(caixa)) throw new Error('letra/nome inicial não fica centralizada');
    }
  }
];

module.exports = { nome: 'Estilo das cartas', testes };
