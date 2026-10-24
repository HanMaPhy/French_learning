/* Allons-y — listening: dictation scoring that tells the ear from the pen, the progressive dictée on every text, and number dictation. */
(function () {
  'use strict';
  const A = window.App, { views, esc, fr, speakBtn, TTS, go, norm } = A;
  const $ = id => document.getElementById(id), pad = n => String(n).padStart(2, '0');

  // ---------- phonetic folding ----------
  // A rough map from spelling to sound, enough to tell « parlé / parler / parlait » or « on / ont » from « chat / chaud »: two words that fold to the same
  // string were heard right and written wrong (spelling or grammar), two that fold differently were not caught by the ear. 1 2 3 stand for the nasal vowels in / an / on.
  const phon = w => {
    let s = String(w).toLowerCase().replace(/[’'\-]/g, '').replace(/[éèêë]/g, 'E').replace(/[àâ]/g, 'a').replace(/[îï]/g, 'i').replace(/ô/g, 'o').replace(/[ùû]/g, 'u').replace(/ç/g, 's').replace(/œ/g, 'eu').replace(/y/g, 'i');
    if (s.length >= 5 && !/ment$/.test(s)) s = s.replace(/ent$/, 'e'); // ils parlent → parle (nouns in -ment keep their nasal)
    if (s.length >= 4 && !/^(cher|hier|fier|hiver|amer|super|enfer|cancer)$/.test(s)) s = s.replace(/er$/, 'E'); // parler (but mer, cher, hiver keep their r)
    s = s.replace(/(ez|ai|ais|ait|aient|et|est)$/, 'E'); // parlez, parlai(s/t), parlaient, complet, c'est
    s = s.replace(/^[a-z]es$/, m => m[0] + 'E'); // les, des, mes, ses, ces
    s = s.replace(/ch/g, 'S').replace(/ph/g, 'f').replace(/qu/g, 'k').replace(/gu(?=[eiE])/g, 'g').replace(/c(?=[eiE])/g, 's').replace(/c/g, 'k').replace(/g(?=[eiE])/g, 'Z').replace(/j/g, 'Z').replace(/gn/g, 'N').replace(/th/g, 't').replace(/h/g, '');
    s = s.replace(/(ain|aim|ein|eim|in|im|un|um)(?![aeiouEnm])/g, '1').replace(/(an|am|en|em)(?![aeiouEnm])/g, '2').replace(/(on|om)(?![aeiouEnm])/g, '3');
    s = s.replace(/eau|au/g, 'o').replace(/ou/g, 'U').replace(/oi/g, 'wa').replace(/eu/g, '8').replace(/ai|ei/g, 'E');
    s = s.replace(/e(?=[rl]$)/, 'E').replace(/e(?=([bdfgklmnprstz])\1)/g, 'E');
    s = s.replace(/es$/, '').replace(/e$/, '').replace(/[sdtpgxz]+$/, '').replace(/e$/, '');
    return s.replace(/e/g, 'E').replace(/([a-zA-Z0-9])\1/g, '$1'); // a missing accent is a spelling slip, so e and é meet here
  };

  // ---------- dictation scoring ----------
  // LCS alignment of the typed words against the sentence; then, inside each run of errors, each missing word is paired with the word typed in its place:
  // same sound → spelling (amber), different sound or nothing typed → missed by ear (red). A word the typist split in two, or two glued into one, is spelling.
  const compare = (target, typed) => {
    const pairs = String(target).split(' ').map(o => ({ o, n: norm(o).replace(/ /g, '') })).filter(p => p.n);
    const t = pairs.map(p => p.n), orig = pairs.map(p => p.o), u = norm(typed || '').split(' ').filter(Boolean);
    const L = Array.from({ length: t.length + 1 }, () => new Array(u.length + 1).fill(0));
    for (let i = t.length - 1; i >= 0; i--) for (let j = u.length - 1; j >= 0; j--) L[i][j] = t[i] === u[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const ops = []; let i = 0, j = 0, hit = 0;
    while (i < t.length || j < u.length) {
      if (i < t.length && j < u.length && t[i] === u[j]) { ops.push({ k: 'ok', w: orig[i] }); hit++; i++; j++; }
      else if (j < u.length && (i >= t.length || L[i][j + 1] >= L[i + 1][j])) { ops.push({ k: 'extra', w: u[j] }); j++; }
      else { ops.push({ k: 'miss', w: orig[i], n: t[i] }); i++; }
    }
    let hear = 0, spell = 0; const out = [];
    for (let a = 0; a < ops.length;) {
      if (ops[a].k === 'ok') { out.push(`<span class="ok">${esc(ops[a].w)}</span>`); a++; continue; }
      let b = a; while (b < ops.length && ops[b].k !== 'ok') b++;
      const run = ops.slice(a, b), miss = run.filter(o => o.k === 'miss'), extra = run.filter(o => o.k === 'extra');
      const bare = s => s.replace(/['\-]/g, '');
      const glued = miss.length && extra.length && miss.length !== extra.length && miss.map(o => bare(o.n)).join('') === extra.map(o => bare(o.w)).join('');
      miss.forEach((m, k) => {
        const e = extra[k];
        if (glued) { spell++; out.push(`<span class="sp">${esc(m.w)}</span>`); }
        else if (e && phon(m.n) === phon(e.w)) { spell++; out.push(`<span class="sp">${esc(m.w)}</span> <span class="extra">${esc(e.w)}</span>`); }
        else { hear++; out.push(`<span class="miss">${esc(m.w)}</span>` + (e ? ` <span class="extra">${esc(e.w)}</span>` : '')); }
      });
      if (!glued) extra.slice(miss.length).forEach(e => { hear++; out.push(`<span class="extra">${esc(e.w)}</span>`); });
      a = b;
    }
    return { html: out.join(' '), score: hit, total: t.length, hear, spell, right: hit === t.length && u.length === t.length };
  };
  const summary = r => `${r.score} of ${r.total} words right` + (r.hear ? ` · ${r.hear} by ear` : '') + (r.spell ? ` · ${r.spell} spelling` : '');
  const legend = '<p class="legend diff"><span class="miss">missed by ear</span> · <span class="sp">heard, misspelt</span> · <span class="extra">extra</span></p>';
  const record = r => { const S = A.state(); S.stats = S.stats || {}; const d = S.stats.dict = S.stats.dict || { words: 0, hear: 0, spell: 0 }; d.words += r.total; d.hear += r.hear; d.spell += r.spell; A.save(); };
  A.dictation = { phon, compare, summary, legend, record };

  // ---------- dictée progressive: the whole text once, then sentence by sentence in breath groups, then the whole text again with the misses marked ----------
  const DKEY = 'allonsy.dictee'; let DP = null;
  const source = v => {
    const [src, id] = String(v.id || '').split(':');
    if (src === 'reading') { const r = A.READING[id], l = A.LESSONS[id]; return r && l ? { key: v.id, title: r.title, lvl: l.lvl, sub: l.t + ' · reading', back: 'reading|' + id, sents: r.text.flatMap(p => TTS.sentences(p[0])) } : null; }
    if (src === 'mine') { const t = A.state().texts[id]; return t ? { key: v.id, title: t.title, lvl: t.level || 'Mine', sub: 'my text' + (t.src ? ' · ' + t.src : ''), back: 'mytext|' + id, sents: A.paragraphs(t.text).flatMap(p => TTS.sentences(p)).filter(s => /\p{Ll}/u.test(s)) } : null; } // a line in capitals is a heading, not dictated
    const p = A.LISTEN.find(x => x.id === id); return src === 'passage' && p ? { key: v.id, title: p.title, lvl: p.lvl, sub: 'listening passage', back: 'passage|' + id, sents: p.s.slice() } : null;
  };
  const loadDP = key => { if (DP && DP.key === key) return DP; try { const s = JSON.parse(sessionStorage.getItem(DKEY)); if (s && s.key === key) { DP = s; return DP; } } catch (e) { /* ignore */ } DP = { key, stage: 'listen', i: 0, results: [], plays: 0 }; return DP; };
  const saveDP = () => { try { sessionStorage.setItem(DKEY, JSON.stringify(DP)); } catch (e) { /* ignore */ } };
  const totals = D => D.results.reduce((a, r) => ({ score: a.score + r.score, total: a.total + r.total, hear: a.hear + r.hear, spell: a.spell + r.spell }), { score: 0, total: 0, hear: 0, spell: 0 });
  views.dictee = v => {
    const src = source(v); if (!src) return views.listen();
    const D = loadDP(src.key), S = A.state(), n = src.sents.length, best = S.dictee[src.key];
    const head = `<div class="lesson-head"><div class="row"><button class="btn ghost" data-go="${src.back}">← Back</button><span class="pill lvl">${src.lvl}</span><span class="pill">Dictée</span>${best ? `<span class="pill num">best ${best.score}/${best.total}</span>` : ''}</div><h1 class="fr" style="font-size:1.8rem">${fr(src.title)}</h1><p class="en">${esc(src.sub)} · ${n} sentences</p></div>`;
    if (D.stage === 'listen') return `${head}<div class="card"><span class="eyebrow">1 · Listen</span><p class="en" style="margin-top:8px">First the whole text once at normal speed, without writing: get the gist, the names, the tense. Then it comes back one sentence at a time, read in breath groups with pauses, the way a dictée is read in class. At the end you hear it once more at normal speed, with your misses marked.</p>
      <div class="player" style="margin-top:12px"><button class="btn primary" id="playAll">▶ Play the whole text</button><button class="btn" id="start">Start writing</button></div></div>`;
    if (D.stage === 'write') {
      const i = D.i, res = D.results[i];
      return `<div class="drill-head"><button class="btn ghost" data-go="${src.back}">← Back</button><div class="bar"><i style="width:${(i / n) * 100}%"></i></div><span class="en num">${i + 1}/${n}</span></div>
      <div class="card"><div class="row"><span class="eyebrow">2 · Write</span><span class="en">${esc(src.sub)}</span></div>
        <div class="player" style="margin-top:10px"><button class="btn primary" id="play">▶ Again</button><button class="btn" id="normal">Normal speed</button><span class="en num" id="plays">${D.plays ? D.plays + ' play' + (D.plays > 1 ? 's' : '') : ''}</span></div>
        <textarea class="dict" id="dict" placeholder="Type what you hear…" ${res ? 'disabled' : ''} autocapitalize="off" autocomplete="off" spellcheck="false">${res ? esc(res.typed) : ''}</textarea>
        ${res ? `<div class="result ${res.right ? 'ok' : 'ko'}">${res.right ? 'Correct' : summary(res)}<span class="diff">${res.html}</span></div>${res.right ? '' : legend}<div class="actions"><button class="btn primary" id="next">${i + 1 < n ? 'Next sentence' : 'Finish'}</button></div>`
          : `<div class="actions"><button class="btn primary" id="check">Check</button></div>`}
      </div>`;
    }
    const tot = totals(D), pct = Math.round(100 * tot.score / Math.max(1, tot.total));
    return `${head}<div class="card done"><span class="eyebrow">3 · Check</span><b class="num">${pct}%</b><p class="en">${tot.score} of ${tot.total} words right${tot.hear ? ' · ' + tot.hear + ' by ear' : ''}${tot.spell ? ' · ' + tot.spell + ' spelling' : ''}</p>
      <p class="en" style="max-width:540px">${!tot.hear && !tot.spell ? 'Nothing to fix.' : tot.hear > tot.spell ? 'Most misses are words the ear did not catch. Play the marked sentences again slowly, then at normal speed, until the word boundaries are clear.' : 'The ear did its job: most misses are spelling or grammar, so endings, agreements and homophones. Reread the marked words with the rule in mind.'}</p>
      <div class="row"><button class="btn primary" id="playAll">▶ Hear it again</button><button class="btn" id="retry">Try again</button><button class="btn" data-go="${src.back}">Done</button></div></div>
    <div class="card"><span class="eyebrow">Sentence by sentence</span><div id="sents" style="margin-top:8px">${src.sents.map((s, i) => { const r = D.results[i]; return `<div class="sent" id="s${i}">${speakBtn(s)}<div class="diff" style="margin-top:0">${r ? r.html : fr(s)}</div></div>`; }).join('')}</div>${legend}</div>`;
  };
  views.dictee.after = v => {
    const src = source(v); if (!src) return;
    const D = loadDP(src.key), S = A.state(), n = src.sents.length;
    const pa = $('playAll');
    if (pa) pa.addEventListener('click', () => {
      if (pa.dataset.on) { TTS.stop(); pa.dataset.on = ''; pa.textContent = pa.dataset.label; document.querySelectorAll('.sent').forEach(el => el.classList.remove('active')); return; }
      pa.dataset.label = pa.textContent; pa.dataset.on = '1'; pa.textContent = '■ Stop';
      TTS.seq(src.sents, { gap: 500, each: i => { document.querySelectorAll('.sent').forEach(el => el.classList.remove('active')); const el = $('s' + i); if (el) el.classList.add('active'); }, end: () => { pa.dataset.on = ''; pa.textContent = pa.dataset.label; document.querySelectorAll('.sent').forEach(el => el.classList.remove('active')); } });
    });
    if ($('start')) $('start').addEventListener('click', () => { TTS.stop(); D.stage = 'write'; D.i = 0; D.results = []; D.plays = 0; saveDP(); A.render(); });
    if ($('retry')) $('retry').addEventListener('click', () => { TTS.stop(); DP = { key: src.key, stage: 'listen', i: 0, results: [], plays: 0 }; saveDP(); A.render(); });
    if (D.stage !== 'write') return;
    const sent = src.sents[D.i], res = D.results[D.i];
    const play = slow => { TTS.stop(); TTS.speak(sent, slow ? { slow: true } : {}); D.plays++; saveDP(); if ($('plays')) $('plays').textContent = D.plays + ' play' + (D.plays > 1 ? 's' : ''); };
    $('play').addEventListener('click', () => play(true)); $('normal').addEventListener('click', () => play(false));
    const ta = $('dict');
    if (!res) { play(true); ta.focus(); ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('check').click(); } }); }
    if ($('check')) $('check').addEventListener('click', () => { const r = compare(sent, ta.value); r.typed = ta.value; D.results[D.i] = r; record(r); saveDP(); A.render(); if (!r.right) TTS.speak(sent); });
    if ($('next')) { $('next').addEventListener('click', () => {
      TTS.stop(); D.plays = 0;
      if (D.i + 1 < n) { D.i++; saveDP(); A.render(); return; }
      D.stage = 'done'; const t = totals(D), best = S.dictee[src.key];
      if (!best || t.score / t.total >= best.score / best.total) S.dictee[src.key] = { score: t.score, total: t.total, hear: t.hear, spell: t.spell, t: Date.now() };
      A.save(); saveDP(); A.render(); window.scrollTo(0, 0);
    }); }
  };

  // ---------- numbers: times, prices, phone numbers, years and dates, generated without end ----------
  const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];
  const below100 = n => { if (n < 20) return UNITS[n]; const t = Math.floor(n / 10), u = n % 10; if (t === 7 || t === 9) { const r = n - (t - 1) * 10; return TENS[t] + (t === 7 && r === 11 ? ' et onze' : '-' + UNITS[r]); } if (u === 0) return TENS[t] + (t === 8 ? 's' : ''); if (u === 1 && t !== 8) return TENS[t] + ' et un'; return TENS[t] + '-' + UNITS[u]; };
  const below1000 = n => { const h = Math.floor(n / 100), r = n % 100; if (!h) return below100(n); const hs = h === 1 ? 'cent' : UNITS[h] + ' cent' + (r ? '' : 's'); return r ? hs + ' ' + below100(r) : hs; };
  const numFr = n => { n = Math.floor(Math.abs(n)); if (n < 1000) return below1000(n); const k = Math.floor(n / 1000), r = n % 1000; const ks = k === 1 ? 'mille' : below1000(k).replace(/s$/, '') + ' mille'; return r ? ks + ' ' + below1000(r) : ks; };
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const rnd = n => Math.floor(Math.random() * n), pick = a => a[rnd(a.length)], fill = (tpls, w) => pick(tpls).replace('{n}', w);
  const hourWords = h => h === 0 ? 'minuit' : h === 12 ? 'midi' : numFr(h) + ' heure' + (h > 1 ? 's' : '');
  const gen = {
    number() { const n = pick([rnd(21), 21 + rnd(79), 60 + rnd(40), 100 + rnd(900), 1000 + rnd(9000)]); return { kind: 'number', hint: 'a number', say: fill(['Il y a {n} personnes.', 'C\'est à {n} kilomètres.', 'Page {n}.', 'Il reste {n} places.', 'Le code, c\'est {n}.', 'Nous sommes {n} à table.'], numFr(n)), show: numFr(n), keys: [String(n)] }; },
    year() { const y = pick([1600 + rnd(400), 1900 + rnd(131), 1950 + rnd(81)]); return { kind: 'year', hint: 'a year', say: fill(['Il est né en {n}.', 'C\'était en {n}.', 'Le château date de {n}.', 'Elle est arrivée en France en {n}.'], numFr(y)), show: numFr(y), keys: [String(y)] }; },
    time() {
      const h = rnd(24), m = pick([0, 0, 15, 30, 45, 5, 10, 20, 40, 50, rnd(60)]);
      if (Math.random() < 0.5) { const w = hourWords(h) + (m ? ' ' + numFr(m) : ''); return { kind: 'time', hint: 'a time, like 17h45', say: fill(['Le train part à {n}.', 'Le magasin ferme à {n}.', 'Rendez-vous à {n}.', 'Le vol est à {n}.'], w), show: w, keys: [pad(h) + pad(m)] }; }
      const hh = m > 30 ? (h + 1) % 24 : h, tail = m === 0 ? '' : m === 15 ? ' et quart' : m === 30 ? (hh === 0 || hh === 12 ? ' et demi' : ' et demie') : m === 45 ? ' moins le quart' : m > 30 ? ' moins ' + numFr(60 - m) : ' ' + numFr(m);
      const hw = (hh === 0 || hh === 12) ? hourWords(hh) : numFr(hh % 12) + ' heure' + (hh % 12 > 1 ? 's' : ''), w = hw + tail;
      return { kind: 'time', hint: 'a time, like 8h30', say: fill(['Il est {n}.', 'On se voit à {n} ?', 'Le film commence à {n}.', 'Je me lève à {n}.'], w), show: w, keys: [pad(h) + pad(m), pad((h + 12) % 24) + pad(m)] };
    },
    price() { const e = pick([rnd(10), 10 + rnd(90), 100 + rnd(900)]), c = pick([0, 0, 50, 99, 20, 60, 10, 90, 95, 5 * rnd(20)]); const w = (e === 1 ? 'un euro' : numFr(e) + ' euros') + (c ? ' ' + (Math.random() < 0.5 ? numFr(c) : numFr(c) + ' centime' + (c > 1 ? 's' : '')) : ''); return { kind: 'price', hint: 'a price, like 32,60', say: fill(['Ça fait {n}.', 'Ça coûte {n}.', 'Le menu est à {n}.', 'Vous me devez {n}.'], w), show: w, keys: [String(e * 100 + c)] }; },
    phone() { const parts = [pick(['06', '07', '01', '02', '04']), pad(rnd(100)), pad(rnd(100)), pad(rnd(100)), pad(rnd(100))]; const w = parts.map(p => (p[0] === '0' ? 'zéro ' + numFr(+p[1]) : numFr(+p))).join(', '); return { kind: 'phone', hint: 'a phone number, ten digits', say: fill(['Mon numéro, c\'est le {n}.', 'Appelez le {n}.', 'Tu notes ? {n}.'], w), show: parts.join(' '), keys: [parts.join('')] }; },
    date() { const d = 1 + rnd(28), mo = rnd(12), withYear = Math.random() < 0.4, y = 1950 + rnd(81); const w = 'le ' + (d === 1 ? 'premier' : numFr(d)) + ' ' + MONTHS[mo] + (withYear ? ' ' + numFr(y) : ''); return { kind: 'date', hint: 'a date, like 23/10' + (withYear ? '/2026' : ''), say: fill(['On se voit {n}.', 'La réunion est {n}.', 'Elle est née {n}.', 'Le concert a lieu {n}.'], w), show: w, keys: [pad(d) + pad(mo + 1) + (withYear ? y : '')] }; }
  };
  const KINDS = Object.keys(gen);
  // what the typist wrote, reduced to the same key as the item: digits for numbers, years and phones; hhmm; euros×100+cents; ddmm(yyyy)
  const typedKey = (kind, typed) => {
    let s = String(typed || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    if (kind === 'time') { if (/midi/.test(s)) return '1200'; if (/minuit/.test(s)) return '0000'; const g = s.match(/\d+/g) || []; if (!g.length) return ''; if (g.length === 1) return g[0].length <= 2 ? pad(+g[0]) + '00' : pad(+g[0].slice(0, -2)) + g[0].slice(-2); return pad(+g[0]) + pad(+g[1]); }
    if (kind === 'price') { const g = s.match(/\d+/g) || []; if (!g.length) return ''; if (g.length === 1) return /[,.]\s*$/.test(s) ? String(+g[0] * 100) : (s.includes(',') || s.includes('.') || /euro|€/.test(s) ? String(+g[0] * 100) : g[0] + '|' + String(+g[0] * 100)); const c = g[1].length === 1 ? +g[1] * 10 : +g[1].slice(0, 2); return String(+g[0] * 100 + c); }
    if (kind === 'date') { let mo = MONTHS.findIndex(mn => s.includes(mn.normalize('NFD').replace(/[̀-ͯ]/g, ''))); const g = s.match(/\d+/g) || []; if (!g.length) return ''; const d = +g[0]; let y = ''; if (mo >= 0) { y = g[1] || ''; } else { if (g.length < 2) return ''; mo = +g[1] - 1; y = g[2] || ''; } return pad(d) + pad(mo + 1) + y; }
    return (s.match(/\d+/g) || []).join('');
  };
  const accepts = (it, typed) => { const k = typedKey(it.kind, typed); return k.split('|').some(x => x && it.keys.includes(x)); };
  const answerFor = it => { const k = it.keys[0]; return it.kind === 'time' ? +k.slice(0, 2) + 'h' + k.slice(2) : it.kind === 'price' ? Math.floor(+k / 100) + ',' + pad(+k % 100) : it.kind === 'date' ? +k.slice(0, 2) + '/' + +k.slice(2, 4) + (k.length > 4 ? '/' + k.slice(4) : '') : it.kind === 'phone' ? k.replace(/(\d\d)(?=\d)/g, '$1 ') : k; };
  let N = null;
  const newRound = () => { const items = KINDS.map(k => gen[k]()); while (items.length < 10) items.push(gen[pick(KINDS)]()); A.shuffle(items); N = { items, i: 0, ok: 0, answer: null, right: null, plays: 0 }; };
  views.numbers = () => {
    if (!N) newRound();
    const it = N.items[N.i], head = `<div class="drill-head"><button class="btn ghost" data-go="listen">← Listening</button><div class="bar"><i style="width:${(N.i / N.items.length) * 100}%"></i></div><span class="en num">${Math.min(N.i + 1, N.items.length)}/${N.items.length}</span></div>`;
    if (!it) { const st = (A.state().stats || {}).numbers; return `${head}<div class="card done"><span class="eyebrow">Numbers</span><b class="num">${N.ok}/${N.items.length}</b><p class="en">${N.ok === N.items.length ? 'All of them. Numbers are the part of French that never stops coming at you: keep this warm.' : 'Soixante-dix and quatre-vingt-dix are built in the ear, not the eye: play the ones you missed again.'}${st ? ` So far ${st.ok} of ${st.n} right.` : ''}</p><div class="row"><button class="btn primary" id="again">Another ten</button><button class="btn" data-go="listen">Done</button></div></div>`; }
    const done = N.answer !== null;
    return `${head}<div class="card"><div class="row"><span class="pill">${esc(it.kind)}</span><span class="en">Listen and type ${esc(it.hint)}.</span></div>
      <div class="player" style="margin-top:10px"><button class="btn primary" id="play">▶ Play</button><button class="btn" id="slow" title="In breath groups, with a pause between them">Slower</button><span class="en num" id="plays"></span></div>
      <input class="dict" id="num" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(it.hint)}" ${done ? 'disabled' : ''} value="${done ? esc(N.answer) : ''}">
      ${done ? `<div class="result ${N.right ? 'ok' : 'ko'}">${N.right ? 'Correct' : 'Not this time'} · <b class="num">${esc(answerFor(it))}</b><span class="fr">${fr(it.say)} ${speakBtn(it.say)}</span></div><div class="actions"><button class="btn primary" id="next">Next</button></div>` : `<div class="actions"><button class="btn primary" id="check">Check</button></div>`}
    </div>`;
  };
  views.numbers.after = () => {
    const it = N.items[N.i];
    if ($('again')) $('again').addEventListener('click', () => { newRound(); A.render(); });
    if (!it) return;
    const play = slow => { TTS.stop(); TTS.speak(it.say, slow ? { slow: true } : {}); N.plays++; $('plays').textContent = N.plays + ' play' + (N.plays > 1 ? 's' : ''); };
    $('play').addEventListener('click', () => play(false)); $('slow').addEventListener('click', () => play(true));
    const inp = $('num');
    if (N.answer === null) { play(false); inp.focus(); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('check').click(); } }); }
    if ($('check')) $('check').addEventListener('click', () => { N.answer = inp.value; N.right = accepts(it, inp.value); if (N.right) N.ok++; const S = A.state(); S.stats = S.stats || {}; const st = S.stats.numbers = S.stats.numbers || { n: 0, ok: 0 }; st.n++; if (N.right) st.ok++; A.save(); A.render(); });
    if ($('next')) $('next').addEventListener('click', () => { N.i++; N.answer = null; N.right = null; N.plays = 0; TTS.stop(); A.render(); });
  };
  // Enter moves on once an answer has been checked and nothing is being typed (the textarea's own Enter, which checks, arrives here already handled)
  document.addEventListener('keydown', e => { if (e.key !== 'Enter' || e.shiftKey || e.defaultPrevented) return; const nx = $('next'); if (nx && !$('check') && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); nx.click(); } });
  A.numbers = { numFr, gen, typedKey, accepts, answerFor, state: () => N };

  // ---------- the training card on the Listening page ----------
  A.listenHub = () => {
    const S = A.state(), st = (S.stats || {}).dict, pct = x => Math.round(100 * x / Math.max(1, st.words));
    const row = (key, title, sub, target) => { const b = S.dictee[key]; return `<button class="drow" data-go="${target || 'dictee|' + key}"><span><span class="t fr" style="font-size:1.1rem">${fr(title)}</span><br><span class="sub en">${esc(sub)}</span></span><span class="pill num" style="${b ? (b.score === b.total ? 'background:var(--good-soft);color:var(--good)' : 'background:var(--warn-soft);color:var(--warn)') : ''}">${b ? Math.round(100 * b.score / b.total) + '%' : 'new'}</span></button>`; };
    return `<div class="card"><span class="eyebrow">Dictation training</span>
      <p class="en" style="margin-top:6px">${st && st.words ? `${st.words} words checked so far · ${pct(st.hear)}% missed by ear · ${pct(st.spell)}% heard but misspelt. The first number says how much more listening you need, the second how much grammar.` : 'Every dictation you check is scored two ways: words the ear missed, and words heard right but written wrong. The two numbers will show here.'}</p>
      <div class="row" style="margin-top:10px"><button class="btn primary" data-go="numbers">Numbers, times, prices, dates</button><span class="en">ten at a time, never the same twice</span></div></div>
    <div class="card"><span class="eyebrow">Dictée progressive</span><p class="en" style="margin-top:6px">Every reading and passage as a classroom dictée: the whole text once, then sentence by sentence in breath groups, then the whole text again with your misses marked.</p>
      ${(() => { // the learner's own texts, by source; a text with a recording is dictated from the recording
        const ms = Object.values(S.texts).sort((a, b) => b.added - a.added); if (!ms.length) return '';
        const mrow = t => t.audio ? row('audio:' + t.id, t.title, '♪ from the recording' + (t.src ? ' · ' + t.src : ''), 'adictee|' + t.id) : row('mine:' + t.id, t.title, 'my text' + (t.src ? ' · ' + t.src : ''));
        const gs = {}; ms.forEach(t => { const g = t.src || 'Pasted'; (gs[g] = gs[g] || []).push(t); }); const names = Object.keys(gs);
        const body = names.length > 1 ? names.map(g => `<details class="sec" style="margin-top:8px"><summary><span class="fr" style="font-weight:600">${esc(g)}</span><span class="en">${gs[g].length}</span></summary><div class="lessons" style="margin-top:8px">${gs[g].map(mrow).join('')}</div></details>`).join('') : `<div class="lessons" style="margin-top:10px">${ms.map(mrow).join('')}</div>`;
        return `<details class="sec" style="margin-top:10px" open><summary><span class="pill lvl">Mine</span><span class="en">${ms.length} text${ms.length > 1 ? 's' : ''}</span></summary>${body}</details>`; })()}
      ${A.VLEVELS().map(L => { const rs = A.BOOK.find(c => c.lvl === L).lessons.filter(l => A.READING[l.id]).map(l => row('reading:' + l.id, A.READING[l.id].title, l.t + ' · ' + A.READING[l.id].genre)), ps = A.LISTEN.filter(p => p.lvl === L).map(p => row('passage:' + p.id, p.title, p.s.length + ' sentences · listening passage')); return `<details class="sec" style="margin-top:10px"><summary><span class="pill lvl">${L}</span><span class="en">${rs.length + ps.length} texts</span></summary><div class="lessons" style="margin-top:10px">${rs.join('')}${ps.join('')}</div></details>`; }).join('')}</div>`;
  };
})();
