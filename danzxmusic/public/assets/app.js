/* DanzXMusic — pemutar web (PWA). Sumber: katalog gratis Audius + file lokal milik pengguna. */
(function () {
  'use strict';
  var API = 'https://api.audius.co/v1', APP = 'DanzXMusic';
  var $ = function (id) { return document.getElementById(id); };
  var audio = $('audio');
  var CHIPS = [
    ['Trending', null], ['Hip-Hop', 'hip hop'], ['Lo-Fi', 'lofi'], ['Elektronik', 'electronic'],
    ['Pop', 'pop'], ['Indonesia', 'indonesia'], ['Chill', 'chill'], ['Rock', 'rock']
  ];

  /* ---------- util ---------- */
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function fmt(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  var toastT;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3200); }
  function streamUrl(id) { return API + '/tracks/' + encodeURIComponent(id) + '/stream?app_name=' + APP; }
  function mapTrack(t) {
    var a = t.artwork || {};
    return { id: String(t.id), title: t.title || 'Tanpa judul', artist: (t.user && t.user.name) || 'Tidak diketahui',
      art: a['480x480'] || a['1000x1000'] || a['150x150'] || '', dur: t.duration || 0, kind: 'audius' };
  }

  /* ---------- IndexedDB (file lokal) ---------- */
  var dbp;
  function db() {
    if (!dbp) dbp = new Promise(function (res, rej) {
      var r = indexedDB.open('danzxmusic', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('tracks', { keyPath: 'id', autoIncrement: true }); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) { return new Promise(function (res, rej) {
      var t = d.transaction('tracks', mode), s = t.objectStore('tracks'), out = fn(s);
      t.oncomplete = function () { res(out && out.result); }; t.onerror = function () { rej(t.error); };
    }); });
  }
  function localAll() { return tx('readonly', function (s) { return s.getAll(); }).then(function (a) { return a || []; }); }
  function localToTrack(r) { return { id: 'L' + r.id, localId: r.id, title: r.title, artist: r.artist || 'File saya', art: '', dur: r.dur || 0, kind: 'local', blob: r.blob }; }

  /* ---------- state ---------- */
  var queue = [], qi = -1, shuffle = false, repeat = 0 /*0 off,1 all,2 one*/, errStreak = 0;
  var favs = store('dzx.fav') || [];
  var curObjUrl = null;
  function cur() { return queue[qi] || null; }
  function isFav(t) { return favs.some(function (f) { return f.id === t.id; }); }

  /* ---------- render ---------- */
  function renderList(box, tracks, emptyMsg) {
    box.textContent = '';
    if (!tracks.length) { box.appendChild(el('p', 'empty', emptyMsg || 'Kosong.')); return; }
    tracks.forEach(function (t, i) {
      var row = el('div', 'row'); row.dataset.id = t.id;
      var main = el('button', 'rmain'); main.type = 'button';
      if (t.art) { var im = el('img'); im.src = t.art; im.alt = ''; im.width = 54; im.height = 54; im.loading = 'lazy'; main.appendChild(im); }
      else main.appendChild(el('div', 'art-ph', '♪'));
      var tt = el('span', 't'); tt.appendChild(el('b', '', t.title)); tt.appendChild(el('small', '', t.artist)); main.appendChild(tt);
      if (t.dur) main.appendChild(el('span', 'dur', fmt(t.dur)));
      main.addEventListener('click', function () { play(tracks, i); });
      var more = el('button', 'more', t.kind === 'local' ? '🗑' : (isFav(t) ? '♥' : '♡')); more.type = 'button';
      more.setAttribute('aria-label', t.kind === 'local' ? 'Hapus lagu' : 'Favorit');
      more.addEventListener('click', function () {
        if (t.kind === 'local') removeLocal(t); else { toggleFav(t); more.textContent = isFav(t) ? '♥' : '♡'; }
      });
      row.appendChild(main); row.appendChild(more); box.appendChild(row);
    });
    markCurrent();
  }
  function markCurrent() {
    var c = cur();
    document.querySelectorAll('.row').forEach(function (r) { r.classList.toggle('cur', !!c && r.dataset.id === c.id); });
  }

  /* ---------- katalog ---------- */
  var homeCache = {};
  function getJson(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function loadHome(idx) {
    var box = $('homeList'), q = CHIPS[idx][1];
    document.querySelectorAll('#chips button').forEach(function (b, i) { b.classList.toggle('on', i === idx); });
    if (homeCache[idx]) return renderList(box, homeCache[idx]);
    box.textContent = ''; box.appendChild(el('p', 'empty', 'Memuat…'));
    var url = q ? API + '/tracks/search?query=' + encodeURIComponent(q) + '&limit=30&app_name=' + APP
                : API + '/tracks/trending?limit=30&app_name=' + APP;
    getJson(url).then(function (j) {
      var tr = (j.data || []).map(mapTrack); homeCache[idx] = tr;
      renderList(box, tr, 'Belum ada lagu.');
    }).catch(function () {
      box.textContent = '';
      var p = el('p', 'empty', 'Gagal memuat katalog. Cek koneksi lalu coba lagi.');
      var b = el('button', 'chipretry', 'Coba lagi'); b.type = 'button'; b.addEventListener('click', function () { loadHome(idx); });
      box.appendChild(p); box.appendChild(b);
    });
  }
  function doSearch(q) {
    var box = $('searchList'); q = q.trim(); if (!q) return;
    box.textContent = ''; box.appendChild(el('p', 'empty', 'Mencari…'));
    getJson(API + '/tracks/search?query=' + encodeURIComponent(q) + '&limit=40&app_name=' + APP).then(function (j) {
      renderList(box, (j.data || []).map(mapTrack), 'Tidak ada hasil untuk “' + q + '”.');
    }).catch(function () { box.textContent = ''; box.appendChild(el('p', 'empty', 'Pencarian gagal. Coba lagi.')); });
  }

  /* ---------- pustaka ---------- */
  var libTab = 'fav';
  function loadLib() {
    var box = $('libList'); $('addWrap').hidden = libTab !== 'local';
    if (libTab === 'fav') return renderList(box, favs, 'Belum ada favorit. Ketuk ♡ pada lagu.');
    localAll().then(function (rows) {
      renderList(box, rows.map(localToTrack), 'Belum ada file. Tambahkan lagu dari perangkat lu.');
    }).catch(function () { box.textContent = ''; box.appendChild(el('p', 'empty', 'Penyimpanan lokal tidak tersedia di mode ini.')); });
  }
  function toggleFav(t) {
    if (isFav(t)) favs = favs.filter(function (f) { return f.id !== t.id; });
    else favs.unshift({ id: t.id, title: t.title, artist: t.artist, art: t.art, dur: t.dur, kind: 'audius' });
    store('dzx.fav', favs); syncHeart(); if (libTab === 'fav' && $('v-lib').classList.contains('on')) loadLib();
  }
  function removeLocal(t) {
    tx('readwrite', function (s) { return s.delete(t.localId); }).then(function () {
      if (cur() && cur().id === t.id) { audio.pause(); audio.removeAttribute('src'); queue = []; qi = -1; $('mini').hidden = true; }
      loadLib();
    });
  }
  $('files').addEventListener('change', function (e) {
    var fl = Array.prototype.slice.call(e.target.files || []);
    if (!fl.length) return;
    Promise.all(fl.map(function (f) {
      return tx('readwrite', function (s) { return s.add({ title: f.name.replace(/\.[^.]+$/, ''), artist: 'File saya', blob: f, dur: 0 }); });
    })).then(function () { toast(fl.length + ' lagu ditambahkan'); e.target.value = ''; loadLib(); })
      .catch(function () { toast('Gagal menyimpan file'); });
  });

  /* ---------- pemutar ---------- */
  function play(list, i) { queue = list.slice(); qi = i; load(true); }
  function load(autoplay) {
    var t = cur(); if (!t) return;
    if (curObjUrl) { URL.revokeObjectURL(curObjUrl); curObjUrl = null; }
    if (t.kind === 'local') { curObjUrl = URL.createObjectURL(t.blob); audio.src = curObjUrl; }
    else audio.src = streamUrl(t.id);
    audio.load();
    ui(t);
    if (autoplay) audio.play().catch(function (e) { if (e && e.name !== 'AbortError') toast('Ketuk ▶ untuk memutar'); });
  }
  function ui(t) {
    $('mini').hidden = false;
    $('miniTitle').textContent = t.title; $('miniArtist').textContent = t.artist;
    $('npTitle').textContent = t.title; $('npArtist').textContent = t.artist;
    $('npSrc').textContent = t.kind === 'local' ? 'File dari perangkat' : 'Sumber: Audius';
    var art = t.art || 'icons/icon-512.png';
    $('miniArt').src = art; $('cover').src = art;
    $('sheetBg').style.backgroundImage = 'url("' + art.replace(/"/g, '%22') + '")';
    $('heart').hidden = t.kind === 'local';
    syncHeart(); markCurrent(); setMeta(t);
  }
  function syncHeart() {
    var t = cur(), on = !!t && isFav(t);
    var h = $('heart'); h.textContent = on ? '♥' : '♡'; h.setAttribute('aria-pressed', String(on));
  }
  function next(auto) {
    if (!queue.length) return;
    if (auto && repeat === 2) { audio.currentTime = 0; audio.play(); return; }
    if (shuffle && queue.length > 1) { var n; do { n = Math.floor(Math.random() * queue.length); } while (n === qi); qi = n; }
    else if (qi + 1 < queue.length) qi++;
    else if (repeat === 1 || !auto) qi = 0;
    else { audio.pause(); return; }
    load(true);
  }
  function prev() {
    if (audio.currentTime > 3 || qi <= 0) { audio.currentTime = 0; return; }
    qi--; load(true);
  }
  function toggle() { if (!cur()) return; if (audio.paused) audio.play().catch(function () {}); else audio.pause(); }

  audio.addEventListener('play', function () { setPlayUI(true); });
  audio.addEventListener('pause', function () { setPlayUI(false); });
  audio.addEventListener('ended', function () { next(true); });
  audio.addEventListener('playing', function () { errStreak = 0; });
  audio.addEventListener('error', function () {
    if (!audio.getAttribute('src')) return;
    errStreak++; toast('Lagu ini gagal diputar');
    if (errStreak < 3 && queue.length > 1) setTimeout(function () { next(true); }, 800);
  });
  function setPlayUI(p) {
    ['miniPlay', 'play'].forEach(function (id) { $(id).textContent = p ? '⏸' : '▶'; });
    $('cover').classList.toggle('paused', !p);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = p ? 'playing' : 'paused';
  }

  var dragging = false, lastPos = 0;
  audio.addEventListener('timeupdate', function () {
    var d = audio.duration, c = audio.currentTime;
    if (isFinite(d) && d > 0) {
      $('miniFill').style.width = (c / d * 100) + '%';
      if (!dragging) { var v = Math.round(c / d * 1000); $('seek').value = v; $('seek').style.setProperty('--p', (v / 10) + '%'); $('tCur').textContent = fmt(c); }
      $('tDur').textContent = fmt(d);
      var now = Date.now();
      if (now - lastPos > 1000 && 'mediaSession' in navigator && navigator.mediaSession.setPositionState) {
        lastPos = now;
        try { navigator.mediaSession.setPositionState({ duration: d, position: Math.min(c, d), playbackRate: audio.playbackRate || 1 }); } catch (e) {}
      }
    }
  });
  $('seek').addEventListener('input', function (e) {
    dragging = true; var d = audio.duration || 0, v = +e.target.value;
    e.target.style.setProperty('--p', (v / 10) + '%'); $('tCur').textContent = fmt(d * v / 1000);
  });
  $('seek').addEventListener('change', function (e) {
    var d = audio.duration; if (isFinite(d)) audio.currentTime = d * (+e.target.value) / 1000; dragging = false;
  });
  $('vol').addEventListener('input', function (e) { audio.volume = e.target.value / 100; e.target.style.setProperty('--p', e.target.value + '%'); });
  $('vol').style.setProperty('--p', '100%');

  ['miniPlay', 'play'].forEach(function (id) { $(id).addEventListener('click', toggle); });
  ['miniNext', 'next'].forEach(function (id) { $(id).addEventListener('click', function () { next(false); }); });
  $('prev').addEventListener('click', prev);
  $('shuf').addEventListener('click', function () { shuffle = !shuffle; this.setAttribute('aria-pressed', String(shuffle)); toast(shuffle ? 'Acak: nyala' : 'Acak: mati'); });
  $('rep').addEventListener('click', function () {
    repeat = (repeat + 1) % 3; this.setAttribute('aria-pressed', String(repeat > 0)); this.textContent = repeat === 2 ? '⟲¹' : '⟲';
    toast(['Ulangi: mati', 'Ulangi: semua', 'Ulangi: satu lagu'][repeat]);
  });
  $('heart').addEventListener('click', function () { var t = cur(); if (t && t.kind !== 'local') toggleFav(t); });

  /* Media Session: kontrol layar kunci + lanjut di latar belakang */
  function setMeta(t) {
    if (!('mediaSession' in navigator)) return;
    var art = t.art ? [{ src: t.art, sizes: '480x480', type: 'image/jpeg' }] : [{ src: new URL('icons/icon-512.png', location.href).href, sizes: '512x512', type: 'image/png' }];
    try { navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: 'DanzXMusic', artwork: art }); } catch (e) {}
  }
  if ('mediaSession' in navigator) {
    var ms = navigator.mediaSession;
    var set = function (a, f) { try { ms.setActionHandler(a, f); } catch (e) {} };
    set('play', function () { audio.play(); }); set('pause', function () { audio.pause(); });
    set('previoustrack', prev); set('nexttrack', function () { next(false); });
    set('seekbackward', function (d) { audio.currentTime = Math.max(0, audio.currentTime - ((d && d.seekOffset) || 10)); });
    set('seekforward', function (d) { audio.currentTime = Math.min(audio.duration || 1e9, audio.currentTime + ((d && d.seekOffset) || 10)); });
    set('seekto', function (d) { if (d.fastSeek && audio.fastSeek) audio.fastSeek(d.seekTime); else audio.currentTime = d.seekTime; });
  }

  /* ---------- sheet ---------- */
  var sheet = $('sheet');
  function openSheet() { if (!cur()) return; sheet.hidden = false; sheet.setAttribute('aria-hidden', 'false'); requestAnimationFrame(function () { sheet.classList.add('open'); }); $('sheetClose').focus(); }
  function closeSheet() { sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true'); setTimeout(function () { if (!sheet.classList.contains('open')) sheet.hidden = true; }, 400); $('miniOpen').focus(); }
  $('miniOpen').addEventListener('click', openSheet);
  $('sheetClose').addEventListener('click', closeSheet);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sheet.classList.contains('open')) closeSheet();
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'BUTTON' && cur()) { e.preventDefault(); toggle(); }
  });
  (function swipeDown() {
    var y0 = null; var inn = sheet.querySelector('.sheet-in');
    inn.addEventListener('touchstart', function (e) { y0 = inn.scrollTop <= 0 && e.target.type !== 'range' ? e.touches[0].clientY : null; }, { passive: true });
    inn.addEventListener('touchend', function (e) { if (y0 !== null && e.changedTouches[0].clientY - y0 > 110) closeSheet(); y0 = null; }, { passive: true });
  })();

  /* ---------- navigasi ---------- */
  document.querySelectorAll('.tabbar button').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.dataset.view;
      document.querySelectorAll('.tabbar button').forEach(function (x) { x.classList.toggle('on', x === b); });
      document.querySelectorAll('.view').forEach(function (x) { x.classList.toggle('on', x.id === 'v-' + v); });
      if (v === 'lib') loadLib(); if (v === 'search') $('q').focus({ preventScroll: true });
    });
  });
  document.querySelectorAll('.seg button').forEach(function (b) {
    b.addEventListener('click', function () {
      libTab = b.dataset.lib; document.querySelectorAll('.seg button').forEach(function (x) { x.classList.toggle('on', x === b); }); loadLib();
    });
  });
  $('searchForm').addEventListener('submit', function (e) { e.preventDefault(); doSearch($('q').value); $('q').blur(); });
  CHIPS.forEach(function (c, i) {
    var b = el('button', '', c[0]); b.type = 'button'; b.setAttribute('role', 'tab');
    b.addEventListener('click', function () { loadHome(i); }); $('chips').appendChild(b);
  });

  /* ---------- pasang aplikasi ---------- */
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; $('installBtn').hidden = false; });
  $('installBtn').addEventListener('click', function () {
    if (!deferred) return; deferred.prompt(); deferred.userChoice.finally(function () { deferred = null; $('installBtn').hidden = true; });
  });
  window.addEventListener('appinstalled', function () { $('installBtn').hidden = true; toast('DanzXMusic terpasang'); });
  var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  var isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isiOS && !standalone && !store('dzx.tipHide')) $('iosTip').hidden = false;
  $('iosTipClose').addEventListener('click', function () { $('iosTip').hidden = true; store('dzx.tipHide', 1); });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

  loadHome(0);
})();
