/* Allons-y — audio: a recording that goes with one of the learner's own texts (a course book's dialogue track, a podcast episode), picked from
   the learner's own disk and never uploaded anywhere; a player with speed and an A–B region, and a dictée taken from the recording, turn by
   turn, that remembers where each turn starts and ends once the learner has marked it. */
(function () {
  'use strict';
  const A = window.App, { views, esc, fr, toast } = A;
  const $ = id => document.getElementById(id);

  // ---------- the files ----------
  // A text names its recording by file name only. The files come from a folder the learner picks (held for the session) and each one is
  // copied into IndexedDB the first time it is played, so the next visit finds it without picking again. Matched by stem, so a .wma
  // converted to .mp3 still matches the name the text carries.
  const EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm|wma)$/i;
  const key = name => String(name || '').normalize('NFC').toLowerCase().replace(EXT, '').replace(/\s+/g, ' ').trim();
  const mem = new Map(), cached = new Set(); let dbp = null;
  const idb = () => dbp || (dbp = new Promise((res, rej) => { try { const r = indexedDB.open('allonsy-audio', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }));
  const tx = (mode, fn) => idb().then(db => new Promise((res, rej) => { const q = fn(db.transaction('files', mode).objectStore('files')); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); })).catch(() => undefined);
  tx('readonly', st => st.getAllKeys()).then(ks => { if (!ks || !ks.length) return; ks.forEach(k => cached.add(k)); if ($('audBar')) A.render(); });
  const adopt = files => { let n = 0; Array.from(files || []).forEach(f => { if (!EXT.test(f.name)) return; mem.set(key(f.name), f); n++; }); return n; };
  let picker = null;
  const pick = folder => new Promise(res => {
    if (!picker) { picker = document.createElement('input'); picker.type = 'file'; picker.multiple = true; picker.hidden = true; picker.accept = 'audio/*,.mp3,.m4a,.wma'; document.body.appendChild(picker); }
    if (folder) picker.setAttribute('webkitdirectory', ''); else picker.removeAttribute('webkitdirectory');
    picker.onchange = () => { const n = adopt(picker.files); picker.value = ''; res(n); };
    picker.click();
  });
  // the private build (build.py --private) serves the recordings next to the page and lists them in FR_PRIVATE_AUDIO: those play by URL, no folder to pick
  const served = new Map(); Object.entries(window.FR_PRIVATE_AUDIO || {}).forEach(([k, u]) => served.set(key(k), u));
  const have = name => mem.has(key(name)) || cached.has(key(name)) || served.has(key(name));
  const get = async name => { const k = key(name); if (mem.has(k)) return mem.get(k); const c = await tx('readonly', st => st.get(k)); if (c && c.blob) { mem.set(k, c.blob); cached.add(k); return c.blob; } return null; };
  const remember = async name => { const k = key(name), f = mem.get(k); if (!f || cached.has(k)) return; if ((await tx('readwrite', st => st.put({ name: f.name || name, blob: f }, k))) !== undefined) cached.add(k); };
  const forget = () => { mem.clear(); cached.clear(); unload(); return tx('readwrite', st => st.clear()); };

  // ---------- the player ----------
  // One <audio> element for the page, kept outside the DOM so a re-render never interrupts it; the controls are drawn by card() and wired by
  // wire() on every render. A region [a, b] plays from a and stops at b, or repeats it when loop is on. `from` is where the last play
  // started: tapping B without A makes the region start there, so « play, tap B at the end of the turn » is enough to isolate a turn.
  const P = { el: null, name: '', url: '', a: null, b: null, loop: false, rate: 1, from: 0, err: '', raf: 0 };
  const fmt = s => { s = Math.max(0, Math.floor(isFinite(s) ? s : 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const fmt1 = s => fmt(s) + '.' + Math.floor(((isFinite(s) ? s : 0) % 1) * 10);
  const unload = () => { if (P.el) { P.el.pause(); P.el.removeAttribute('src'); } if (P.url) URL.revokeObjectURL(P.url); P.el = null; P.name = ''; P.url = ''; P.err = ''; };
  const load = async name => {
    if (P.el && P.name === name) return P.el;
    const f = await get(name), url = served.get(key(name)); if (!f && !url) return null;
    unload(); const el = new Audio(); if (f) { P.url = URL.createObjectURL(f); el.src = P.url; } else el.src = url; el.preload = 'auto'; el.playbackRate = P.rate; try { el.preservesPitch = true; } catch (e) { /* older engines */ }
    const fname = f ? (f.name || name) : name;
    el.addEventListener('error', () => { P.err = /\.wma$/i.test(fname) ? 'Browsers cannot play .wma files: convert them to .mp3 first (the README says how), then pick the folder again.' : 'This browser cannot play « ' + fname + ' ».'; paint(); });
    el.addEventListener('loadedmetadata', paint); el.addEventListener('play', () => { paint(); tick(); }); el.addEventListener('pause', paint); el.addEventListener('ended', paint);
    P.el = el; P.name = name; if (f) remember(name); return el;
  };
  const tick = () => {
    cancelAnimationFrame(P.raf);
    const el = P.el; if (!el || el.paused) return;
    if (!$('audBar')) { el.pause(); return; } // the controls are gone: the learner left the page
    if (P.b !== null && el.currentTime >= P.b - 0.02) { if (P.loop && P.a !== null) el.currentTime = P.a; else { el.pause(); if (P.a !== null) el.currentTime = P.a; return; } }
    const pos = $('audPos'), rng = $('audRange'); if (pos) pos.textContent = fmt(el.currentTime); if (rng && el.duration && !rng.matches(':active')) rng.value = Math.round(1000 * el.currentTime / el.duration);
    P.raf = requestAnimationFrame(tick);
  };
  const play = async (name, at) => {
    const el = await load(name); if (!el) return false;
    if (at !== undefined && isFinite(at)) el.currentTime = Math.max(0, at); P.from = el.currentTime;
    try { await el.play(); } catch (e) { P.err = P.err || 'Playback was blocked: press Play.'; paint(); return false; }
    return true;
  };
  const region = m => { if (m && m.length === 2) { P.a = +m[0]; P.b = +m[1]; } else { P.a = P.b = null; } P.loop = false; };
  const current = () => P.el ? P.el.currentTime : 0;
  const card = (name, o = {}) => {
    const ok = have(name), el = P.el && P.name === name ? P.el : null;
    const status = ok ? P.err : `No file named « ${esc(name)} » is loaded. Pick the folder that holds the recordings: they stay on this device, nothing is uploaded.`;
    return `<div class="card" id="audBar" data-name="${esc(name)}"><div class="row"><span class="eyebrow">${esc(o.title || 'Recording')}</span><span class="en" style="font-size:.9rem">${esc(name)}</span><span class="grow"></span>${o.buttons || ''}</div>
      <p class="en" id="audErr" style="margin-top:8px" ${status ? '' : 'hidden'}>${esc(status)}</p>
      ${ok ? `<div class="player" style="margin-top:10px"><button class="btn primary" id="audPlay">${el && !el.paused ? '❚❚ Pause' : '▶ Play'}</button><button class="btn" id="audBack" title="Back three seconds">−3 s</button><button class="btn" id="audRate" title="Speed">${P.rate}×</button><span class="en num"><span id="audPos">${fmt(el ? el.currentTime : 0)}</span> / <span id="audDur">${fmt(el && el.duration)}</span></span></div>
      <input type="range" id="audRange" min="0" max="1000" value="${el && el.duration ? Math.round(1000 * el.currentTime / el.duration) : 0}" aria-label="Position" style="width:100%;margin-top:8px;accent-color:var(--accent)">
      <div class="player" style="margin-top:8px"><button class="btn ${P.a !== null ? 'on' : ''}" id="audA">A${P.a !== null ? ' ' + fmt1(P.a) : ''}</button><button class="btn ${P.b !== null ? 'on' : ''}" id="audB">B${P.b !== null ? ' ' + fmt1(P.b) : ''}</button><button class="btn ${P.loop ? 'on' : ''}" id="audLoop">Loop</button><button class="btn ghost" id="audClear" ${P.a === null && P.b === null ? 'disabled' : ''}>Clear</button><span class="en" style="font-size:.85rem">${esc(o.hint || 'Tap A where a passage starts and B where it ends: play then stops at B, and Loop repeats it.')}</span></div>`
      : `<div class="row" style="margin-top:10px"><button class="btn primary" id="audPickDir">Choose the folder</button><button class="btn" id="audPickFiles">Choose files</button></div>`}</div>`;
  };
  const paint = () => {
    const bar = $('audBar'); if (!bar) return;
    const name = bar.dataset.name, el = P.el && P.name === name ? P.el : null, set = (id, txt) => { const x = $(id); if (x) x.textContent = txt; }, cls = (id, on) => { const x = $(id); if (x) x.classList.toggle('on', !!on); };
    set('audPlay', el && !el.paused ? '❚❚ Pause' : '▶ Play'); set('audPos', fmt(el ? el.currentTime : 0)); set('audDur', fmt(el && el.duration)); set('audRate', P.rate + '×');
    set('audA', 'A' + (P.a !== null ? ' ' + fmt1(P.a) : '')); set('audB', 'B' + (P.b !== null ? ' ' + fmt1(P.b) : '')); cls('audA', P.a !== null); cls('audB', P.b !== null); cls('audLoop', P.loop);
    const cl = $('audClear'); if (cl) cl.disabled = P.a === null && P.b === null;
    const rng = $('audRange'); if (rng && el && el.duration && !rng.matches(':active')) rng.value = Math.round(1000 * el.currentTime / el.duration);
    const err = $('audErr'); if (err && have(name)) { err.textContent = P.err; err.hidden = !P.err; }
  };
  const wire = (name, o = {}) => {
    if (!$('audBar')) return;
    if (have(name) && !(P.el && P.name === name)) load(name).then(paint);
    const on = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', fn); };
    const picked = n => { toast(n ? n + ' audio file' + (n > 1 ? 's' : '') + ' loaded' : 'No audio files there'); A.render(); };
    on('audPickDir', () => pick(true).then(picked)); on('audPickFiles', () => pick(false).then(picked));
    on('audPlay', () => {
      const el = P.el && P.name === name ? P.el : null;
      if (!el) { play(name); return; }
      if (!el.paused) { el.pause(); return; }
      if (P.a !== null && (P.b !== null ? el.currentTime >= P.b - 0.05 : false)) el.currentTime = P.a;
      P.from = el.currentTime; el.play().catch(() => { P.err = 'Playback was blocked: press Play again.'; paint(); });
    });
    on('audBack', () => { const el = P.el; if (el) { el.currentTime = Math.max(0, el.currentTime - 3); paint(); } });
    on('audRate', () => { P.rate = { 1: 0.85, 0.85: 0.7, 0.7: 1 }[P.rate] || 1; if (P.el) P.el.playbackRate = P.rate; paint(); });
    on('audA', () => { const el = P.el; if (!el) return; P.a = el.currentTime; if (P.b !== null && P.b <= P.a + 0.3) P.b = null; P.from = P.a; paint(); });
    on('audB', () => { const el = P.el; if (!el) return; P.b = el.currentTime; if (P.a === null) P.a = Math.min(P.from, P.b); if (P.b <= P.a + 0.3) P.a = null; paint(); if (o.onRegion) o.onRegion(); });
    on('audLoop', () => { P.loop = !P.loop; paint(); });
    on('audClear', () => { region(null); paint(); });
    const rng = $('audRange'); if (rng) rng.addEventListener('input', () => { const el = P.el; if (el && el.duration) { el.currentTime = el.duration * rng.value / 1000; P.from = el.currentTime; } paint(); });
  };
  A.audio = { key, adopt, have, pick, forget, card, wire, play, region, current, state: () => P };

  // ---------- dictée from the recording ----------
  // Like the dictée progressive, but the voice is the recording: the whole track first, then turn by turn (a paragraph each; a line in
  // capitals is a heading and is skipped). Each turn's region is saved to the text as marks[paragraph] = [a, b] when the learner moves on,
  // so the next pass plays every turn by itself.
  const DKEY = 'allonsy.adictee'; let DP = null;
  const turns = t => A.paragraphs(t.text).map((s, i) => ({ i, s })).filter(x => /\p{Ll}/u.test(x.s));
  const loadDP = k => { if (DP && DP.key === k) return DP; try { const s = JSON.parse(sessionStorage.getItem(DKEY)); if (s && s.key === k) { DP = s; return DP; } } catch (e) { /* ignore */ } DP = { key: k, stage: 'listen', i: 0, results: [] }; return DP; };
  const saveDP = () => { try { sessionStorage.setItem(DKEY, JSON.stringify(DP)); } catch (e) { /* ignore */ } };
  const totals = D => D.results.reduce((a, r) => ({ score: a.score + r.score, total: a.total + r.total, hear: a.hear + r.hear, spell: a.spell + r.spell }), { score: 0, total: 0, hear: 0, spell: 0 });
  views.adictee = v => {
    const t = A.state().texts[v.id]; if (!t || !t.audio) return views.mine();
    const { summary, legend } = A.dictation, dk = 'audio:' + t.id, D = loadDP(dk), S = A.state(), items = turns(t), n = items.length, best = S.dictee[dk], marks = t.marks || {}, nm = items.filter(it => marks[it.i]).length;
    const head = `<div class="lesson-head"><div class="row"><button class="btn ghost" data-go="mytext|${t.id}">← Back</button><span class="pill lvl">${esc(t.level || 'Mine')}</span><span class="pill">Dictée · recording</span>${best ? `<span class="pill num">best ${best.score}/${best.total}</span>` : ''}</div><h1 class="fr" style="font-size:1.8rem">${fr(t.title)}</h1><p class="en">${t.src ? esc(t.src) + ' · ' : ''}${n} turn${n === 1 ? '' : 's'}${nm ? ' · ' + nm + ' marked' : ''}</p></div>`;
    if (!n) return head + '<div class="card"><p class="en">Nothing to dictate: the text has no line with words in it.</p></div>';
    if (D.stage === 'listen') return `${head}${card(t.audio)}<div class="card"><span class="eyebrow">1 · Listen</span><p class="en" style="margin-top:8px">Play the recording once without writing: get the situation, the voices, the tense. Then it comes back turn by turn. For each turn, press Play and tap B where the turn ends: that part is now isolated, so play it as often as you like, slower if you need, then type it and check. The marks are kept with the text, so the next time every turn plays by itself.</p>
      <div class="actions"><button class="btn primary" id="start" ${have(t.audio) ? '' : 'disabled'}>Start writing</button></div></div>`;
    if (D.stage === 'write') {
      const i = D.i, it = items[i], res = D.results[i];
      return `<div class="drill-head"><button class="btn ghost" data-go="mytext|${t.id}">← Back</button><div class="bar"><i style="width:${(i / n) * 100}%"></i></div><span class="en num">${i + 1}/${n}</span></div>
      ${card(t.audio, { title: 'Turn ' + (i + 1), buttons: marks[it.i] ? '<span class="pill">marked</span>' : '', hint: marks[it.i] ? 'This turn is marked: Play repeats it. Move A or B to adjust.' : 'Press Play, tap B where this turn ends; A is set where play started. Play then repeats the turn.' })}
      <div class="card"><div class="row"><span class="eyebrow">2 · Write</span><span class="en">${esc(t.src || 'my text')}</span></div>
        <textarea class="dict" id="dict" placeholder="Type what you hear…" ${res ? 'disabled' : ''} autocapitalize="off" autocomplete="off" spellcheck="false">${res ? esc(res.typed) : ''}</textarea>
        ${res ? `<div class="result ${res.right ? 'ok' : 'ko'}">${res.right ? 'Correct' : summary(res)}<span class="diff">${res.html}</span></div>${res.right ? '' : legend}<div class="actions"><button class="btn primary" id="next">${i + 1 < n ? 'Next turn' : 'Finish'}</button></div>` : '<div class="actions"><button class="btn primary" id="check">Check</button></div>'}</div>`;
    }
    const tot = totals(D), pct = Math.round(100 * tot.score / Math.max(1, tot.total));
    return `${head}<div class="card done"><span class="eyebrow">3 · Check</span><b class="num">${pct}%</b><p class="en">${tot.score} of ${tot.total} words right${tot.hear ? ' · ' + tot.hear + ' by ear' : ''}${tot.spell ? ' · ' + tot.spell + ' spelling' : ''}</p>
      <p class="en" style="max-width:540px">${!tot.hear && !tot.spell ? 'Nothing to fix.' : tot.hear > tot.spell ? 'Most misses are words the ear did not catch. Play the marked turns again at 0.7×, then at full speed, until the word boundaries are clear.' : 'The ear did its job: most misses are spelling or grammar, so endings, agreements and homophones. Reread the marked words with the rule in mind.'}</p>
      <div class="row"><button class="btn" id="retry">Try again</button><button class="btn" data-go="mytext|${t.id}">Done</button></div></div>
    ${card(t.audio, { title: 'Hear it again' })}
    <div class="card"><span class="eyebrow">Turn by turn</span><div id="sents" style="margin-top:8px">${items.map((it, k) => { const r = D.results[k], m = marks[it.i]; return `<div class="sent" id="s${k}">${m ? `<button class="speak" data-seg="${m[0]},${m[1]}" aria-label="Play this turn" title="Play this turn">▶</button>` : '<span></span>'}<div class="diff" style="margin-top:0">${r ? r.html : fr(it.s)}</div></div>`; }).join('')}</div>${legend}</div>`;
  };
  views.adictee.after = v => {
    const t = A.state().texts[v.id]; if (!t || !t.audio) return;
    const { compare, record } = A.dictation, dk = 'audio:' + t.id, D = loadDP(dk), S = A.state(), items = turns(t), n = items.length, mark = k => (A.state().texts[t.id].marks || {})[items[k].i];
    if ($('start')) $('start').addEventListener('click', () => { D.stage = 'write'; D.i = 0; D.results = []; saveDP(); const m = mark(0); region(m || null); if (m) play(t.audio, m[0]); A.render(); });
    if ($('retry')) $('retry').addEventListener('click', () => { DP = { key: dk, stage: 'listen', i: 0, results: [] }; saveDP(); region(null); if (P.el) P.el.pause(); A.render(); });
    const list = $('sents'); if (list) list.addEventListener('click', e => { const b = e.target.closest('[data-seg]'); if (!b) return; const m = b.dataset.seg.split(',').map(Number); region(m); play(t.audio, m[0]); });
    wire(t.audio);
    if (D.stage !== 'write' || !n) return;
    const it = items[D.i], res = D.results[D.i], ta = $('dict'), m0 = mark(D.i);
    if (m0 && P.a === null && P.b === null) { region(m0); paint(); } // back on this turn after a reload: its region is known
    if (!res) { ta.focus(); ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('check').click(); } }); }
    if ($('check')) $('check').addEventListener('click', () => { const r = compare(it.s, ta.value); r.typed = ta.value; D.results[D.i] = r; record(r); saveDP(); A.render(); });
    if ($('next')) $('next').addEventListener('click', () => {
      if (P.a !== null && P.b !== null) { const m = Object.assign({}, A.state().texts[t.id].marks || {}); m[it.i] = [Math.round(P.a * 10) / 10, Math.round(P.b * 10) / 10]; A.texts.update(t.id, { marks: m }); }
      const end = P.b !== null ? P.b : current();
      if (D.i + 1 < n) {
        D.i++; saveDP(); const m = mark(D.i); region(m || null);
        if (m) play(t.audio, m[0]); else if (P.el) { P.el.pause(); P.el.currentTime = end; P.from = end; }
        A.render(); return;
      }
      D.stage = 'done'; region(null); if (P.el) P.el.pause();
      const tt = totals(D), best = S.dictee[dk];
      if (!best || tt.score / tt.total >= best.score / best.total) S.dictee[dk] = { score: tt.score, total: tt.total, hear: tt.hear, spell: tt.spell, t: Date.now() };
      A.save(); saveDP(); A.render(); window.scrollTo(0, 0);
    });
  };
  A.audio.turns = turns;
})();
