/*
 * Meu Painel — interface. ES5 puro, sem frameworks (carrega instantâneo na TV).
 *
 * A página do módulo TizenBrew não tem acesso à API `tizen`; quem abre apps e
 * troca de canal é o serviço (service/service.js), em http://127.0.0.1:8090.
 * Fora da TV (navegador do PC) tudo funciona em modo simulação.
 */
(function () {
  'use strict';

  var SERVICO = 'http://127.0.0.1:8090';
  var NA_TV = /Tizen|SMART-TV/i.test(navigator.userAgent);
  var KEY = { ESQ: 37, CIMA: 38, DIR: 39, BAIXO: 40, OK: 13, VOLTAR: 10009 };

  var linhas = [[], []];      // [cards de apps, cards de canais]
  var pos = { l: 0, c: 0 };
  var instalados = [];        // apps da TV: { id, name, icon }

  /* ---------- Serviço ---------- */

  function chamar(caminho, corpo) {
    if (!NA_TV) {
      console.log('[simulação]', caminho, corpo || '');
      return Promise.resolve({ ok: true, apps: [] });
    }
    var opcoes = corpo === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },   // evita preflight CORS
      body: JSON.stringify(corpo)
    };
    return fetch(SERVICO + caminho, opcoes).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.erro || ('HTTP ' + r.status));
        return j;
      });
    });
  }

  // O serviço sobe junto com o módulo; tenta por alguns segundos.
  function esperarServico(tentativas) {
    return chamar('/api/ping').catch(function (e) {
      if (tentativas <= 0) throw e;
      return new Promise(function (ok) { setTimeout(ok, 500); })
        .then(function () { return esperarServico(tentativas - 1); });
    });
  }

  /* ---------- Apps instalados (ícones e IDs reais) ---------- */

  function lerCache() {
    try { return JSON.parse(localStorage.getItem('painel-apps') || '[]'); } catch (e) { return []; }
  }
  function salvarCache(lista) {
    try { localStorage.setItem('painel-apps', JSON.stringify(lista)); } catch (e) { /* sem storage */ }
  }

  function acharInstalado(app) {
    var i, busca = app.busca.toLowerCase();
    for (i = 0; i < app.ids.length; i++) {
      for (var j = 0; j < instalados.length; j++) if (instalados[j].id === app.ids[i]) return instalados[j];
    }
    for (i = 0; i < instalados.length; i++) {
      if ((instalados[i].name || '').toLowerCase().indexOf(busca) !== -1) return instalados[i];
    }
    return null;
  }

  function urlIcone(caminho) {
    if (!caminho) return '';
    return caminho.charAt(0) === '/' ? SERVICO + '/api/icone?path=' + encodeURIComponent(caminho) : caminho;
  }

  /* ---------- Montagem ---------- */

  function el(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function montarApps() {
    var box = document.getElementById('apps');
    box.innerHTML = '';
    linhas[0] = CONFIG.apps.map(function (app) {
      var card = el('div', 'card');
      var achado = acharInstalado(app);
      if (achado && achado.icon) {
        var img = el('img');
        img.src = urlIcone(achado.icon);
        img.onerror = function () { img.parentNode && img.parentNode.removeChild(img); };
        card.appendChild(img);
      }
      card.appendChild(el('div', 'nome', app.nome));
      card.acao = function () { abrirApp(app, card); };
      box.appendChild(card);
      return card;
    });
  }

  function montarCanais() {
    var box = document.getElementById('canais');
    box.innerHTML = '';
    linhas[1] = CONFIG.canais.map(function (canal) {
      var card = el('div', 'card');
      card.appendChild(el('div', 'numero', canal.numero));
      card.appendChild(el('div', 'nome', canal.nome));
      card.acao = function () { abrirCanal(canal, card); };
      box.appendChild(card);
      return card;
    });
  }

  /* ---------- Ações ---------- */

  function status(msg) {
    document.getElementById('status').textContent = msg || '';
  }

  function ocupado(card, promessa, msgErro) {
    card.className = 'card foco abrindo';
    return promessa.then(function () {
      status('');
    }, function (e) {
      status(msgErro + (e && e.message ? ' (' + e.message + ')' : ''));
    }).then(function () {
      setTimeout(function () { card.className = card === atual() ? 'card foco' : 'card'; }, 800);
    });
  }

  function abrirApp(app, card) {
    var achado = acharInstalado(app);
    var ids = app.ids.slice();
    if (achado && ids.indexOf(achado.id) === -1) ids.unshift(achado.id);
    status('Abrindo ' + app.nome + '…');
    ocupado(card, chamar('/api/abrir', { ids: ids, busca: app.busca }), 'Não consegui abrir ' + app.nome);
  }

  function abrirCanal(canal, card) {
    status('Sintonizando ' + canal.nome + ' (' + canal.numero + ')…');
    ocupado(card, chamar('/api/canal', { numero: canal.numero }), 'Não consegui trocar o canal');
  }

  /* ---------- Navegação pelo controle ---------- */

  function atual() { return linhas[pos.l][pos.c]; }

  function focar(l, c) {
    if (!linhas[l] || !linhas[l].length) return;
    var antigo = atual();
    if (antigo) antigo.className = 'card';
    pos.l = l;
    pos.c = Math.max(0, Math.min(c, linhas[l].length - 1));
    atual().className = 'card foco';
    try { localStorage.setItem('painel-foco', pos.l + ',' + pos.c); } catch (e) { /* ok */ }
  }

  // Apps e canais ficam na mesma barra: ◀ ▶ passam de um grupo para o outro.
  function mover(delta) {
    var c = pos.c + delta;
    if (c < 0 && pos.l === 1) return focar(0, linhas[0].length - 1);
    if (c >= linhas[pos.l].length && pos.l === 0) return focar(1, 0);
    focar(pos.l, c);
  }

  document.addEventListener('keydown', function (ev) {
    switch (ev.keyCode) {
      case KEY.ESQ:   mover(-1); break;
      case KEY.DIR:   mover(1); break;
      case KEY.CIMA:
      case KEY.BAIXO: focar(pos.l === 0 ? 1 : 0, 0); break;   // pula entre Apps e TV aberta
      case KEY.OK:    if (atual()) atual().acao(); break;
      case KEY.VOLTAR: break;   // é a tela inicial: Voltar não faz nada
      default: return;
    }
    ev.preventDefault();
  });

  /* ---------- Relógio ---------- */

  function relogio() {
    var d = new Date();
    var h = d.getHours();
    document.getElementById('hora').textContent =
      ('0' + h).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    var parte = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    document.getElementById('saudacao').textContent = parte + ', ' + CONFIG.nome;
    var data = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    document.getElementById('data').textContent = data.charAt(0).toUpperCase() + data.slice(1);
  }

  /* ---------- Previsão do tempo (Open-Meteo) ---------- */

  var TEMPO_VALIDADE = 30 * 60 * 1000;

  // Ícones em SVG de traço (leves, sem depender de emoji na fonte da TV).
  var NEON = '#39ff14';
  function svg(corpo) {
    return '<svg viewBox="0 0 64 64" fill="none" stroke="' + NEON + '" stroke-width="3.5" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + corpo + '</svg>';
  }
  var NUVEM = '<path d="M20 46h26a10 10 0 0 0 0-20 14 14 0 0 0-27-2A11 11 0 0 0 20 46z"/>';
  var ICONES = {
    sol: svg('<circle cx="32" cy="32" r="11"/><path d="M32 8v6M32 50v6M8 32h6M50 32h6M15 15l4 4M45 45l4 4M15 49l4-4M45 19l4-4"/>'),
    lua: svg('<path d="M42 44A18 18 0 0 1 26 14a18 18 0 1 0 22 26 18 18 0 0 1-6 4z"/>'),
    solNuvem: svg('<circle cx="22" cy="22" r="8"/><path d="M22 6v4M6 22h4M11 11l3 3M33 11l-3 3"/>' +
      '<path d="M24 52h24a9 9 0 0 0 0-18 12 12 0 0 0-23-1A9.5 9.5 0 0 0 24 52z"/>'),
    nuvem: svg(NUVEM),
    chuva: svg('<path d="M20 38h26a10 10 0 0 0 0-20 14 14 0 0 0-27-2A11 11 0 0 0 20 38z"/><path d="M22 46l-3 8M33 46l-3 8M44 46l-3 8"/>'),
    raio: svg('<path d="M20 36h26a10 10 0 0 0 0-20 14 14 0 0 0-27-2A11 11 0 0 0 20 36z"/><path d="M34 38l-7 11h9l-6 11"/>'),
    nevoa: svg('<path d="M12 24h40M8 34h48M14 44h36"/>')
  };

  // Códigos WMO -> [descrição, ícone]
  function condicao(codigo, dia) {
    if (codigo === 0) return ['Céu limpo', dia ? 'sol' : 'lua'];
    if (codigo === 1) return ['Poucas nuvens', dia ? 'solNuvem' : 'nuvem'];
    if (codigo === 2) return ['Parcialmente nublado', dia ? 'solNuvem' : 'nuvem'];
    if (codigo === 3) return ['Nublado', 'nuvem'];
    if (codigo === 45 || codigo === 48) return ['Neblina', 'nevoa'];
    if (codigo >= 51 && codigo <= 57) return ['Garoa', 'chuva'];
    if (codigo >= 61 && codigo <= 67) return ['Chuva', 'chuva'];
    if (codigo >= 80 && codigo <= 82) return ['Pancadas de chuva', 'chuva'];
    if (codigo >= 95) return ['Trovoadas', 'raio'];
    return ['Nublado', 'nuvem'];
  }

  function urlTempo() {
    var t = CONFIG.tempo;
    return 'https://api.open-meteo.com/v1/forecast?latitude=' + t.latitude + '&longitude=' + t.longitude +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&timezone=' + encodeURIComponent(t.fuso) + '&forecast_days=4';
  }

  function r(n) { return Math.round(n) + '°'; }

  function desenharTempo(d) {
    var box = document.getElementById('tempo');
    if (!d || !d.current || !d.daily) return;
    var c = d.current, dd = d.daily;
    var cond = condicao(c.weather_code, c.is_day === 1);
    var chuva = dd.precipitation_probability_max && dd.precipitation_probability_max[0];
    var html =
      '<div class="agora">' +
        '<div class="icone">' + ICONES[cond[1]] + '</div>' +
        '<div class="temp">' + r(c.temperature_2m) + '</div>' +
        '<div class="info"><b>' + cond[0] + '</b>' +
          'Máx ' + r(dd.temperature_2m_max[0]) + ' · Mín ' + r(dd.temperature_2m_min[0]) +
          (chuva !== undefined && chuva !== null ? ' · Chuva ' + chuva + '%' : '') + '<br>' +
          CONFIG.tempo.cidade + '</div>' +
      '</div><div class="dias">';
    for (var i = 1; i < dd.time.length && i <= 3; i++) {
      var p = dd.time[i].split('-');
      var nome = new Date(+p[0], +p[1] - 1, +p[2])
        .toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      html += '<div class="dia">' + nome.charAt(0).toUpperCase() + nome.slice(1) +
        ICONES[condicao(dd.weather_code[i], true)[1]] +
        '<span class="mx">' + r(dd.temperature_2m_max[i]) + '</span> ' + r(dd.temperature_2m_min[i]) + '</div>';
    }
    box.innerHTML = html + '</div>';
    box.className = '';
  }

  function atualizarTempo() {
    var cache = null;
    try { cache = JSON.parse(localStorage.getItem('painel-tempo') || 'null'); } catch (e) { /* ok */ }
    if (cache) desenharTempo(cache.dados);
    if (cache && Date.now() - cache.em < TEMPO_VALIDADE) return;
    fetch(urlTempo()).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (dados) {
      desenharTempo(dados);
      try { localStorage.setItem('painel-tempo', JSON.stringify({ em: Date.now(), dados: dados })); } catch (e) { /* ok */ }
    }).catch(function () { /* sem internet: fica o último dado salvo */ });
  }

  /* ---------- Fundo em loop ---------- */

  function iniciarFundos() {
    var lista = CONFIG.fundos || [];
    if (!lista.length) return;
    var box = document.getElementById('fundos');
    var camadas = lista.map(function (src) {
      var d = el('div', 'fundo');
      d.style.backgroundImage = 'url("' + src + '")';
      box.appendChild(d);
      return d;
    });
    var i = 0;
    camadas[0].className = 'fundo ativo';
    if (camadas.length < 2) return;
    setInterval(function () {
      camadas[i].className = 'fundo';
      i = (i + 1) % camadas.length;
      camadas[i].className = 'fundo ativo';
    }, (CONFIG.intervaloFundo || 12) * 1000);
  }

  /* ---------- Início ---------- */

  iniciarFundos();

  instalados = lerCache();
  montarApps();
  montarCanais();
  var salvo = '0,0';
  try { salvo = localStorage.getItem('painel-foco') || salvo; } catch (e) { /* ok */ }
  focar(+salvo.split(',')[0] || 0, +salvo.split(',')[1] || 0);
  relogio();
  setInterval(relogio, 15000);
  if (CONFIG.tempo) {
    atualizarTempo();
    setInterval(atualizarTempo, 5 * 60 * 1000);   // checa a cada 5 min, baixa a cada 30
  }

  if (NA_TV) {
    esperarServico(20).then(function () {
      return chamar('/api/apps');
    }).then(function (r) {
      if (r.apps && r.apps.length) {
        instalados = r.apps;
        salvarCache(r.apps);
        var l = pos.l, c = pos.c;
        montarApps();
        focar(l, c);
      }
    }).catch(function () {
      status('Serviço do painel não respondeu — abra pelo TizenBrew novamente');
    });
  }
})();
