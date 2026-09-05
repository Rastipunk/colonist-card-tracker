(function () {
  'use strict';

  var PRIVACY_URL = 'https://github.com/Rastipunk/colonist-card-tracker/blob/main/PRIVACY.md';

  var STRINGS = {
    es: {
      researchTitle: 'Datos para investigación',
      researchText: 'La extensión guarda la historia de cada partida que juegas en colonist.io (jugadas, intercambios, dados y chat) y la envía al servidor del proyecto al terminar. Antes de salir de tu navegador, todos los nombres de usuario e identificadores (los tuyos y los de los demás jugadores) se sustituyen por códigos generados con una clave aleatoria que solo existe en tu instalación; avatares, correos y tokens se eliminan. Toda la información es anónima y se recoge exclusivamente con fines de investigación sobre la toma de decisiones y la negociación en el juego. Para usar el contador es necesario aceptar.',
      consentYes: 'Acepto: grabar y enviar mis partidas anonimizadas',
      consentNo: 'No acepto (el contador queda desactivado)',
      installId: 'Identificador de instalación:',
      installIdNote: '(aleatorio, no está ligado a tu cuenta)',
      privacy: 'Política de privacidad',
      serverTitle: 'Servidor',
      endpoint: 'URL de ingesta',
      token: 'Token (opcional)',
      save: 'Guardar',
      saved: 'Guardado',
      keepLocal: 'Conservar una copia local de cada partida subida',
      gamesTitle: 'Partidas grabadas',
      retry: 'Reintentar subidas pendientes',
      refresh: 'Actualizar',
      deleteAll: 'Borrar todo lo local',
      deleteAllConfirm: '¿Borrar todas las partidas guardadas localmente? Las ya subidas no se borran del servidor.',
      colDate: 'Fecha', colGame: 'Partida', colPlayers: 'Jugadores', colFrames: 'Tramas', colSize: 'Tamaño', colStatus: 'Estado',
      empty: 'Todavía no hay partidas grabadas.',
      partial: 'parcial',
      exportBtn: 'Exportar',
      deleteBtn: 'Borrar',
      status: { recording: 'grabando', finalizing: 'procesando', pending: 'pendiente de subir', uploaded: 'subida', failed: 'fallida', local: 'solo local (sin servidor)' }
    },
    en: {
      researchTitle: 'Research data',
      researchText: 'The extension stores the history of each game you play on colonist.io (moves, trades, dice and chat) and uploads it to the project server when the game ends. Before anything leaves your browser, every username and identifier (yours and the other players\') is replaced by a code generated with a random key that only exists in your installation; avatars, e-mails and tokens are removed. All information is anonymous and collected exclusively for research on decision-making and negotiation in the game. Accepting is required to use the counter.',
      consentYes: 'I accept: record and upload my anonymised games',
      consentNo: 'I do not accept (the counter stays disabled)',
      installId: 'Installation id:',
      installIdNote: '(random, not linked to your account)',
      privacy: 'Privacy policy',
      serverTitle: 'Server',
      endpoint: 'Ingest URL',
      token: 'Token (optional)',
      save: 'Save',
      saved: 'Saved',
      keepLocal: 'Keep a local copy of every uploaded game',
      gamesTitle: 'Recorded games',
      retry: 'Retry pending uploads',
      refresh: 'Refresh',
      deleteAll: 'Delete all local data',
      deleteAllConfirm: 'Delete all locally stored games? Games already uploaded are not removed from the server.',
      colDate: 'Date', colGame: 'Game', colPlayers: 'Players', colFrames: 'Frames', colSize: 'Size', colStatus: 'Status',
      empty: 'No recorded games yet.',
      partial: 'partial',
      exportBtn: 'Export',
      deleteBtn: 'Delete',
      status: { recording: 'recording', finalizing: 'processing', pending: 'pending upload', uploaded: 'uploaded', failed: 'failed', local: 'local only (no server)' }
    }
  };
  var lang = (navigator.language || 'en').toLowerCase().indexOf('es') === 0 ? 'es' : 'en';
  var T = STRINGS[lang];
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    var key = el.getAttribute('data-i18n');
    if (T[key]) el.textContent = T[key];
  });

  function rt(msg) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage(msg, function (res) {
        if (chrome.runtime.lastError) { resolve({ ok: false, error: chrome.runtime.lastError.message }); return; }
        resolve(res || {});
      });
    });
  }

  function $(id) { return document.getElementById(id); }

  function fmtBytes(n) {
    if (!n) return '–';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  function fmtDate(t) {
    if (!t) return '–';
    var d = new Date(t);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0, 5);
  }

  function render(stats) {
    if (!stats || !stats.settings) return;
    $('version').textContent = 'v' + stats.version;
    $('installId').textContent = stats.settings.installId;
    document.querySelectorAll('input[name="consent"]').forEach(function (r) { r.checked = r.value === stats.settings.consent; });
    $('endpoint').value = stats.settings.endpoint || '';
    $('keepLocal').checked = !!stats.settings.keepLocal;
    $('privacyLink').href = PRIVACY_URL;

    var tbody = $('sessions').querySelector('tbody');
    tbody.innerHTML = '';
    $('empty').hidden = stats.sessions.length > 0;
    stats.sessions.forEach(function (s) {
      var tr = document.createElement('tr');
      var err = s.lastError ? ' title="' + String(s.lastError).replace(/"/g, '&quot;') + '"' : '';
      tr.innerHTML =
        '<td>' + fmtDate(s.startedAt) + '</td>' +
        '<td><code>' + (s.gameId || '?') + '</code>' + (s.partial ? ' <small>(' + T.partial + ')</small>' : '') + '</td>' +
        '<td>' + (s.players || '–') + '</td>' +
        '<td>' + s.frames + '</td>' +
        '<td>' + fmtBytes(s.blobBytes || s.rawBytes) + '</td>' +
        '<td class="status-' + s.status + '"' + err + '>' + (T.status[s.status] || s.status) + (s.attempts > 1 ? ' (' + s.attempts + ')' : '') + '</td>' +
        '<td>' + (s.hasBlob ? '<button class="small" data-export="' + s.key + '">' + T.exportBtn + '</button>' : '') +
          '<button class="small danger" data-delete="' + s.key + '">' + T.deleteBtn + '</button></td>';
      tbody.appendChild(tr);
    });
  }

  function refresh() { return rt({ type: 'stats.get' }).then(render); }

  document.querySelectorAll('input[name="consent"]').forEach(function (r) {
    r.addEventListener('change', function () {
      rt({ type: 'settings.set', patch: { consent: r.value, consentAt: Date.now() } }).then(refresh);
    });
  });

  $('save').addEventListener('click', function () {
    var patch = { endpoint: $('endpoint').value.trim().replace(/\/+$/, ''), keepLocal: $('keepLocal').checked };
    var token = $('token').value.trim();
    if (token) patch.token = token;
    rt({ type: 'settings.set', patch: patch }).then(function () {
      $('token').value = '';
      var ok = document.createElement('span');
      ok.id = 'saved';
      ok.textContent = T.saved;
      $('save').after(ok);
      setTimeout(function () { ok.remove(); }, 2000);
      return refresh();
    });
  });
  $('keepLocal').addEventListener('change', function () {
    rt({ type: 'settings.set', patch: { keepLocal: $('keepLocal').checked } });
  });

  $('retry').addEventListener('click', function () { rt({ type: 'upload.retry' }).then(render); });
  $('refresh').addEventListener('click', refresh);
  $('deleteAll').addEventListener('click', function () {
    if (!confirm(T.deleteAllConfirm)) return;
    rt({ type: 'session.deleteAll' }).then(render);
  });

  $('sessions').addEventListener('click', function (ev) {
    var btn = ev.target.closest('button');
    if (!btn) return;
    if (btn.dataset.export) {
      rt({ type: 'session.export', key: btn.dataset.export }).then(function (res) {
        if (!res.ok) return;
        var bin = atob(res.b64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/gzip' }));
        a.download = res.name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      });
    } else if (btn.dataset.delete) {
      rt({ type: 'session.delete', key: btn.dataset.delete }).then(render);
    }
  });

  refresh();
  setInterval(refresh, 10000);
})();
