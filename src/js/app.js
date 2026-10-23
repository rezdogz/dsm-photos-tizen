/* DSM Photos - lightweight Synology Photos browser for Samsung Tizen TV.
 * Synology Photos, Shared Space or Personal Space. Plain JS, no dependencies.
 * Talks to the NAS over its local IP. */
(function () {
  'use strict';

  var VERSION = '0';                  // stamped by build.py
  var APP = { title: 'DSM Photos', storeKey: 'dsmphotos.cfg' };

  /* Profiles: each one is its own saved login (user, password, space, options) and its own
   * favourites, so a family can share one TV. Profile 'main' keeps the original storage key,
   * so upgrading from a single-user install loses nothing. */
  var STORE_BASE = APP.storeKey;
  var PROFILES_KEY = '#profiles';
  function profileKey(id) { return id === 'main' ? STORE_BASE : STORE_BASE + '#' + id; }
  function findProfile(id) {
    var i;
    for (i = 0; i < profiles.list.length; i++) { if (profiles.list[i].id === id) { return profiles.list[i]; } }
    return null;
  }
  function loadProfiles() {
    var p = null;
    try { p = JSON.parse(localStorage.getItem(STORE_BASE + '.profiles') || 'null'); } catch (e) { p = null; }
    if (!p || !p.list || !p.list.length) { p = { list: [{ id: 'main', name: '' }], active: 'main' }; }
    var ok = p.list.some(function (x) { return x.id === p.active; });
    if (!ok) { p.active = p.list[0].id; }
    return p;
  }
  var profiles = loadProfiles();
  APP.storeKey = profileKey(profiles.active);
  function saveProfiles() {
    try { localStorage.setItem(STORE_BASE + '.profiles', JSON.stringify(profiles)); } catch (e) { /* ignore */ }
  }

  var K = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    BACK: 10009, ESC: 27, BS: 8,
    RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406,
    PLAY: 415, PAUSE: 19, PLAYPAUSE: 10252, STOP: 413, FF: 417, RW: 412,
    CH_UP: 427, CH_DOWN: 428, P: 80
  };

  var THUMB_ONLY_RE = /\.(heic|heif|tiff?)$/i;   // TV browser can't decode these natively
  var TIMELINE_KEY = '#timeline';
  var FAV_KEY = '#favs';
  var TIMELINE_MAX = 30000;
  var BLOCK_MAX = 300;                // a day with more photos than this is split into parts
  var ROW_W = 1800, ROW_H = 250, ROW_GAP = 6;   // justified timeline rows

  var DEFAULTS = {
    host: '', port: '5000', https: false,
    user: '', pass: '', interval: 5, quality: 'fast', source: 'team',
    favSync: true, favPath: '', startView: 'timeline'
  };

  var OPTS = {
    proto:    { values: [false, true], labels: ['http', 'https'] },
    source:   { values: ['team', 'personal'], labels: ['Shared Space', 'Personal Space'] },
    startview: { values: ['timeline', 'folders'], labels: ['Timeline (all photos)', 'Folders'] },
    interval: { values: [3, 5, 10, 15, 30, 60], labels: ['3 seconds', '5 seconds', '10 seconds', '15 seconds', '30 seconds', '60 seconds'] },
    quality:  { values: ['fast', 'full'], labels: ['Fast (resized by NAS)', 'Full resolution'] },
    favsync:  { values: [true, false], labels: ['On - file on the NAS', 'Off - this TV only'] }
  };

  var ICON_FOLDER = '<svg viewBox="0 0 24 24"><path fill="#5ab0ff" d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>';
  var ICON_ALL = '<svg viewBox="0 0 24 24"><path fill="#7ee787" d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>';
  var ICON_STAR = '<svg viewBox="0 0 24 24"><path fill="#ffd666" d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>';
  var ICON_USER = '<svg viewBox="0 0 24 24"><path fill="#d2a8ff" d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-3.3 0-9 1.7-9 5v2h18v-2c0-3.3-5.7-5-9-5z"/></svg>';
  var ICON_PLUS = '<svg viewBox="0 0 24 24"><path fill="#8b98a5" d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z"/></svg>';
  var ICON_GEAR = '<svg viewBox="0 0 24 24"><path fill="#8b98a5" d="M19.4 13a7.7 7.7 0 0 0 0-2l2.1-1.6a.5.5 0 0 0 .1-.6l-2-3.5a.5.5 0 0 0-.6-.2l-2.5 1a7.3 7.3 0 0 0-1.7-1l-.4-2.6a.5.5 0 0 0-.5-.4h-4a.5.5 0 0 0-.5.4l-.4 2.6a7.3 7.3 0 0 0-1.7 1l-2.5-1a.5.5 0 0 0-.6.2l-2 3.5a.5.5 0 0 0 .1.6L4.6 11a7.7 7.7 0 0 0 0 2l-2.1 1.6a.5.5 0 0 0-.1.6l2 3.5c.1.2.4.3.6.2l2.5-1c.5.4 1.1.7 1.7 1l.4 2.6c0 .2.2.4.5.4h4c.3 0 .5-.2.5-.4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1c.2.1.5 0 .6-.2l2-3.5a.5.5 0 0 0-.1-.6L19.4 13zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>';

  var cfg = loadCfg();
  var sid = null;
  var form = { https: false, source: 'team', startView: 'timeline', interval: 5, quality: 'fast', favSync: true };
  var state = { screen: 'settings', stack: [{ key: '', name: '' }], entries: [], tiles: [], focus: 0, connected: false, reqId: 0, countText: '' };
  var viewer = { list: [], index: 0, playing: false, timer: null, token: 0, pre: null, capTimer: null, toastTimer: null };
  var msgTimer = null;
  var FOOT_DEFAULT = '', FOOT_TIMELINE = 'OK: open &nbsp;&middot;&nbsp; Back: up &nbsp;&middot;&nbsp; Play / Green: slideshow &nbsp;&middot;&nbsp; Ch +/-: jump a month &nbsp;&middot;&nbsp; Yellow: settings &nbsp;&middot;&nbsp; Blue: profiles &nbsp;&middot;&nbsp; Photo: Up = favourite', FOOT_PROFILES = 'OK: switch profile &nbsp;&middot;&nbsp; Red: remove profile &nbsp;&middot;&nbsp; Back: up';

  function $(id) { return document.getElementById(id); }

  /* ---------------------------------------------------------------- config */
  function loadCfg() {
    var c = {}, k, s = {};
    try { s = JSON.parse(localStorage.getItem(APP.storeKey) || '{}') || {}; } catch (e) { s = {}; }
    for (k in DEFAULTS) { c[k] = (s[k] !== undefined) ? s[k] : DEFAULTS[k]; }
    if (c.source !== 'team' && c.source !== 'personal') { c.source = 'team'; }
    if (c.startView !== 'folders') { c.startView = 'timeline'; }
    return c;
  }
  function saveCfg() {
    try { localStorage.setItem(APP.storeKey, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
  }
  /* Favourites live on the TV (localStorage), not on the NAS, so a read-only DSM user is fine.
   * Each entry keeps what is needed to show it again without listing its folder. */
  var favs = loadFavs();
  function loadFavs() {
    try { return JSON.parse(localStorage.getItem(APP.storeKey + '.favs') || '{}') || {}; } catch (e) { return {}; }
  }
  function saveFavs() {
    try { localStorage.setItem(APP.storeKey + '.favs', JSON.stringify(favs)); } catch (e) { /* ignore */ }
  }
  function favPrefix() { return cfg.source + ':'; }
  function favKey(e) { return favPrefix() + e.id; }
  function isFav(e) { return !!favs[favKey(e)]; }
  function toggleFav(e) {
    var k = favKey(e);
    if (favs[k]) { delete favs[k]; }
    else { favs[k] = { name: e.name, id: e.id, ckey: e.ckey, path: e.path, type: e.type }; }
    saveFavs();
    return !!favs[k];
  }
  function listFavs() {
    var pre = favPrefix(), out = [], k, f;
    for (k in favs) {
      if (k.indexOf(pre) !== 0) { continue; }
      f = favs[k];
      out.push({ isdir: false, name: f.name, id: f.id, ckey: f.ckey, path: f.path, type: f.type, key: k });
    }
    return out;
  }
  /* ---- Save favourites as a Synology Photos album (Personal Space only) ----
   * One fixed album that is kept equal to the favourites each time you save it: new stars are added
   * and un-starred photos are removed from the album (never deleted from the library).
   * Shared Space has no album API. */
  var ALBUM_NAME = 'TV Favourites';
  var ALBUM_API = 'SYNO.Foto.Browse.NormalAlbum';
  var albumBusy = false;
  function idJson(ids) {
    return JSON.stringify(ids.map(function (x) { var n = Number(x); return isNaN(n) ? x : n; }));
  }
  function findAlbum(cb) {
    pageList(ALBUM_API, { method: 'list' }, 100, 5000, function (err, l) {
      var i;
      if (err) { return cb(err); }
      for (i = 0; i < l.length; i++) { if (l[i].name === ALBUM_NAME) { return cb(null, l[i].id); } }
      cb(null, null);
    });
  }
  // method: 'add_item' or 'delete_item', in batches of 100 photos
  function changeAlbum(method, albumId, ids, cb) {
    var i = 0;
    (function next() {
      if (i >= ids.length) { return cb(null); }
      var part = ids.slice(i, i + 100);
      i += 100;
      call({ api: ALBUM_API, version: apiVer(ALBUM_API, 1), method: method, id: albumId, item: idJson(part) },
        function (err) { if (err) { return cb(err); } next(); });
    })();
  }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function saveFavsAlbum() {
    var ids, albumId;
    if (albumBusy) { return; }
    if (cfg.source !== 'personal') {
      showMsg('Albums can only be made in Personal Space. Switch Photos space in Settings.', 5000);
      return;
    }
    ids = listFavs().map(function (f) { return f.id; });
    if (!ids.length) { showMsg('No favourites to save yet.', 3000); return; }
    albumBusy = true;
    function fail(err) {
      albumBusy = false;
      showMsg('Could not save album: ' + (err.code === 105
        ? 'no permission. The DSM user needs to be allowed to create albums in Synology Photos.' : errText(err)), 9000);
    }
    // Make the album match the favourites: add the new ones, remove the ones no longer starred.
    function finish(existing, known) {
      var have = {}, want = {}, fresh, gone;
      existing.forEach(function (it) { have[String(it.id)] = true; });
      ids.forEach(function (id) { want[String(id)] = true; });
      fresh = ids.filter(function (id) { return !have[String(id)]; });
      gone = known ? existing.map(function (it) { return it.id; }).filter(function (id) { return !want[String(id)]; }) : [];
      if (!fresh.length && !gone.length) {
        albumBusy = false;
        showMsg('"' + ALBUM_NAME + '" already matches your favourites (' + plural(existing.length, 'photo') + ').', 5000);
        return;
      }
      showMsg('Updating "' + ALBUM_NAME + '"…', 0);
      function done() {
        albumBusy = false;
        var parts = [];
        if (fresh.length) { parts.push('added ' + fresh.length); }
        if (gone.length) { parts.push('removed ' + gone.length); }
        showMsg('Album "' + ALBUM_NAME + '" updated: ' + parts.join(', ') + ' (' + plural(existing.length + fresh.length - gone.length, 'photo') + ' in total).', 6000);
      }
      changeAlbum('add_item', albumId, fresh, function (err) {
        if (err) { return fail(err); }
        changeAlbum('delete_item', albumId, gone, function (e2) {
          if (e2) { return fail(e2); }
          done();
        });
      });
    }
    function withAlbum() {
      // photos already in the album; if this lookup fails we only add and never remove
      pageList('SYNO.Foto.Browse.Item', { method: 'list', album_id: albumId }, 500, 50000, function (err, l) {
        finish(err ? [] : l, !err);
      });
    }
    showMsg('Saving favourites to the album "' + ALBUM_NAME + '"…', 0);
    findAlbum(function (err, id) {
      if (err) { return fail(err); }
      if (id !== null) { albumId = id; return withAlbum(); }
      call({ api: ALBUM_API, version: apiVer(ALBUM_API, 1), method: 'create', name: ALBUM_NAME }, function (e2, d) {
        if (e2) { return fail(e2); }
        var a = d && (d.album || d);
        if (a && a.id !== undefined) { albumId = a.id; return withAlbum(); }
        findAlbum(function (e3, id2) {
          if (e3) { return fail(e3); }
          if (id2 === null) { return fail({ code: -1, what: ALBUM_API + ' create' }); }
          albumId = id2;
          withAlbum();
        });
      });
    });
  }

  /* ---- Favourites file on the NAS (File Station upload/download) ----
   * One small JSON file. The NAS copy wins on connect; if an earlier upload failed
   * (dirty flag) the two are merged first so offline stars are not lost. */
  var FAV_FILE = 'dsm_photos-favourites.json';
  var favTimer = null;

  function favRemote() {
    if (!cfg.favSync || !cfg.user) { return null; }
    var p = (cfg.favPath || '').replace(/^\s+|\s+$/g, '');
    if (!p) { p = '/homes/' + cfg.user + '/' + FAV_FILE; }
    if (p.charAt(0) !== '/') { p = '/' + p; }
    if (/\/$/.test(p)) { p += FAV_FILE; }
    var i = p.lastIndexOf('/');
    return { dir: i === 0 ? '/' : p.substring(0, i), name: p.substring(i + 1), full: p };
  }
  function favDirty(set, key) {
    var dk = (key || APP.storeKey) + '.favdirty';
    try {
      if (set === undefined) { return localStorage.getItem(dk) === '1'; }
      if (set) { localStorage.setItem(dk, '1'); }
      else { localStorage.removeItem(dk); }
    } catch (e) { /* ignore */ }
    return !!set;
  }
  function favErrText(err, rp) {
    if (err.code === 105 || err.code === 407 || err.code === 408) {
      return 'No write access to ' + rp.dir + ' for this user.';
    }
    return err.code === -2 ? 'NAS unreachable.' : 'NAS error ' + err.code + '.';
  }

  function favDownload(rp, cb) {
    var api = 'SYNO.FileStation.Download', x = new XMLHttpRequest(), done = false;
    function fin(err, data) { if (!done) { done = true; cb(err, data); } }
    x.open('GET', base() + apiPath(api) + '?' + enc({
      api: api, version: apiVer(api, 2), method: 'download',
      path: JSON.stringify([rp.full]), mode: 'open', _sid: sid
    }), true);
    x.timeout = 20000;
    x.onload = function () {
      var j;
      try { j = JSON.parse(x.responseText); } catch (e) { return fin({ code: -1 }); }
      if (j && j.favs && typeof j.favs === 'object') { return fin(null, j.favs); }
      if (j && j.success === false) { return fin({ code: (j.error && j.error.code) || -1, missing: true }); }
      fin({ code: -1 });
    };
    x.onerror = function () { fin({ code: -2 }); };
    x.ontimeout = function () { fin({ code: -3 }); };
    x.send();
  }

  function favUpload(rp, cb) {
    var api = 'SYNO.FileStation.Upload', x = new XMLHttpRequest(), fd = new FormData(), done = false;
    function fin(err) { if (!done) { done = true; cb(err); } }
    // Synology wants the parameter fields first and the file part last.
    fd.append('path', rp.dir);
    fd.append('create_parents', 'true');
    fd.append('overwrite', 'true');
    fd.append('file', new Blob([JSON.stringify({ app: APP.title, v: 1, favs: favs }, null, 1)], { type: 'application/json' }), rp.name);
    x.open('POST', base() + apiPath(api) + '?' + enc({ api: api, version: apiVer(api, 2), method: 'upload', _sid: sid }), true);
    x.timeout = 30000;
    x.onload = function () {
      var j;
      try { j = JSON.parse(x.responseText); } catch (e) { return fin({ code: -1 }); }
      if (j && j.success) { fin(null); } else { fin({ code: (j && j.error && j.error.code) || -1 }); }
    };
    x.onerror = function () { fin({ code: -2 }); };
    x.ontimeout = function () { fin({ code: -3 }); };
    x.send(fd);
  }

  // On connect: pull the NAS copy (or push ours if the file does not exist yet).
  function syncFavsOnConnect(done) {
    var rp = favRemote();
    if (!rp) { return done(); }
    favDownload(rp, function (err, remote) {
      var k;
      if (!err) {
        if (favDirty()) { for (k in favs) { remote[k] = favs[k]; } favs = remote; saveFavs(); pushFavs(0); }
        else { favs = remote; saveFavs(); }
        return done();
      }
      if (err.missing) {
        if (Object.keys(favs).length) { pushFavs(0); }     // first save: create the file
        return done();
      }
      if (Object.keys(favs).length) { favDirty(true); }
      notify('Could not read favourites from the NAS (' + favErrText(err, rp) + ') Using this TV\u2019s copy.');
      done();
    });
  }

  // Debounced push after every star change.
  function pushFavs(delay) {
    var rp = favRemote();
    if (!rp) { return; }
    var sk = APP.storeKey;           // the profile this save belongs to, even if the user switches meanwhile
    favDirty(true);
    if (favTimer) { clearTimeout(favTimer); }
    favTimer = setTimeout(function () {
      favTimer = null;
      favUpload(rp, function (err) {
        if (err) { notify('Saved on this TV only. ' + favErrText(err, rp)); return; }
        favDirty(false, sk);
        notify('Favourites saved to the NAS');
      });
    }, delay === undefined ? 1500 : delay);
  }

  function notify(text) {
    if (state.screen === 'viewer') { toast(text); } else { showMsg(text, 3000); }
  }

  function fotoApi(name) { return (cfg.source === 'personal' ? 'SYNO.Foto.' : 'SYNO.FotoTeam.') + name; }

  /* --------------------------------------------------------------- helpers */
  function show(name) {
    ['settings', 'browser', 'viewer'].forEach(function (s) {
      $(s).classList.toggle('hidden', s !== name);
    });
    state.screen = name;
  }
  function showMsg(text, ms) {
    var m = $('msg');
    m.textContent = text;
    m.classList.remove('hidden');
    if (msgTimer) { clearTimeout(msgTimer); msgTimer = null; }
    if (ms) { msgTimer = setTimeout(hideMsg, ms); }
  }
  function hideMsg() {
    if (msgTimer) { clearTimeout(msgTimer); msgTimer = null; }
    $('msg').classList.add('hidden');
  }
  function exitApp() {
    try { tizen.application.getCurrentApplication().exit(); } catch (e) { try { window.close(); } catch (e2) { /* ignore */ } }
  }
  function enc(o) {
    var out = [], k, v;
    for (k in o) {
      v = o[k];
      if (v === undefined || v === null) { continue; }
      out.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    }
    return out.join('&');
  }
  function base() {
    return (cfg.https ? 'https' : 'http') + '://' + cfg.host + ':' + cfg.port + '/webapi/';
  }
  function natCompare(a, b) {
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  }

  /* ------------------------------------------------------------------- API */
  function xhr(method, url, body, cb) {
    var x = new XMLHttpRequest(), done = false;
    function fin(err, data) { if (!done) { done = true; cb(err, data); } }
    x.open(method, url, true);
    x.timeout = 20000;
    if (body) { x.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded'); }
    x.onload = function () {
      var j;
      try { j = JSON.parse(x.responseText); } catch (e) { return fin({ code: -1 }); }
      if (j && j.success) { fin(null, j.data); }
      else { fin({ code: (j && j.error && j.error.code) || -1 }); }
    };
    x.onerror = function () { fin({ code: -2 }); };
    x.ontimeout = function () { fin({ code: -3 }); };
    x.send(body || null);
  }

  function login(cb) {
    // POST so the password never appears in a URL.
    xhr('POST', base() + 'auth.cgi', enc({
      api: 'SYNO.API.Auth', version: 3, method: 'login',
      account: cfg.user, passwd: cfg.pass, session: 'FileStation', format: 'sid'
    }), function (err, d) {
      if (err) { return cb(err); }
      sid = d.sid;
      cb(null);
    });
  }

  // Synology serves different APIs from different CGI paths, so ask the NAS where each lives.
  var apiInfo = {};
  var WANTED_APIS = [
    'SYNO.FileStation.Download', 'SYNO.FileStation.Upload',          // favourites file
    'SYNO.FotoTeam.Browse.Folder', 'SYNO.FotoTeam.Browse.Item', 'SYNO.FotoTeam.Thumbnail', 'SYNO.FotoTeam.Download',
    'SYNO.Foto.Browse.Folder', 'SYNO.Foto.Browse.Item', 'SYNO.Foto.Thumbnail', 'SYNO.Foto.Download'
  ];

  function loadApiInfo(cb) {
    xhr('GET', base() + 'query.cgi?' + enc({
      api: 'SYNO.API.Info', version: 1, method: 'query', query: WANTED_APIS.join(',')
    }), null, function (err, d) {
      if (!err && d) { apiInfo = d; }
      cb();                                   // best effort: fall back to entry.cgi
    });
  }
  function apiPath(name) {
    return (apiInfo[name] && apiInfo[name].path) || 'entry.cgi';
  }
  function apiVer(name, want) {
    var m = apiInfo[name] && apiInfo[name].maxVersion;
    return m ? Math.min(want, m) : want;
  }

  function call(params, cb, retried) {
    params._sid = sid;
    xhr('GET', base() + apiPath(params.api) + '?' + enc(params), null, function (err, d) {
      if (err && !retried && (err.code === 105 || err.code === 106 || err.code === 107 || err.code === 119)) {
        return login(function (e) {
          if (e) { return cb(e); }
          call(params, cb, true);
        });
      }
      if (err) { err.what = params.api + ' ' + params.method; }
      cb(err, d);
    });
  }

  function loginErrText(err) {
    switch (err.code) {
      case 400: return 'Wrong username or password.';
      case 401: return 'That DSM account is disabled.';
      case 402: return 'Permission denied for that account.';
      case 403: return 'This account uses 2-step verification. Use a dedicated user without it.';
      case 404: return '2-step verification failed.';
      case -2:  return 'Cannot reach the NAS at ' + cfg.host + ':' + cfg.port + '.';
      case -3:  return 'The NAS took too long to answer.';
      default:  return 'Login failed (error ' + err.code + ').';
    }
  }
  function errText(err) {
    var what = err.what ? ' [' + err.what + ']' : '';
    switch (err.code) {
      case 102:
        return 'Synology Photos is not available to this account' + what + '.';
      case 105:
        return 'No permission. Give this DSM user the Synology Photos app, and access to the Shared Space.';
      case 408: return 'Folder not found.';
      case -2:  return 'Cannot reach the NAS at ' + cfg.host + ':' + cfg.port + '.';
      case -3:  return 'The NAS took too long to answer.';
      default:  return 'NAS error ' + err.code + what + '.';
    }
  }

  /* ------------------------------------------------------- image/thumb URLs */
  // kind: 'small' (grid) or 'large' (viewer, resized by the NAS)
  function thumbUrl(e, kind) {
    var api = fotoApi('Thumbnail');
    return base() + apiPath(api) + '?' + enc({
      api: api, version: apiVer(api, 1), method: 'get',
      id: e.id, cache_key: e.ckey, type: 'unit', size: kind === 'large' ? 'xl' : 'm', _sid: sid
    });
  }
  function fullUrl(e) {
    var api = fotoApi('Download');
    return base() + apiPath(api) + '?' + enc({
      api: api, version: apiVer(api, 1), method: 'download',
      cache_key: e.ckey, unit_id: '[' + e.id + ']', _sid: sid
    });
  }

  /* --------------------------------------------------------------- listings */
  // Pages through a Synology "list" call. extra = method-specific params.
  function pageList(api, extra, limit, max, cb) {
    var all = [];
    (function page(offset) {
      var p = { api: api, version: apiVer(api, 1), offset: offset, limit: limit }, k;
      for (k in extra) { p[k] = extra[k]; }
      call(p, function (err, d) {
        if (err) { return cb(err); }
        var l = (d && d.list) || [];
        all = all.concat(l);
        if (l.length === limit && all.length < max) { page(offset + limit); }
        else { cb(null, all); }
      });
    })(0);
  }

  function mapPhotosItem(it) {
    var t = it.additional && it.additional.thumbnail;
    return {
      isdir: false, id: it.id, key: String(it.id),
      name: it.filename || ('photo ' + it.id),
      ckey: t && t.cache_key, type: it.type
    };
  }

  /* The timeline is split into blocks (one per month, big months split further), so a view never
   * holds more than BLOCK_MAX photos. The whole date-sorted list is fetched once and cached. */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  // "Utah - Kane County": state (or country) plus the most local place name Photos gives us.
  function locOf(addr) {
    if (!addr) { return ''; }
    var a = addr.state || addr.country || '';
    var b = addr.county || addr.city || addr.town || addr.village || addr.district || '';
    return a && b && a !== b ? a + ' - ' + b : (a || b);
  }
  // Width / height of the photo as displayed (EXIF orientation 5-8 means the sides are swapped).
  function arOf(it) {
    var a = it.additional, r = a && a.resolution, w, h, o, t;
    if (!r || !(r.width > 0) || !(r.height > 0)) { return 0; }
    w = r.width; h = r.height; o = a.orientation;
    if (o >= 5 && o <= 8) { t = w; w = h; h = t; }
    return Math.max(0.45, Math.min(2.4, w / h));
  }
  function makeBlocks(items) {
    var groups = [], cur = null, blocks = [], i, k, t, d;
    for (i = 0; i < items.length; i++) {
      t = items[i].time;
      if (t) { d = new Date(t * 1000); k = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); } else { k = 'No date'; }
      if (!cur || cur.k !== k) { cur = { k: k, start: i, end: i, locs: {} }; groups.push(cur); }
      cur.end = i;
      if (items[i].loc) { cur.locs[items[i].loc] = (cur.locs[items[i].loc] || 0) + 1; }
    }
    groups.forEach(function (g) {
      var n = g.end - g.start + 1, parts = Math.ceil(n / BLOCK_MAX), size = Math.ceil(n / parts), p, s0, e0, date, loc = '', best = 0, l;
      for (l in g.locs) { if (g.locs[l] > best) { best = g.locs[l]; loc = l; } }   // most common place that day
      for (p = 0; p < parts; p++) {
        s0 = g.start + p * size;
        e0 = Math.min(g.end, s0 + size - 1);
        date = g.k + (parts > 1 ? ' (' + (p + 1) + '/' + parts + ')' : '');
        blocks.push({ start: s0, end: e0, date: date, loc: loc, count: e0 - s0 + 1,
          name: date + (loc ? ' \u00b7 ' + loc : '') + ' \u00b7 ' + (e0 - s0 + 1) });
      }
    });
    return blocks;
  }
  function loadTimeline(cb) {
    if (state.tl && Date.now() - state.tl.at < 300000) { return cb(null, state.tl); }
    var api = fotoApi('Browse.Item');
    // Ask for everything we can use; if this NAS rejects a field, step down to fewer.
    var TRIES = ['["thumbnail","resolution","orientation","address"]', '["thumbnail","resolution","orientation"]', '["thumbnail"]'];
    function fetchAll(additional, done) {
      pageList(api, { method: 'list', additional: additional, sort_by: 'takentime', sort_direction: 'desc' }, 500, TIMELINE_MAX, done);
    }
    function build(raw) {
      var items = [];
      raw.forEach(function (it) {
        if (it.type === 'video') { return; }
        var m = mapPhotosItem(it), ar = arOf(it);
        m.time = it.time;
        m.loc = locOf(it.additional && it.additional.address);
        m.ar = ar || 1.5; m.arKnown = !!ar;
        items.push(m);
      });
      state.tl = { at: Date.now(), items: items, blocks: makeBlocks(items) };
      cb(null, state.tl);
    }
    (function attempt(i) {
      fetchAll(TRIES[i], function (err, raw) {
        if (!err) { return build(raw); }
        if (i + 1 < TRIES.length) { return attempt(i + 1); }
        cb(err);
      });
    })(0);
  }

  function listPhotos(key, cb) {
    var folderApi = fotoApi('Browse.Folder'), itemApi = fotoApi('Browse.Item');
    var extraItems = { method: 'list', additional: '["thumbnail"]' };

    if (key === TIMELINE_KEY) {
      return loadTimeline(function (err, tl) {
        if (err) { return cb(err); }
        cb(null, [], true, { timeline: tl });
      });
    }

    function mapFolders(list) {
      return list.map(function (f) { return { isdir: true, name: f.name, key: String(f.id) }; });
    }

    if (key === '') {
      // Root: documented as list_parents; if that fails or is empty, try listing folder id 0.
      return call({ api: folderApi, version: apiVer(folderApi, 1), method: 'list_parents' }, function (err, d) {
        var l = !err && d && d.list;
        if (l && l.length) { return cb(null, mapFolders(l)); }
        pageList(folderApi, { method: 'list', id: 0 }, 500, 2000, function (e2, list) {
          if (e2) { return cb(err || e2); }
          cb(null, mapFolders(list));
        });
      });
    }

    var pending = 2, folders = null, items = null, failed = null;
    function finish() {
      if (--pending > 0) { return; }
      if (failed) { return cb(failed); }
      cb(null, mapFolders(folders).concat(items.map(mapPhotosItem)));
    }
    pageList(folderApi, { method: 'list', id: key }, 500, 2000, function (err, l) {
      if (err) { failed = failed || err; } else { folders = l; }
      finish();
    });
    pageList(itemApi, { method: 'list', folder_id: key, additional: '["thumbnail"]' }, 500, 5000, function (err, l) {
      if (err) { failed = failed || err; } else { items = l; }
      finish();
    });
  }

  function listFolder(key, cb) {
    if (key === FAV_KEY) { return cb(null, listFavs(), false); }
    if (key === PROFILES_KEY) { return cb(null, listProfiles(), true); }
    listPhotos(key, cb);
  }

  /* -------------------------------------------------------------- profiles */
  function updateProfileName() {
    var p = findProfile(profiles.active);
    var n = cfg.user ? cfg.user + ' \u00b7 ' + (cfg.source === 'personal' ? 'Personal' : 'Shared') : '';
    if (p && p.name !== n) { p.name = n; saveProfiles(); }
  }
  function removeProfileData(id) {
    var k = profileKey(id);
    try {
      localStorage.removeItem(k);
      localStorage.removeItem(k + '.favs');
      localStorage.removeItem(k + '.favdirty');
    } catch (e) { /* ignore */ }
  }
  // Drop half-made profiles (added but never given a login), except the one we are keeping.
  function pruneProfiles(keepId) {
    profiles.list = profiles.list.filter(function (p) {
      if (p.id === keepId || p.id === 'main') { return true; }
      var c = {};
      try { c = JSON.parse(localStorage.getItem(profileKey(p.id)) || '{}') || {}; } catch (e) { c = {}; }
      if (c.user) { return true; }
      removeProfileData(p.id);
      return false;
    });
    saveProfiles();
  }
  function activateProfile(id) {
    if (favTimer) { clearTimeout(favTimer); favTimer = null; }   // its stars stay saved here, flagged to upload later
    profiles.active = id;
    saveProfiles();
    APP.storeKey = profileKey(id);
    cfg = loadCfg();
    favs = loadFavs();
    sid = null; apiInfo = {};
    state.tl = null; state.tlRun = null;
    state.connected = false;
    viewer.pre = null;
  }
  function switchProfile(id) {
    if (id === profiles.active && state.connected) { openFolder(startStack()); return; }
    activateProfile(id);
    pruneProfiles(id);
    state.addFrom = null;
    fillSettings();
    if (cfg.host && cfg.user) { connect(); } else { enterSettings(); }
  }
  function addProfile() {
    var old = cfg, from = profiles.active, id = 'p' + Date.now().toString(36);
    profiles.list.push({ id: id, name: '' });
    activateProfile(id);
    ['host', 'port', 'https', 'interval', 'quality', 'favSync', 'source', 'startView'].forEach(function (k) { cfg[k] = old[k]; });
    cfg.user = ''; cfg.pass = ''; cfg.favPath = '';
    saveCfg();
    state.addFrom = from;
    fillSettings();
    show('settings');
    focusField(FIELD_IDS.indexOf('f-user'));
  }
  function removeProfile(ent) {
    if (ent.id === profiles.active) { showMsg('Switch to another profile first.', 2500); return; }
    if (state.confirmRm !== ent.id) {
      state.confirmRm = ent.id;
      showMsg('Press Red again to remove \u201c' + ent.pname + '\u201d from this TV.', 3000);
      setTimeout(function () { if (state.confirmRm === ent.id) { state.confirmRm = null; } }, 3000);
      return;
    }
    state.confirmRm = null;
    profiles.list = profiles.list.filter(function (p) { return p.id !== ent.id; });
    removeProfileData(ent.id);
    saveProfiles();
    openFolder(state.stack);
  }
  function listProfiles() {
    var out = profiles.list.map(function (p) {
      var nm = p.name || 'Profile';
      return { isdir: true, kind: 'profile', id: p.id, pname: nm, name: nm + (p.id === profiles.active ? '  \u2713' : ''), key: '#p:' + p.id };
    });
    out.push({ isdir: true, kind: 'addprofile', name: 'Add profile', key: '#addprofile' });
    return out;
  }

  /* -------------------------------------------------------------- settings */
  var FIELD_IDS = [];
  var ALL_FIELDS = ['f-host', 'f-port', 'o-proto', 'o-source', 'o-startview', 'f-user', 'f-pass', 'o-interval', 'o-quality', 'o-favsync', 'f-favpath', 'b-connect'];

  function applyBuild() {
    document.title = APP.title;
    $('title').textContent = APP.title + '  v' + VERSION;
    $('sub').textContent = 'Browse your Synology Photos library over the local network.';
    $('f-favpath').placeholder = '/homes/<username>/' + FAV_FILE + '  (blank = this)';
    FIELD_IDS = ALL_FIELDS.slice();
  }
  var OPT_MAP = {
    'o-proto': ['proto', 'https'], 'o-source': ['source', 'source'], 'o-startview': ['startview', 'startView'],
    'o-interval': ['interval', 'interval'], 'o-quality': ['quality', 'quality'], 'o-favsync': ['favsync', 'favSync']
  };

  function optIndex(name, value) {
    var i = OPTS[name].values.indexOf(value);
    return i < 0 ? 0 : i;
  }
  function renderOpt(id, name, value) {
    $(id).querySelector('.val').textContent = OPTS[name].labels[optIndex(name, value)];
  }
  function fillSettings() {
    $('f-host').value = cfg.host;
    $('f-port').value = cfg.port;
    $('f-user').value = cfg.user;
    $('f-pass').value = cfg.pass;
    $('f-favpath').value = cfg.favPath;
    form.favSync = !!cfg.favSync;
    form.https = !!cfg.https;
    form.source = cfg.source;
    form.startView = cfg.startView;
    form.interval = cfg.interval;
    form.quality = cfg.quality;
    renderOpt('o-proto', 'proto', form.https);
    renderOpt('o-source', 'source', form.source);
    renderOpt('o-startview', 'startview', form.startView);
    renderOpt('o-interval', 'interval', form.interval);
    renderOpt('o-quality', 'quality', form.quality);
    renderOpt('o-favsync', 'favsync', form.favSync);
  }
  function readSettings() {
    cfg.host = $('f-host').value.replace(/\s+/g, '');
    cfg.port = $('f-port').value.replace(/\s+/g, '') || '5000';
    cfg.user = $('f-user').value;
    cfg.pass = $('f-pass').value;
    cfg.favPath = $('f-favpath').value.replace(/^\s+|\s+$/g, '');
    cfg.favSync = form.favSync;
    cfg.https = form.https;
    cfg.source = form.source;
    cfg.startView = form.startView;
    cfg.interval = form.interval;
    cfg.quality = form.quality;
  }
  function cycleOpt(id, dir) {
    var name = OPT_MAP[id][0], key = OPT_MAP[id][1];
    var vals = OPTS[name].values;
    var i = (optIndex(name, form[key]) + dir + vals.length) % vals.length;
    form[key] = vals[i];
    renderOpt(id, name, form[key]);
  }
  function focusField(i) {
    var el = $(FIELD_IDS[i]);
    if (el) { el.focus(); }
  }
  function enterSettings() {
    fillSettings();
    show('settings');
    focusField(FIELD_IDS.indexOf(cfg.user ? 'b-connect' : 'f-host'));
  }

  function settingsKey(e) {
    var kc = e.keyCode;
    var cur = FIELD_IDS.indexOf(document.activeElement ? document.activeElement.id : '');
    var id = cur >= 0 ? FIELD_IDS[cur] : '';
    var isOpt = id.charAt(0) === 'o';

    if (kc === K.DOWN) { focusField(Math.min(FIELD_IDS.length - 1, cur + 1)); return true; }
    if (kc === K.UP) { focusField(Math.max(0, cur < 0 ? 0 : cur - 1)); return true; }
    if (isOpt && kc === K.LEFT) { cycleOpt(id, -1); return true; }
    if (isOpt && (kc === K.RIGHT || kc === K.ENTER)) { cycleOpt(id, 1); return true; }
    if (id === 'b-connect' && kc === K.ENTER) { connect(); return true; }
    if (kc === K.BACK) {
      if (state.addFrom) { var from = state.addFrom; state.addFrom = null; switchProfile(from); return true; }
      if (state.connected) { show('browser'); } else { exitApp(); }
      return true;
    }
    return false;   // let inputs handle typing, caret keys, OK (opens the TV keyboard)
  }

  function connect() {
    readSettings();
    if (!cfg.host || !cfg.user) { showMsg('Enter the NAS address and a username.', 4000); return; }
    saveCfg();
    state.tl = null;
    showMsg('Connecting…', 0);
    login(function (err) {
      if (err) { showMsg(loginErrText(err), 7000); return; }
      loadApiInfo(function () {
        showMsg('Syncing favourites\u2026', 0);
        syncFavsOnConnect(function () {
          hideMsg();
          state.connected = true;
          state.addFrom = null;
          updateProfileName();
          openFolder(startStack());
        });
      });
    });
  }

  /* ------------------------------------------------------------ navigation */
  function rootLabel() {
    return cfg.source === 'personal' ? 'Personal Space' : 'Shared Space';
  }
  function curKey() { return state.stack[state.stack.length - 1].key; }
  function crumbText() {
    var s = state.stack;
    if (s.length === 1) { return rootLabel(); }
    return s.slice(1).map(function (x) { return x.name; }).join(' / ');
  }
  function startStack() {
    var st = [{ key: '', name: '' }];
    if (cfg.startView === 'timeline') { st.push({ key: TIMELINE_KEY, name: 'All photos' }); }
    return st;
  }

  function openFolder(stack, focusName) {
    var id = ++state.reqId;
    state.stack = stack;
    show('browser');
    $('crumb').textContent = crumbText();
    $('count').textContent = '';
    showMsg('Loading…', 0);
    listFolder(curKey(), function (err, items, ordered, extra) {
      if (id !== state.reqId) { return; }
      if (err) {
        showMsg(errText(err), 8000);
        if (stack.length > 1) { openFolder(stack.slice(0, -1)); }   // fall back toward the root
        else { renderEntries([], null, false); }
        return;
      }
      hideMsg();
      renderEntries(items, focusName, ordered, extra);
    });
  }

  /* --------------------------------------------------------------- browser */
  function renderEntries(items, focusName, ordered, extra) {
    state.tlRun = null;
    if (extra && extra.timeline) { return renderTimeline(extra.timeline); }
    var dirs = [], imgs = [];
    items.forEach(function (it) {
      var n = it.name || '';
      if (n.charAt(0) === '@' || n === '#recycle' || n === '#snapshot') { return; }
      if (it.isdir) { dirs.push(it); return; }
      if (it.type !== 'video') { imgs.push(it); }
    });
    var onProfiles = curKey() === PROFILES_KEY;
    if (!onProfiles) { dirs.sort(natCompare); }
    if (!ordered) { imgs.sort(natCompare); }

    state.entries = [];
    var atRoot = state.stack.length === 1;
    if (atRoot) { state.entries.push({ kind: 'settings', isdir: true, name: 'Settings' }); }
    if (atRoot) { state.entries.push({ kind: 'favs', isdir: true, name: 'Favourites', key: FAV_KEY }); }
    if (atRoot) { state.entries.push({ kind: 'timeline', isdir: true, name: 'All photos', key: TIMELINE_KEY }); }
    if (atRoot) { state.entries.push({ kind: 'profiles', isdir: true, name: 'Switch profile', key: PROFILES_KEY }); }
    if (curKey() === FAV_KEY && cfg.source === 'personal' && imgs.length) {
      state.entries.push({ kind: 'mkalbum', isdir: true, name: 'Save as album' });
    }
    state.entries = state.entries.concat(dirs);
    state.entries = state.entries.concat(imgs);

    var grid = $('grid');
    grid.innerHTML = '';
    state.tiles = [];
    state.cols = 0; state.lastDrop = 0;
    resetThumbQueue();

    var frag = document.createDocumentFragment();
    state.entries.forEach(function (entry, n) {
      var t = buildTile(entry);
      var tim = t.querySelector('img');
      if (tim) { tim._idx = n; }           // lets the loader find "nearest to focus" without searching
      state.tiles.push(t);
      frag.appendChild(t);
    });
    grid.appendChild(frag);
    $('grid-wrap').scrollTop = 0;

    var parts = [];
    if (dirs.length) { parts.push(dirs.length + (dirs.length === 1 ? ' folder' : ' folders')); }
    if (imgs.length) {
      var capped = ordered && imgs.length >= TIMELINE_MAX;
      parts.push(imgs.length + (capped ? '+' : '') + (imgs.length === 1 ? ' photo' : ' photos'));
    }
    state.countText = onProfiles ? profiles.list.length + (profiles.list.length === 1 ? ' profile' : ' profiles') : parts.join(' · ');
    $('foot').innerHTML = onProfiles ? FOOT_PROFILES : FOOT_DEFAULT;
    updateCount();
    $('empty').textContent = curKey() === FAV_KEY
      ? 'No favourites yet. Open a photo and press Up to star it.'
      : 'No photos or folders here.';
    $('empty').classList.toggle('hidden', state.entries.length > (atRoot ? 1 : 0));

    var idx = 0, i;
    if (focusName) {
      for (i = 0; i < state.entries.length; i++) {
        if (state.entries[i].name === focusName) { idx = i; break; }
      }
    } else if (onProfiles) {
      for (i = 0; i < state.entries.length; i++) { if (state.entries[i].id === profiles.active) { idx = i; break; } }
    } else if (state.entries.length > 1 && state.entries[0].kind === 'mkalbum') {
      idx = 1;   // start on the first photo, not the "Save as album" tile
    } else if (atRoot && state.entries.length > 1) {
      idx = 1;   // skip the settings tile
      for (i = 0; i < state.entries.length; i++) { if (state.entries[i].kind === 'favs') { idx = i; break; } }
    }
    state.focus = -1;
    setFocus(idx);
    pumpThumbs();
  }

  function updateCount() {
    $('count').textContent = state.countText;
  }

  function buildTile(entry) {
    var t = document.createElement('div');
    var lab = document.createElement('div');
    t.className = 'tile';
    lab.className = 'lab';
    if (entry.kind === 'settings') {
      t.className += ' dir';
      t.innerHTML = ICON_GEAR;
    } else if (entry.kind === 'timeline') {
      t.className += ' dir';
      t.innerHTML = ICON_ALL;
    } else if (entry.kind === 'profiles' || entry.kind === 'profile') {
      t.className += ' dir';
      t.innerHTML = ICON_USER;
    } else if (entry.kind === 'addprofile' || entry.kind === 'mkalbum') {
      t.className += ' dir';
      t.innerHTML = ICON_PLUS;
    } else if (entry.kind === 'favs') {
      t.className += ' dir';
      t.innerHTML = ICON_STAR;
    } else if (entry.isdir) {
      t.className += ' dir';
      t.innerHTML = ICON_FOLDER;
    } else {
      var im = document.createElement('img');
      im.className = 'thumb bad';       // hidden until the thumbnail has actually loaded
      im.alt = '';
      im._entry = entry;
      im._tile = t;
      if (isFav(entry)) { t.className += ' fav'; }
      t.appendChild(im);
      thumbQ.pending.push(im);
      thumbQ.total++;
    }
    lab.textContent = entry.name;
    t.appendChild(lab);
    return t;
  }

  /* Thumbnail loader: a few requests at a time, always the tile nearest the focused one
   * first, so the grid fills in around the cursor instead of at random. */
  var thumbQ = { gen: 0, pending: [], active: 0, total: 0 };

  /* In-memory thumbnail cache (Synology Photos only). Keyed by photo id + Photos' own cache_key,
   * so an edited photo gets a fresh thumbnail. Capped by size; oldest entries are dropped first.
   * Lives only until the app is closed. */
  var thumbCache = { map: {}, order: [], bytes: 0, max: 100 * 1024 * 1024 };
  function thumbCacheKey(e) { return (cfg.source || '') + '|' + (cfg.user || '') + '|' + e.id + '|' + e.ckey; }
  function thumbCachePut(k, blob) {
    var url = URL.createObjectURL(blob), old;
    thumbCache.map[k] = { url: url, size: blob.size };
    thumbCache.order.push(k);
    thumbCache.bytes += blob.size;
    while (thumbCache.bytes > thumbCache.max && thumbCache.order.length > 1) {
      var ek = thumbCache.order.shift(); old = thumbCache.map[ek]; delete thumbCache.map[ek];
      if (old) { thumbCache.bytes -= old.size; try { URL.revokeObjectURL(old.url); } catch (ex) {} }
    }
    return url;
  }

  /* Persistent thumbnail store (IndexedDB), Synology Photos only. Survives closing the app.
   * Capped by total size; least recently used entries are removed first. Every failure
   * (no IndexedDB, quota, private mode) just means "no disk cache" -- never an error. */
  var DISK_MAX = 150 * 1024 * 1024;
  var disk = { db: null, state: 'opening', waiting: [], index: {}, bytes: 0, pruning: false };

  // Two stores: 'thumbs' holds the image blobs, 'meta' holds tiny {k,size,t} records, so we can
  // know what is stored (and what to evict) without ever reading the image data.
  function diskOpen() {
    try {
      var rq = window.indexedDB.open('dsmphotos-thumbs', 2);
      rq.onupgradeneeded = function () {
        var db = rq.result;
        if (db.objectStoreNames.contains('thumbs')) { db.deleteObjectStore('thumbs'); }
        if (db.objectStoreNames.contains('meta')) { db.deleteObjectStore('meta'); }
        db.createObjectStore('thumbs', { keyPath: 'k' });
        db.createObjectStore('meta', { keyPath: 'k' });
      };
      rq.onerror = rq.onblocked = function () { diskState('off'); };
      rq.onsuccess = function () {
        disk.db = rq.result;
        var tx = disk.db.transaction('meta', 'readonly'), cur = tx.objectStore('meta').openCursor();
        cur.onsuccess = function () {
          var c = cur.result;
          if (c) { disk.index[c.value.k] = { size: c.value.size, t: c.value.t }; disk.bytes += c.value.size; c.continue(); }
        };
        tx.oncomplete = function () { diskState('ready'); diskPrune(); };
        tx.onerror = tx.onabort = function () { diskState('off'); };
      };
    } catch (ex) { diskState('off'); }
  }
  function diskState(st) {
    disk.state = st;
    var q = disk.waiting; disk.waiting = [];
    q.forEach(function (fn) { fn(); });
  }
  function diskReady(fn) { if (disk.state === 'opening') { disk.waiting.push(fn); } else { fn(); } }

  function diskGet(k, cb) {
    diskReady(function () {
      if (disk.state !== 'ready' || !disk.index[k]) { return cb(null); }
      try {
        var tx = disk.db.transaction('thumbs', 'readonly'), g = tx.objectStore('thumbs').get(k), out = null;
        g.onsuccess = function () { out = g.result && g.result.blob ? g.result.blob : null; };
        tx.oncomplete = function () {
          if (!out) { delete disk.index[k]; return cb(null); }
          cb(out);
          var m = disk.index[k], now = Date.now();
          if (m && now - m.t > 3600000) {      // refresh "last used" at most hourly, tiny write
            m.t = now;
            try { disk.db.transaction('meta', 'readwrite').objectStore('meta').put({ k: k, size: m.size, t: now }); } catch (e1) { /* ignore */ }
          }
        };
        tx.onerror = tx.onabort = function () { cb(null); };
      } catch (ex) { cb(null); }
    });
  }
  function diskPut(k, blob) {
    diskReady(function () {
      if (disk.state !== 'ready' || disk.index[k]) { return; }
      try {
        var t = Date.now(), tx = disk.db.transaction(['thumbs', 'meta'], 'readwrite');
        tx.objectStore('thumbs').put({ k: k, blob: blob });
        tx.objectStore('meta').put({ k: k, size: blob.size, t: t });
        tx.oncomplete = function () { disk.index[k] = { size: blob.size, t: t }; disk.bytes += blob.size; diskPrune(); };
        tx.onerror = tx.onabort = function () { disk.state = 'off'; };   // quota etc: stop writing quietly
      } catch (ex) { disk.state = 'off'; }
    });
  }
  function diskPrune() {
    if (disk.state !== 'ready' || disk.pruning || disk.bytes <= DISK_MAX) { return; }
    disk.pruning = true;
    var keys = Object.keys(disk.index).sort(function (a, b) { return disk.index[a].t - disk.index[b].t; });
    var target = DISK_MAX * 0.85, drop = [], bytes = disk.bytes, i;
    for (i = 0; i < keys.length && bytes > target; i++) { drop.push(keys[i]); bytes -= disk.index[keys[i]].size; }
    try {
      var tx = disk.db.transaction(['thumbs', 'meta'], 'readwrite');
      drop.forEach(function (k) { tx.objectStore('thumbs').delete(k); tx.objectStore('meta').delete(k); });
      tx.oncomplete = function () {
        drop.forEach(function (k) { disk.bytes -= disk.index[k].size; delete disk.index[k]; });
        disk.pruning = false;
      };
      tx.onerror = tx.onabort = function () { disk.pruning = false; };
    } catch (ex) { disk.pruning = false; }
  }
  diskOpen();

  function resetThumbQueue() {
    thumbQ.gen++;
    thumbQ.pending = [];
    thumbQ.active = 0;
    thumbQ.total = 0;
  }

  /* Only thumbnails near the cursor are loaded: the visible rows plus a couple either side.
   * Moving the cursor pulls in the next ones; ones far behind are dropped again (Photos build,
   * where they come straight back from the cache) so a 2000-photo view never holds 2000 images. */
  function gridCols() {
    if (state.cols) { return state.cols; }
    var t = state.tiles, i, y;
    if (t.length < 2) { return 5; }
    y = t[0].offsetTop;
    for (i = 1; i < t.length; i++) { if (t[i].offsetTop !== y) { return (state.cols = i); } }
    return (state.cols = 5);
  }

  function pumpThumbs() {
    if (thumbQ.paused) { return; }
    var gen = thumbQ.gen, limit = 4;
    var radius = gridCols() * 5;
    while (thumbQ.active < limit && thumbQ.pending.length) {
      var bi = -1, bd = radius + 1, i, d;
      for (i = 0; i < thumbQ.pending.length; i++) {
        d = Math.abs(thumbQ.pending[i]._idx - state.focus);
        if (d < bd) { bd = d; bi = i; }
      }
      if (bi < 0) { break; }               // everything in range is loaded or loading
      startThumb(thumbQ.pending.splice(bi, 1)[0], gen);
    }
  }

  function dropFarThumbs() {
    if (Math.abs(state.focus - (state.lastDrop || 0)) < gridCols() * 2) { return; }
    state.lastDrop = state.focus;
    var far = gridCols() * 12, i, im;
    for (i = 0; i < state.tiles.length; i++) {
      if (Math.abs(i - state.focus) <= far) { continue; }
      im = state.tiles[i].firstChild;
      if (im && im.tagName === 'IMG' && im.className === 'thumb') {
        im.removeAttribute('src');
        im.className = 'thumb bad';
        im._retried = false;
        thumbQ.pending.push(im);
      }
    }
  }

  function startThumb(im, gen) {
    var settled = false;
    thumbQ.active++;
    function done(ok) {
      if (settled || gen !== thumbQ.gen) { return; }
      settled = true;
      thumbQ.active--;
      if (ok) { im.className = 'thumb'; fixAspect(im); }
      else if (!im._retried) { im._retried = true; thumbQ.pending.push(im); }   // one retry, at the back
      else { thumbQ.total--; }
      pumpThumbs();
    }
    function load() {                     // no cache key: plain request
      im.onload = function () { done(true); };
      im.onerror = function () { done(false); };
      im.src = thumbUrl(im._entry, 'small');
    }
    if (im._entry.ckey) {
      var ck = thumbCacheKey(im._entry), hit = thumbCache.map[ck];
      var show = function (url) {
        im.onload = function () { done(true); };
        im.onerror = function () { done(false); };
        im.src = url;
      };
      if (hit) { im.onerror = function () { delete thumbCache.map[ck]; done(false); }; im.onload = function () { done(true); }; im.src = hit.url; return; }
      var fromNet = function () {
        var x = new XMLHttpRequest();
        x.open('GET', thumbUrl(im._entry, 'small'));
        x.responseType = 'blob';
        x.onload = function () {
          if (gen !== thumbQ.gen) { return; }
          if (x.status !== 200 || !x.response || x.response.size < 100 || /json|text/.test(x.response.type || '')) { return done(false); }
          diskPut(ck, x.response);
          show(thumbCachePut(ck, x.response));
        };
        x.onerror = x.ontimeout = function () { done(false); };
        x.timeout = 30000;
        x.send();
      };
      diskGet(ck, function (blob) {
        if (gen !== thumbQ.gen) { return; }
        if (blob && blob.size >= 100) { show(thumbCachePut(ck, blob)); } else { fromNet(); }
      });
      return;
    }
    load();
  }

  /* ---- Running timeline (Google Photos / Synology Photos style) ----
   * Photos flow down the page under a heading per day ("2026-10-20 · Utah - Kane County"),
   * in justified rows that keep each photo's shape. Days are added as you near the end, so
   * the page never holds the whole library at once. */
  function flowBlock(b) {
    var old = b.el.querySelectorAll('.jrow'), i, tiles = b.tiles, cur = [], sum = 0, k, first = true;
    for (i = 0; i < old.length; i++) { b.el.removeChild(old[i]); }
    function emit(list, sumAr, last) {
      var h = Math.floor((ROW_W - (list.length - 1) * ROW_GAP) / sumAr), row = document.createElement('div');
      if (last && h > ROW_H * 1.25) { h = ROW_H; }          // a short last row keeps its natural height
      row.className = 'jrow';
      row.style.height = h + 'px';
      var used = 0;
      list.forEach(function (t, idx) {
        var w = Math.floor(t._ar * h);
        if (!last && idx === list.length - 1) { w = ROW_W - used - idx * ROW_GAP; }   // flush right edge
        used += w;
        t.style.width = w + 'px';
        t.style.height = h + 'px';
        t.style.marginRight = idx < list.length - 1 ? ROW_GAP + 'px' : '0';
        t._head = first ? b.head : null;                     // first row scrolls its day heading into view too
        row.appendChild(t);
      });
      first = false;
      b.el.appendChild(row);
    }
    for (k = 0; k < tiles.length; k++) {
      cur.push(tiles[k]); sum += tiles[k]._ar;
      if (sum * ROW_H + (cur.length - 1) * ROW_GAP >= ROW_W) { emit(cur, sum, false); cur = []; sum = 0; }
    }
    if (cur.length) { emit(cur, sum, true); }
  }

  var relayoutTimer = null;
  function scheduleRelayout() {
    if (relayoutTimer) { return; }
    relayoutTimer = setTimeout(function () {
      relayoutTimer = null;
      var run = state.tlRun;
      if (!run) { return; }
      var t = state.tiles[state.focus], before = t ? t.getBoundingClientRect().top : 0;
      run.blocks.forEach(function (b) { if (b.dirty) { b.dirty = false; flowBlock(b); } });
      if (t) { $('grid-wrap').scrollTop += t.getBoundingClientRect().top - before; }   // keep the cursor where it was
    }, 400);
  }
  // The thumbnail tells us the true shape; fix tiles whose metadata guess was wrong.
  function fixAspect(im) {
    var e = im._entry, run = state.tlRun, real;
    if (!run || !e || !e.ar || !im.naturalWidth || !im.naturalHeight || !im._tile._bk) { return; }
    real = im.naturalWidth / im.naturalHeight;
    if (Math.abs(real / e.ar - 1) > 0.12 && (!e.arKnown || (real > 1) !== (e.ar > 1))) {
      e.ar = real; im._tile._ar = real; im._tile._bk.dirty = true;
      scheduleRelayout();
    }
  }

  function appendTimeline(minPhotos) {
    var run = state.tlRun, added = [], frag = document.createDocumentFragment();
    if (!run || run.next >= run.tl.blocks.length) { return null; }
    while (run.next < run.tl.blocks.length && (added.length < minPhotos || !added.length)) {
      (function (bi) {
        var blk = run.tl.blocks[bi], bo = { el: document.createElement('div'), head: document.createElement('div'), tiles: [], dirty: false };
        bo.el.className = 'dblock';
        bo.head.className = 'dayhead';
        var d = document.createElement('b'); d.textContent = blk.date;
        bo.head.appendChild(d);
        if (blk.loc) { bo.head.appendChild(document.createTextNode(' \u00b7 ' + blk.loc)); }
        bo.el.appendChild(bo.head);
        run.blockTile[bi] = state.tiles.length;
        run.tl.items.slice(blk.start, blk.end + 1).forEach(function (it) {
          var t = buildTile(it), tim = t.querySelector('img');
          t.className += ' tl';
          t._ar = it.ar; t._block = bi; t._bk = bo;
          if (tim) { tim._idx = state.tiles.length; }
          state.entries.push(it);
          state.tiles.push(t);
          bo.tiles.push(t);
          added.push(it);
        });
        flowBlock(bo);
        run.blocks.push(bo);
        frag.appendChild(bo.el);
      })(run.next++);
    }
    $('grid').appendChild(frag);
    return added;
  }

  function renderTimeline(tl) {
    state.entries = [];
    state.tiles = [];
    state.cols = 6; state.lastDrop = 0;       // rows hold about six photos; sizes the preview window
    resetThumbQueue();
    $('grid').innerHTML = '';
    state.tlRun = { tl: tl, next: 0, blocks: [], blockTile: {} };
    appendTimeline(300);
    $('grid-wrap').scrollTop = 0;
    state.countText = tl.items.length + (tl.items.length === 1 ? ' photo' : ' photos');
    $('foot').innerHTML = FOOT_TIMELINE;
    updateCount();
    $('empty').textContent = 'No photos here.';
    $('empty').classList.toggle('hidden', state.entries.length > 0);
    state.focus = -1;
    if (state.entries.length) { setFocus(0); }
    pumpThumbs();
  }

  // Channel up/down: jump to the start of the next / previous month.
  function jumpMonth(dir) {
    var run = state.tlRun, cur = state.tiles[state.focus];
    if (!run || !cur) { return; }
    var blocks = run.tl.blocks, bi = cur._block, mon = function (i) { return blocks[i].date.slice(0, 7); };
    var m = mon(bi), t, f;
    if (dir > 0) {
      t = bi + 1;
      while (t < blocks.length && mon(t) === m) { t++; }
      if (t >= blocks.length) { return; }
    } else {
      f = bi; while (f > 0 && mon(f - 1) === m) { f--; }
      if (run.blockTile[f] !== undefined && state.focus > run.blockTile[f]) { t = f; }
      else {
        if (f === 0) { return; }
        t = f - 1; m = mon(t);
        while (t > 0 && mon(t - 1) === m) { t--; }
      }
    }
    while (run.next <= t) { if (!appendTimeline(300)) { break; } }
    if (run.blockTile[t] !== undefined) { setFocus(run.blockTile[t]); }
  }

  function setFocus(i) {
    if (i < 0 || i >= state.tiles.length) { return; }
    if (state.focus >= 0 && state.tiles[state.focus]) { state.tiles[state.focus].classList.remove('focus'); }
    state.focus = i;
    var t = state.tiles[i];
    t.classList.add('focus');
    if (state.tlRun && i >= state.tiles.length - 24) { appendTimeline(300); }
    if (!thumbQ.paused) { pumpThumbs(); dropFarThumbs(); }
    var wrap = $('grid-wrap');
    var top = t.offsetTop, bottom = top + t.offsetHeight;
    if (t._head) { top = t._head.offsetTop - 8; }
    if (top - 40 < wrap.scrollTop) { wrap.scrollTop = Math.max(0, top - 40); }
    else if (bottom + 40 > wrap.scrollTop + wrap.clientHeight) { wrap.scrollTop = bottom + 40 - wrap.clientHeight; }
  }

  function moveFocus(dir) {
    var cur = state.tiles[state.focus];
    if (!cur) { return; }
    var r = cur.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var best = -1, bestScore = Infinity, i, q, dx, dy, ok, score;
    var lo = Math.max(0, state.focus - 60), hi = Math.min(state.tiles.length - 1, state.focus + 60);
    for (i = lo; i <= hi; i++) {          // only neighbours matter; don't measure all ~2000 tiles
      if (i === state.focus) { continue; }
      q = state.tiles[i].getBoundingClientRect();
      dx = (q.left + q.width / 2) - cx;
      dy = (q.top + q.height / 2) - cy;
      ok = false; score = 0;
      if (dir === 'left')  { ok = dx < -5 && Math.abs(dy) < r.height / 2; score = -dx; }
      if (dir === 'right') { ok = dx > 5 && Math.abs(dy) < r.height / 2; score = dx; }
      if (dir === 'up')    { ok = dy < -5; score = -dy * 1000 + Math.abs(dx); }
      if (dir === 'down')  { ok = dy > 5; score = dy * 1000 + Math.abs(dx); }
      if (ok && score < bestScore) { best = i; bestScore = score; }
    }
    if (best < 0) {
      // wrap across row ends
      if (dir === 'left') { best = state.focus - 1; }
      if (dir === 'right') { best = state.focus + 1; }
    }
    if (best >= 0) { setFocus(best); }
  }

  function imageEntries() {
    return state.entries.filter(function (e) { return !e.isdir; });
  }

  function browserKey(e) {
    var kc = e.keyCode, ent = state.entries[state.focus], list, idx, popped;
    switch (kc) {
      case K.LEFT:  moveFocus('left');  return true;
      case K.RIGHT: moveFocus('right'); return true;
      case K.UP:    moveFocus('up');    return true;
      case K.DOWN:  moveFocus('down');  return true;
      case K.ENTER:
        if (!ent) { return true; }
        if (ent.kind === 'settings') { enterSettings(); }
        else if (ent.kind === 'profile') { switchProfile(ent.id); }
        else if (ent.kind === 'addprofile') { addProfile(); }
        else if (ent.kind === 'mkalbum') { saveFavsAlbum(); }
        else if (ent.isdir) { openFolder(state.stack.concat([{ key: ent.key, name: ent.name }])); }
        else { list = imageEntries(); openViewer(list, list.indexOf(ent), false); }
        return true;
      case K.BACK:
      case K.BS:
        if (state.stack.length <= 1) { exitApp(); }
        else {
          popped = state.stack[state.stack.length - 1];
          openFolder(state.stack.slice(0, -1), popped.name);
        }
        return true;
      case K.PLAY: case K.PLAYPAUSE: case K.GREEN: case K.P:
        list = imageEntries();
        if (!list.length) { showMsg('No photos in this folder.', 2500); return true; }
        idx = (ent && !ent.isdir) ? list.indexOf(ent) : 0;
        openViewer(list, Math.max(0, idx), true);
        return true;
      case K.YELLOW:
        enterSettings();
        return true;
      case K.RED:
        if (ent && ent.kind === 'profile') { removeProfile(ent); }
        else if (ent && !ent.isdir) { starEntry(ent); }
        return true;
      case K.CH_DOWN: jumpMonth(1); return true;
      case K.CH_UP: jumpMonth(-1); return true;
      case K.BLUE:
        if (curKey() !== PROFILES_KEY) { openFolder([state.stack[0], { key: PROFILES_KEY, name: 'Switch profile' }]); }
        return true;
    }
    return false;
  }

  // In the Favourites view, take un-starred photos off the screen and land on the nearest one still starred.
  function refreshFavsView(cur) {
    var es = state.entries, i = es.indexOf(cur), j, k, pick = null, stale = false;
    for (k = 0; k < es.length; k++) { if (!es[k].isdir && !isFav(es[k])) { stale = true; break; } }
    if (!stale) { return false; }
    if (i < 0) { i = 0; }
    for (j = i; j < es.length && !pick; j++) { if (!es[j].isdir && isFav(es[j])) { pick = es[j]; } }
    for (j = i - 1; j >= 0 && !pick; j--) { if (!es[j].isdir && isFav(es[j])) { pick = es[j]; } }
    openFolder(state.stack, pick ? pick.name : undefined);
    return true;
  }

  // Toggle the star and keep the grid badge and the viewer indicator in sync.
  function starEntry(e) {
    var on = toggleFav(e), i = state.entries.indexOf(e);
    pushFavs();
    if (i >= 0 && state.tiles[i]) { state.tiles[i].classList.toggle('fav', on); }
    if (state.screen === 'viewer') {
      $('v-star').classList.toggle('show', on);
      toast(on ? 'Added to favourites' : 'Removed from favourites');
    } else {
      if (!on && curKey() === FAV_KEY) { refreshFavsView(e); }
      showMsg(on ? 'Added to favourites' : 'Removed from favourites', 1200);
    }
  }

  /* ---------------------------------------------------------------- viewer */
  function viewerUrls(e) {
    var full = fullUrl(e);
    var thumb = thumbUrl(e, 'large');
    if (THUMB_ONLY_RE.test(e.name)) { return [thumb]; }
    return cfg.quality === 'full' ? [full, thumb] : [thumb, full];
  }

  function loadImg(urls, i, cb) {
    var im = new Image();
    im.onload = function () { cb(im); };
    im.onerror = function () {
      if (i + 1 < urls.length) { loadImg(urls, i + 1, cb); } else { cb(null); }
    };
    im.src = urls[i];
  }

  /* Progressive viewing (Synology Photos, quality "Full"): show Photos' own large preview at once,
   * then swap in the full-resolution file when it arrives. The full file is 4-10 MB and its
   * transfer time on the TV swings between 0.3 s and 10 s, so the preview keeps flipping snappy.
   * Moving on abandons the unfinished full download so it stops eating bandwidth. */
  var BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  function progressive(e) { return cfg.quality === 'full' && !THUMB_ONLY_RE.test(e.name); }
  function abortFull() {
    var f = viewer.full;
    if (f) { f.onload = f.onerror = null; f.src = BLANK; viewer.full = null; }
  }
  function upgradeToFull(e, token, t0) {
    var f = new Image();
    viewer.full = f;
    f.onload = function () {
      if (token !== viewer.token) { return; }
      viewer.full = null;
      var stage = $('v-stage'), old = stage.querySelectorAll('.vimg'), i;
      f.className = 'vimg';
      f.style.transition = 'opacity 1s ease';
      stage.appendChild(f);
      void f.offsetWidth;
      f.className = 'vimg on';            // fades in over the preview, which stays fully visible underneath
      setTimeout(function () {            // ...and is removed only once the full photo is completely opaque
        for (i = 0; i < old.length; i++) { if (old[i].parentNode) { old[i].parentNode.removeChild(old[i]); } }
      }, 1100);
      trimStage();
      if ($('v-cap').className === 'show') { showCaption('full resolution in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s', true); }
    };
    f.onerror = function () { if (token === viewer.token) { viewer.full = null; } };   // keep the preview
    f.src = fullUrl(e);
  }

  /* While a photo is on screen the grid is hidden. In a big view (All photos: ~2000 tiles) keeping
   * every thumbnail decoded in memory starves the full-size photos, so drop them while viewing
   * (they come straight back from the in-memory cache when we return) and pause the loader. */
  function releaseGrid() {
    thumbQ.paused = true;
    state.tiles.forEach(function (t) {
      var im = t.firstChild;
      if (im && im.tagName === 'IMG' && im.className === 'thumb') {
        im._rel = im.getAttribute('src');
        im.removeAttribute('src');
      }
    });
  }
  function restoreGrid() {
    state.tiles.forEach(function (t) {
      var im = t.firstChild;
      if (im && im.tagName === 'IMG' && im._rel) {
        var src = im._rel; im._rel = null;
        im.onerror = function () {                 // cached copy gone: fetch it again
          im.onerror = null; im.className = 'thumb bad'; im._retried = false;
          thumbQ.pending.push(im); thumbQ.total++; pumpThumbs();
        };
        im.setAttribute('src', src);
      }
    });
    thumbQ.paused = false;
    pumpThumbs();
  }

  function openViewer(list, idx, play) {
    releaseGrid();
    viewer.list = list;
    viewer.index = idx;
    viewer.pre = null;
    viewer.more = state.tlRun ? function () { return appendTimeline(300); } : null;   // timeline: keep going into older days
    $('v-stage').innerHTML = '';
    show('viewer');
    requestAwake(true);
    setPlaying(!!play, true);
    showImage();
  }

  function closeViewer() {
    clearTimeout(viewer.timer);
    viewer.token++;
    viewer.playing = false;
    viewer.pre = null;
    abortFull();
    requestAwake(false);
    var cur = viewer.list[viewer.index];
    show('browser');
    restoreGrid();
    if (curKey() === FAV_KEY && refreshFavsView(cur)) { return; }   // drop photos un-starred in the viewer
    var i = state.entries.indexOf(cur);
    if (i >= 0) { setFocus(i); }
  }

  function showImage() {
    var e = viewer.list[viewer.index];
    var token = ++viewer.token;
    clearTimeout(viewer.timer);
    showCaption();

    abortFull();
    var pre = viewer.pre, t0 = Date.now();
    if (progressive(e)) {
      if (pre && pre.index === viewer.index && pre.img) {
        viewer.pre = null;
        present(pre.img, token, 'preview, loading full');
        upgradeToFull(e, token, t0);
        return;
      }
      $('v-loading').classList.remove('hidden');
      loadImg([thumbUrl(e, 'large'), fullUrl(e)], 0, function (im) {
        if (token !== viewer.token) { return; }
        $('v-loading').classList.add('hidden');
        if (!im) {
          toast('Cannot display this file');
          showCaption('failed to load', true);
          if (viewer.playing) { viewer.timer = setTimeout(next, 2000); }
          return;
        }
        present(im, token, 'preview in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s, loading full');
        upgradeToFull(e, token, t0);
      });
      return;
    }
    if (pre && pre.index === viewer.index && pre.img) {
      viewer.pre = null;
      present(pre.img, token, 'preloaded');
      return;
    }
    $('v-loading').classList.remove('hidden');
    loadImg(viewerUrls(e), 0, function (im) {
      if (token !== viewer.token) { return; }
      $('v-loading').classList.add('hidden');
      if (!im) {
        toast('Cannot display this file');
        showCaption('failed to load', true);
        if (viewer.playing) { viewer.timer = setTimeout(next, 2000); }
        return;
      }
      present(im, token, 'loaded in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
    });
  }

  function present(im, token, note) {
    var stage = $('v-stage'), old = stage.querySelectorAll('.vimg'), i;
    showCaption(note, true);      // caption stays up while loading; the fade-out clock starts now
    $('v-loading').classList.add('hidden');
    im.className = 'vimg';
    stage.appendChild(im);
    void im.offsetWidth;            // force reflow so the fade-in runs
    im.className = 'vimg on';
    for (i = 0; i < old.length; i++) { fadeOut(old[i]); }
    trimStage();

    if (viewer.playing) { viewer.timer = setTimeout(next, cfg.interval * 1000); }
    preloadNext(token);
  }

  function trimStage() {       // fast flipping must not pile up decoded full-size images
    var stage = $('v-stage');
    while (stage.children.length > 3) { stage.removeChild(stage.firstChild); }
  }

  function fadeOut(el) {
    el.className = 'vimg';
    setTimeout(function () { if (el.parentNode) { el.parentNode.removeChild(el); } }, 800);
  }

  function preloadNext(token) {
    if (viewer.list.length < 2) { return; }
    var ni = (viewer.index + 1) % viewer.list.length;
    var ne = viewer.list[ni];
    var urls = progressive(ne) ? [thumbUrl(ne, 'large')] : viewerUrls(ne);
    loadImg(urls, 0, function (im) {
      if (token !== viewer.token || !im) { return; }
      viewer.pre = { index: ni, img: im };
    });
  }

  function next() { go(1); }
  function go(dir) {
    if (dir > 0 && viewer.more && viewer.index >= viewer.list.length - 3) {
      var add = viewer.more();
      if (add && add.length) { viewer.list = viewer.list.concat(add); }
    }
    var n = viewer.list.length;
    viewer.index = (viewer.index + dir + n) % n;
    showImage();
  }

  function setPlaying(p, silent) {
    viewer.playing = p;
    clearTimeout(viewer.timer);
    if (!silent) { toast(p ? 'Slideshow: on' : 'Slideshow: paused'); }
    if (p && !silent && $('v-stage').querySelector('.vimg.on')) {
      viewer.timer = setTimeout(next, cfg.interval * 1000);
    }
  }

  function showCaption(note, startHide) {
    var e = viewer.list[viewer.index];
    var cap = $('v-cap');
    cap.textContent = e.name + '   ·   ' + (viewer.index + 1) + ' / ' + viewer.list.length +
      (note ? '   ·   ' + note : '') + '   ·   Up: favourite';
    $('v-star').classList.toggle('show', isFav(e));
    cap.className = 'show';
    clearTimeout(viewer.capTimer);
    if (startHide) { viewer.capTimer = setTimeout(function () { cap.className = ''; }, 3500); }
  }

  function toast(text) {
    var t = $('v-toast');
    t.textContent = text;
    t.className = 'show';
    clearTimeout(viewer.toastTimer);
    viewer.toastTimer = setTimeout(function () { t.className = ''; }, 2000);
  }

  function requestAwake(on) {
    try {
      if (window.tizen && tizen.power) {
        if (on) { tizen.power.request('SCREEN', 'SCREEN_NORMAL'); }
        else { tizen.power.release('SCREEN'); }
      }
    } catch (e) { /* ignore */ }
  }

  function viewerKey(e) {
    switch (e.keyCode) {
      case K.LEFT: case K.RW: case K.CH_DOWN:
        go(-1); return true;
      case K.RIGHT: case K.FF: case K.CH_UP:
        go(1); return true;
      case K.ENTER: case K.PLAY: case K.PAUSE: case K.PLAYPAUSE: case K.P:
        setPlaying(!viewer.playing); return true;
      case K.UP: case K.RED:
        starEntry(viewer.list[viewer.index]); showCaption(null, true); return true;
      case K.DOWN:
        showCaption(null, true); return true;
      case K.BACK: case K.STOP: case K.BS: case K.ESC:
        closeViewer(); return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ init */
  function registerKeys() {
    try {
      if (window.tizen && tizen.tvinputdevice) {
        ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
         'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'ChannelUp', 'ChannelDown'].forEach(function (n) {
          try { tizen.tvinputdevice.registerKey(n); } catch (e) { /* ignore */ }
        });
      }
    } catch (e) { /* ignore */ }
  }

  document.addEventListener('keydown', function (e) {
    var handled = false;
    if (state.screen === 'settings') { handled = settingsKey(e); }
    else if (state.screen === 'browser') { handled = browserKey(e); }
    else { handled = viewerKey(e); }
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  document.addEventListener('visibilitychange', function () {
    if (state.screen !== 'viewer') { return; }
    if (document.hidden) { clearTimeout(viewer.timer); }
    else if (viewer.playing) { viewer.timer = setTimeout(next, cfg.interval * 1000); }
  });

  $('b-connect').addEventListener('click', connect);

  registerKeys();
  FOOT_DEFAULT = $('foot').innerHTML;
  applyBuild();
  enterSettings();
  if (cfg.host && cfg.user) { connect(); }   // saved login: go straight in
})();
