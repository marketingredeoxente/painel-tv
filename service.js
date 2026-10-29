/*
 * Meu Painel — serviço em segundo plano.
 *
 * O TizenBrew roda este arquivo em Node.js dentro da TV, num sandbox que tem
 * a API `tizen` (a página do painel não tem). Só módulos nativos do Node.
 * ES5 para funcionar em qualquer versão de Node que a TV traga.
 *
 * Ouve em 127.0.0.1:8090 (só a própria TV acessa):
 *   GET  /api/ping
 *   GET  /api/apps               apps instalados { id, name, icon }
 *   GET  /api/icone?path=        ícone de um app (arquivo do sistema da TV)
 *   POST /api/abrir  { ids, busca }   abre um app
 *   POST /api/canal  { numero }       vai para a TV ao vivo e digita o canal
 *
 * Troca de canal: usa a API de controle remoto da própria TV (wss://:8002).
 * Na primeira vez a TV pergunta se permite "Meu Painel" — escolha Permitir.
 * Cliente WebSocket mínimo inspirado no projeto TVDeck (MIT).
 */
(function () {
  'use strict';

  var http = require('http');
  var tls = require('tls');
  var crypto = require('crypto');
  var url = require('url');
  var fs = require('fs');
  var path = require('path');

  var PORTA = 8090;
  var TEM_TIZEN = typeof tizen !== 'undefined' && !!tizen.application;
  var TV = (typeof process !== 'undefined' && process.env && process.env.TV_HOST) || '127.0.0.1';
  var PASTA = fs.existsSync('/home/owner/share') ? '/home/owner/share' : path.resolve('.');
  var ARQ_CONFIG = PASTA + '/painel-tv.json';
  var ARQ_APPS = PASTA + '/painel-tv-apps.json';
  var TIPOS_ICONE = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

  function buf(d, enc) { return Buffer.from ? Buffer.from(d, enc) : new Buffer(d, enc); }
  function bufZero(n) { return Buffer.alloc ? Buffer.alloc(n) : new Buffer(n).fill(0); }

  var config = { token: '' };
  try { config = JSON.parse(fs.readFileSync(ARQ_CONFIG, 'utf8')); } catch (e) { /* 1ª vez */ }
  function salvarConfig() {
    try { fs.writeFileSync(ARQ_CONFIG, JSON.stringify(config)); } catch (e) { /* ok */ }
  }

  /* ---------- Apps ---------- */

  var cacheApps = null;
  try { cacheApps = JSON.parse(fs.readFileSync(ARQ_APPS, 'utf8')); } catch (e) { /* 1ª vez */ }
  var buscando = null;

  // getAppsInfo demora alguns segundos (a TV lista ~370 componentes),
  // então responde do cache e atualiza por trás.
  function atualizarApps() {
    if (buscando) return buscando;
    buscando = new Promise(function (ok, falha) {
      if (!TEM_TIZEN) return falha(new Error('API tizen indisponível'));
      tizen.application.getAppsInfo(function (lista) {
        var apps = lista.filter(function (a) { return a.name; }).map(function (a) {
          return { id: a.id, name: a.name, icon: a.iconPath || '' };
        });
        cacheApps = apps;
        try { fs.writeFileSync(ARQ_APPS, JSON.stringify(apps)); } catch (e) { /* ok */ }
        ok(apps);
      }, falha);
    });
    buscando.then(function () { buscando = null; }, function () { buscando = null; });
    return buscando;
  }

  function listarApps() {
    if (cacheApps) { atualizarApps().catch(function () {}); return Promise.resolve(cacheApps); }
    return atualizarApps();
  }

  function lancar(id) {
    return new Promise(function (ok, falha) {
      if (!TEM_TIZEN) return falha(new Error('API tizen indisponível'));
      tizen.application.launch(id, ok, falha);
    });
  }

  // Tenta os IDs conhecidos; se nenhum abrir, procura pelo nome.
  function abrirApp(ids, busca) {
    ids = (ids || []).slice();
    function proximo() {
      if (!ids.length) return porNome();
      return lancar(String(ids.shift())).catch(proximo);
    }
    function porNome() {
      if (!busca) return Promise.reject(new Error('app não encontrado'));
      return listarApps().then(function (apps) {
        var b = String(busca).toLowerCase();
        var achados = apps.filter(function (a) { return a.name.toLowerCase().indexOf(b) !== -1; });
        if (!achados.length) throw new Error('app não instalado');
        var i = 0;
        function tenta() {
          if (i >= achados.length) return Promise.reject(new Error('app não abriu'));
          return lancar(achados[i++].id).catch(tenta);
        }
        return tenta();
      });
    }
    return proximo();
  }

  /* ---------- Controle remoto virtual (wss://127.0.0.1:8002) ---------- */

  function conectarWs(endereco, h) {
    var p = url.parse(endereco);
    var chave = crypto.randomBytes(16).toString('base64');
    var acumulado = bufZero(0);
    var aberto = false;
    var sock = tls.connect({ host: p.hostname, port: +p.port, rejectUnauthorized: false }, function () {
      sock.write('GET ' + p.path + ' HTTP/1.1\r\nHost: ' + p.host + '\r\n' +
        'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
        'Sec-WebSocket-Key: ' + chave + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
    });

    function enviarFrame(dados, opcode) {
      var n = dados.length, cab;
      if (n < 126) { cab = bufZero(2); cab[1] = 0x80 | n; }
      else if (n < 65536) { cab = bufZero(4); cab[1] = 0x80 | 126; cab.writeUInt16BE(n, 2); }
      else { cab = bufZero(10); cab[1] = 0x80 | 127; cab.writeUInt32BE(n, 6); }
      cab[0] = 0x80 | opcode;
      var mascara = crypto.randomBytes(4);
      var corpo = bufZero(n);
      for (var i = 0; i < n; i++) corpo[i] = dados[i] ^ mascara[i % 4];
      sock.write(Buffer.concat([cab, mascara, corpo]));
    }

    function lerFrames() {
      while (acumulado.length >= 2) {
        var n = acumulado[1] & 127, ini = 2;
        if (n === 126) { if (acumulado.length < 4) return; n = acumulado.readUInt16BE(2); ini = 4; }
        else if (n === 127) { if (acumulado.length < 10) return; n = acumulado.readUInt32BE(6); ini = 10; }
        if (acumulado[1] & 128) ini += 4;
        if (acumulado.length < ini + n) return;
        var op = acumulado[0] & 15;
        var dados = acumulado.slice(ini, ini + n);
        acumulado = acumulado.slice(ini + n);
        if (op === 1 && h.mensagem) h.mensagem(dados.toString('utf8'));
        else if (op === 8) sock.end();
        else if (op === 9) enviarFrame(dados, 10);
      }
    }

    sock.on('data', function (pedaco) {
      acumulado = Buffer.concat([acumulado, pedaco]);
      if (!aberto) {
        var fim = acumulado.toString('binary').indexOf('\r\n\r\n');
        if (fim === -1) return;
        if (!/^HTTP\/1\.1 101/.test(acumulado.slice(0, fim).toString())) return sock.destroy();
        aberto = true;
        acumulado = acumulado.slice(fim + 4);
      }
      lerFrames();
    });
    sock.on('close', function () { if (h.fechou) h.fechou(); });
    sock.on('error', function () { /* close vem em seguida */ });

    return {
      enviar: function (txt) { enviarFrame(buf(String(txt), 'utf8'), 1); },
      fechar: function () { sock.end(); }
    };
  }

  var remoto = { ws: null, pronto: false, fila: [], esperando: [] };

  function conectarRemoto() {
    if (remoto.ws) return;
    var nome = buf('Meu Painel').toString('base64');
    var end = 'wss://' + TV + ':8002/api/v2/channels/samsung.remote.control?name=' + nome +
      (config.token ? '&token=' + config.token : '');
    remoto.ws = conectarWs(end, {
      mensagem: function (bruto) {
        var m; try { m = JSON.parse(bruto); } catch (e) { return; }
        if (m.event === 'ms.channel.connect') {
          if (m.data && m.data.token && String(m.data.token) !== config.token) {
            config.token = String(m.data.token);
            salvarConfig();
          }
          remoto.pronto = true;
          remoto.esperando.splice(0).forEach(function (f) { f(); });
        } else if (m.event === 'ms.channel.unauthorized') {
          remoto.ws.fechar();
        }
      },
      fechou: function () { remoto.ws = null; remoto.pronto = false; }
    });
  }

  function remotoPronto() {
    return new Promise(function (ok, falha) {
      if (remoto.pronto) return ok();
      remoto.esperando.push(ok);
      conectarRemoto();
      // 30 s: dá tempo de apertar "Permitir" na primeira vez.
      setTimeout(function () { if (!remoto.pronto) falha(new Error('TV não autorizou o controle')); }, 30000);
    });
  }

  function tecla(k) {
    remoto.ws.enviar(JSON.stringify({
      method: 'ms.remote.control',
      params: { Cmd: 'Click', DataOfCmd: k, Option: 'false', TypeOfRemote: 'SendRemoteKey' }
    }));
  }

  // Envia uma sequência [tecla, espera_ms, tecla, ...]
  function sequencia(passos) {
    return remotoPronto().then(function () {
      return new Promise(function (ok) {
        var i = 0;
        (function prox() {
          if (i >= passos.length) return ok();
          var p = passos[i++];
          if (typeof p === 'number') return setTimeout(prox, p);
          tecla(p);
          setTimeout(prox, 250);
        })();
      });
    });
  }

  function irParaCanal(numero) {
    var n = String(numero || '').trim();
    if (!/^\d{1,3}([.\-]\d{1,2})?$/.test(n)) return Promise.reject(new Error('número de canal inválido'));
    var passos = ['KEY_TV', 2500];   // garante a fonte TV antes de digitar
    n.split('').forEach(function (ch) {
      passos.push(ch === '.' || ch === '-' ? 'KEY_PLUS100' : 'KEY_' + ch);
    });
    passos.push('KEY_ENTER');
    return sequencia(passos);
  }

  /* ---------- Servidor HTTP ---------- */

  function responder(res, codigo, corpo) {
    res.writeHead(codigo, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
  }

  function lerCorpo(req) {
    return new Promise(function (ok, falha) {
      var dados = '';
      req.on('data', function (c) { dados += c; if (dados.length > 16384) req.destroy(); });
      req.on('end', function () { try { ok(JSON.parse(dados || '{}')); } catch (e) { falha(e); } });
      req.on('error', falha);
    });
  }

  function servirIcone(res, caminho) {
    var p = path.normalize(caminho || '');
    var tipo = TIPOS_ICONE[path.extname(p).toLowerCase()];
    var permitido = p.indexOf('/opt/') === 0 || p.indexOf('/usr/') === 0;
    if (!tipo || !permitido) return responder(res, 400, { erro: 'ícone inválido' });
    fs.readFile(p, function (err, dados) {
      if (err) return responder(res, 404, { erro: 'ícone não encontrado' });
      res.writeHead(200, { 'Content-Type': tipo, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=604800' });
      res.end(dados);
    });
  }

  function erro(res) { return function (e) { responder(res, 502, { erro: (e && e.message) || String(e) }); }; }

  var servidor = http.createServer(function (req, res) {
    var u = url.parse(req.url, true);
    var rota = req.method + ' ' + u.pathname;
    if (req.method === 'OPTIONS') return responder(res, 204, '');
    if (rota === 'GET /api/ping') return responder(res, 200, { ok: true, tizen: TEM_TIZEN });
    if (rota === 'GET /api/apps') return listarApps().then(function (a) { responder(res, 200, { apps: a }); }, erro(res));
    if (rota === 'GET /api/icone') return servirIcone(res, u.query.path);
    if (rota === 'POST /api/abrir') {
      return lerCorpo(req).then(function (b) { return abrirApp(b.ids, b.busca); })
        .then(function () { responder(res, 200, { ok: true }); }, erro(res));
    }
    if (rota === 'POST /api/canal') {
      return lerCorpo(req).then(function (b) { return irParaCanal(b.numero); })
        .then(function () { responder(res, 200, { ok: true }); }, erro(res));
    }
    responder(res, 404, { erro: 'rota não existe' });
  });

  servidor.on('error', function (e) { console.log('[painel] servidor: ' + e.message); });
  servidor.listen(PORTA, '127.0.0.1', function () { console.log('[painel] serviço na porta ' + PORTA); });

  if (TEM_TIZEN) listarApps().catch(function () {});
})();
