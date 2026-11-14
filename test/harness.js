// Carrega o index.html dentro de um jsdom com os aparelhos simulados.
// Cada teste cria a sua própria instância para não vazar estado entre casos.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const RAIZ = path.join(__dirname, '..');
let CACHE = null;
function html(){
  if(!CACHE) CACHE = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  return CACHE;
}

async function criarApp(){
  const erros = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const m = String((e && e.message) || e);
    if(!/Not implemented|Could not parse CSS/i.test(m)) erros.push('jsdomError: ' + m);
  });
  vc.on('error', (...a) => {
    const s = a.map(x => (x && x.message) || x).join(' ');
    if(!/Not implemented|Could not parse CSS/i.test(s)) erros.push('console.error: ' + s);
  });

  const dom = new JSDOM(html(), {
    url: 'http://127.0.0.1:8099/?teste=1',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w){
      w.RTCPeerConnection = class {
        constructor(){ this.iceConnectionState = 'new'; this.localDescription = null; }
        createDataChannel(){}
        createOffer(){ return Promise.resolve({ type: 'offer', sdp: '' }); }
        setLocalDescription(){ return Promise.resolve(); }
        close(){}
      };
      w.RTCSessionDescription = class {};
      w.RTCIceCandidate = class {};
      w.Peer = class { constructor(){ this.destroy = () => {}; } };
      w.AudioContext = class {
        constructor(){ this.state = 'running'; this.destination = {}; this.currentTime = 0; }
        createMediaStreamSource(){ return { connect(){}, disconnect(){} }; }
        createGain(){ return { gain: { value: 1 }, connect(){}, disconnect(){} }; }
        createAnalyser(){ return { fftSize: 1024, getFloatTimeDomainData(a){ a.fill(0.02); }, connect(){}, disconnect(){} }; }
        resume(){ return Promise.resolve(); }
        close(){ return Promise.resolve(); }
      };
      Object.defineProperty(w.navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: () => Promise.reject(Object.assign(new Error('sem microfone'), { name: 'NotFoundError' })),
          enumerateDevices: () => Promise.resolve([]),
          addEventListener(){}, removeEventListener(){}
        }
      });
      w.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 16);
      w.cancelAnimationFrame = id => clearTimeout(id);
      // WebCrypto de verdade (PBKDF2 das senhas e ECDSA dos anúncios de servidor)
      Object.defineProperty(w, 'crypto', { configurable: true, value: require('crypto').webcrypto });
      w.URL.createObjectURL = () => 'blob:teste';
      w.URL.revokeObjectURL = () => {};
    }
  });

  const w = dom.window;
  await new Promise(res => {
    if(w.document.readyState === 'complete') res();
    else w.addEventListener('load', res, { once: true });
  });
  await new Promise(r => setTimeout(r, 80));

  const run = async codigo => {
    try{ return await w.eval(codigo); }
    catch(e){ throw new Error('erro no app: ' + ((e && e.message) || e)); }
  };
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  const fechar = () => { try{ w.close(); }catch(e){} };
  return { w, dom, erros, run, esperar, fechar };
}

function ok(cond, msg){
  if(!cond) throw new Error(msg);
}
function iguais(veio, esperado, msg){
  const a = JSON.stringify(veio), b = JSON.stringify(esperado);
  if(a !== b) throw new Error((msg ? msg + ': ' : '') + 'esperado ' + b + ', veio ' + a);
}
function semErros(app){
  const e = app.erros.slice(0, 4);
  if(e.length) throw new Error('erros no console: ' + e.join(' | '));
}

module.exports = { criarApp, ok, iguais, semErros };
