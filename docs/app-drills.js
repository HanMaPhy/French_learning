/* Allons-y — drills (flashcards, cloze, rebuild, dictation, EN→FR, listen & pick) and listening passages. */
(function () {
  'use strict';
  const A = window.App, { views, esc, fr, shuffle, pick, norm, speakBtn, TTS, go } = A;

  // ---------- building a drill ----------
  const ELISION = /^(l|d|qu|s|n|j|m|t|c)'/i;
  const AUX = ['avoir', 'etre', 'faire', 'mettre', 'rendre'];
  const core = tok => norm(tok.replace(ELISION, '')).replace(/\s/g, '');
  const stem = w => w.replace(/(er|ir|re|oir)$/, '');
  const FORMS = { etre: 'suis es est sommes etes sont ete etais etait', avoir: 'ai as a avons avez ont eu avais avait', aller: 'vais vas va allons allez vont alle allee ira irons', faire: 'fais fait faisons faites font', vouloir: 'veux veut voulons voulez veulent voulu', pouvoir: 'peux peut pouvons pouvez peuvent pu', venir: 'viens vient venons venez viennent venu', prendre: 'prends prend prenons prenez prennent pris', boire: 'bois boit buvons buvez boivent bu', comprendre: 'comprends comprend comprenons comprenez comprennent compris', croire: 'crois croit croyons croyez croient cru', naitre: 'ne nee nes nees', decouvrir: 'decouvre decouvert decouverte', mettre: 'mets met mettons mettez mettent mis', convaincre: 'convaincs convainc convaincu convaincue', soutenir: 'soutiens soutient soutenu', contredire: 'contredis contredit contredisent', pretendre: 'pretends pretend', sentir: 'sens sent sentons sentez sentent senti', errer: 'erre errait erre', fremir: 'fremit fremissent', epanouir: 'epanouit epanouissent', guerir: 'gueris guerit gueri', manquer: 'manques manque manquent', essayer: 'essaie essaies essaient essaye', payer: 'paie paies paient paye payez payons', esperer: 'espere esperes esperent', acheter: 'achete achetes achetent', lever: 'leve leves levent', envoyer: 'envoie envoies envoient' };
  function blankFor(w, sentence) {
    const toks = sentence.split(' '), cores = toks.map(core);
    for (const variant of w.fr.split(' / ')) {
      const head = variant.replace(/^(le |la |les |l'|un |une |des |se |s')/, '').trim();
      const phrase = head.split(' ').map(core).filter(Boolean);
      if (phrase.length > 1) { // contiguous phrase match ("à gauche", "il y a", "en revanche")
        for (let i = 0; i + phrase.length <= toks.length; i++) if (phrase.every((p, k) => cores[i + k] === p)) return { start: i, len: phrase.length };
      }
      const cands = phrase.filter(p => p.length >= 3).sort((a, b) => (AUX.includes(a) - AUX.includes(b)) || (b.length - a.length));
      for (const c of cands) {
        const st = stem(c), forms = FORMS[c] ? FORMS[c].split(' ') : [];
        // score every token: an exact or listed form beats a stem match, a short stem extension beats a long one; punctuation-only tokens never win
        let best = -1, bestScore = 0;
        cores.forEach((x, i) => {
          if (!x) return;
          let s = 0;
          if (x === c || forms.includes(x)) s = 3;
          else if (st.length >= 3 && x.startsWith(st) && x.length - st.length <= 5) s = 2 - (x.length - st.length) / 10;
          else if (x.length >= 4 && c.startsWith(x.slice(0, 5))) s = 1;
          if (s > bestScore) { bestScore = s; best = i; }
        });
        if (best >= 0) return { start: best, len: 1 };
      }
    }
    let best = 0; cores.forEach((x, i) => { if (x.length > cores[best].length) best = i; });
    return { start: best, len: 1 };
  }
  function splitBlank(sentence, b) {
    const toks = sentence.split(' ');
    const before = toks.slice(0, b.start).join(' '), mid = toks.slice(b.start, b.start + b.len).join(' '), after = toks.slice(b.start + b.len).join(' ');
    const m = mid.match(/^(.*?)([.,;:!?»)]*)$/); // keep trailing punctuation outside the gap
    return { before: before ? before + ' ' : '', answer: m[1], tail: m[2] + (after ? ' ' + after : '') };
  }
  // Rebuild chips: a punctuation-only token ("?", "!", ";") rides on the word before it with a narrow no-break space, French style
  const tokens = s => s.split(' ').reduce((a, t) => { if (!norm(t) && a.length) a[a.length - 1] += '\u202f' + t; else a.push(t); return a; }, []);
  const posClass = p => /^n\b/.test(p) ? 'n' : /^v\b/.test(p) ? 'v' : /^adj/.test(p) ? 'adj' : /^adv/.test(p) ? 'adv' : /^phrase/.test(p) ? 'phrase' : /^interj/.test(p) ? 'interj' : 'other';
  const isCap = s => /^\p{Lu}/u.test(s); // any uppercase letter, Œ and É included
  const matchCase = (s, like) => !s ? s : isCap(like) ? s[0].toUpperCase() + s.slice(1) : s[0].toLowerCase() + s.slice(1);
  const gapOf = (p, e) => splitBlank(e.fr, blankFor(p, e.fr)).answer;
  function wordsFor(v) {
    if (v.lesson) return A.LESSONS[v.lesson].words;
    if (v.due) return pick(A.dueWords(), 20);
    if (v.lvl) return pick(A.WORDS.filter(w => w.lvl === v.lvl), 12);
    return pick(A.VWORDS(), 12);
  }
  function build(v) {
    const words = shuffle(wordsFor(v));
    const pool = words.length >= 4 ? words : A.WORDS.filter(w => w.lvl === (words[0] || A.WORDS[0]).lvl);
    const items = words.map(w => { const ex = w.ex[Math.floor(Math.random() * w.ex.length)]; const it = { w, ex }; if (v.mode === 'cloze') { it.gap = splitBlank(ex.fr, blankFor(w, ex.fr)); } return it; });
    items.forEach(it => {
      if (v.mode === 'cloze') {
        // distractors: same part of speech first (other words in this drill, then the lesson or level pool, then the same level, then the whole book), then anything; all set in the answer's case so capitalisation gives nothing away
        const cls = posClass(it.w.pos), seen = new Set([norm(it.gap.answer)]), cand = [];
        const add = a => { const n = norm(a); if (n && !seen.has(n)) { seen.add(n); cand.push(a); } };
        const same = p => posClass(p.pos) === cls;
        shuffle(items.filter(o => o !== it && same(o.w))).forEach(o => add(o.gap.answer));
        if (cand.length < 3) shuffle(pool.filter(p => p !== it.w && same(p))).forEach(p => { if (cand.length < 3) add(gapOf(p, pick(p.ex, 1)[0])); });
        if (cand.length < 3) shuffle(A.WORDS.filter(p => p !== it.w && same(p) && p.lvl === it.w.lvl)).forEach(p => { if (cand.length < 3) add(gapOf(p, pick(p.ex, 1)[0])); });
        if (cand.length < 3) shuffle(A.WORDS.filter(p => p !== it.w && same(p))).forEach(p => { if (cand.length < 3) add(gapOf(p, pick(p.ex, 1)[0])); });
        if (cand.length < 3) shuffle(items.filter(o => o !== it)).forEach(o => add(o.gap.answer));
        if (cand.length < 3) shuffle(pool).forEach(p => p.ex.forEach(e => add(gapOf(p, e))));
        it.choices = shuffle([it.gap.answer, ...cand.slice(0, 3).map(c => matchCase(c, it.gap.answer))]);
      }
      if (v.mode === 'listenpick') { const others = pool.flatMap(p => p.ex.map(e => e.en)).filter(e => e !== it.ex.en); it.choices = shuffle([it.ex.en, ...pick(others, 3)]); }
      if (v.mode === 'rebuild') { const toks = tokens(it.ex.fr); let s = shuffle(toks); if (toks.length > 1 && s.join(' ') === toks.join(' ')) s = shuffle(toks); it.toks = s; it.built = []; }
    });
    return { v, items, i: 0, ok: 0, phase: 'ask', answer: null };
  }
  let D = null;
  const CAP = { cloze: 3, listenpick: 3, rebuild: 5, dictation: 5, translate: 5 }; // recognition drills lift a word to box 3 ("known"); production drills go all the way to 5
  const title = { cards: 'Flashcards', cloze: 'Fill the gap', rebuild: 'Rebuild the sentence', dictation: 'Dictation', translate: 'English → French', listenpick: 'Listen & pick' };

  views.drill = v => {
    if (!D || D.v !== v) D = build(v);
    const it = D.items[D.i];
    const back = v.from === 'review' ? 'review' : v.from === 'listen' ? 'listen' : v.lesson ? 'lesson|' + v.lesson : 'book';
    const head = `<div class="drill-head"><button class="btn ghost" data-go="${back}">← Back</button><div class="bar"><i style="width:${(D.i / D.items.length) * 100}%"></i></div><span class="en num">${Math.min(D.i + 1, D.items.length)}/${D.items.length}</span></div>`;
    if (!D.items.length) return `${head}<div class="card done"><span class="eyebrow">${title[v.mode]}</span><p class="en">No words to practise here yet. Open a lesson in the Book and the words you meet will come back for review.</p><div class="row"><button class="btn" data-go="${back}">Back</button></div></div>`;
    if (!it) {
      const pct = Math.round((D.ok / D.items.length) * 100);
      return `${head}<div class="card done"><span class="eyebrow">${title[v.mode]}</span><b class="num">${D.ok}/${D.items.length}</b><p class="en">${pct === 100 ? 'Perfect. These sentences are yours.' : pct >= 70 ? 'Good. Run it once more and the misses will stick.' : 'Keep going: the words you missed are now due for review.'}</p>${v.mode === 'dictation' && (D.hear || D.spell) ? `<p class="en">${D.hear || 0} words missed by ear · ${D.spell || 0} heard but misspelt</p>` : ''}
        <div class="row"><button class="btn primary" id="again">Again</button><button class="btn" data-go="${back}">Done</button></div></div>`;
    }
    const w = it.w, ex = it.ex, lvl = `<span class="pill lvl">${w.lvl}</span>`;
    let body = '';
    if (v.mode === 'cards') {
      body = `<div class="card flash"><div class="row" style="justify-content:center">${lvl}<span class="pill">${esc(w.lesson.t)}</span></div>
        <div><span class="fr">${fr(w.fr)}</span> ${speakBtn(w.fr)}</div>
        ${D.phase === 'ask' ? `<div><button class="btn primary" id="reveal">Show meaning</button></div>` : `<div class="back"><div><span class="pos" style="font-family:var(--font-fr);font-style:italic;color:var(--fr)">${esc(w.pos)}</span> &nbsp; <b>${esc(w.en)}</b></div>
          <div><span class="fr">${fr(ex.fr)}</span> ${speakBtn(ex.fr)}</div><div class="en">${esc(ex.en)}</div></div>
          <div class="rate"><button class="again" data-grade="0">Again<small>forgot it</small></button><button class="hard" data-grade="1">Hard<small>almost</small></button><button class="good" data-grade="2">Good<small>knew it</small></button></div>`}
      </div>`;
    } else if (v.mode === 'cloze') {
      const g = it.gap, done = D.phase === 'done', right = done && norm(D.answer) === norm(g.answer);
      body = `<div class="card"><div class="row">${lvl}<span class="en">${esc(w.en)}</span></div>
        <p class="prompt" style="margin-top:10px">${fr(g.before)}<span class="blank ${done ? (right ? 'ok' : 'ko') : ''}">${done ? esc(g.answer) : '&nbsp;'}</span>${fr(g.tail)}</p>
        <p class="hint">${esc(ex.en)}</p>
        <div class="choices">${it.choices.map(c => `<button class="choice fr ${done ? (norm(c) === norm(g.answer) ? 'ok' : (c === D.answer ? 'ko' : '')) : ''}" data-ans="${esc(c)}" ${done ? 'disabled' : ''}>${esc(c)}</button>`).join('')}</div>
        ${done ? `<div class="result ${right ? 'ok' : 'ko'}">${right ? 'Correct' : 'Not this time'} <span class="fr">${fr(ex.fr)} ${speakBtn(ex.fr)}</span></div><div class="actions"><button class="btn primary" id="next">Next</button></div>` : ''}
      </div>`;
    } else if (v.mode === 'rebuild') {
      const done = D.phase === 'done', right = done && norm(it.built.join(' ')) === norm(ex.fr);
      body = `<div class="card"><div class="row">${lvl}<span class="en">${esc(w.fr)} — ${esc(w.en)}</span></div>
        <p class="hint" style="margin-top:6px">${esc(ex.en)}</p>
        <div class="chips built" id="built" style="margin-top:12px">${it.built.map((t, i) => `<button class="chip" data-unbuild="${i}" ${done ? 'disabled' : ''}>${esc(t)}</button>`).join('') || '<span class="en">Tap the words below in order</span>'}</div>
        <div class="chips" id="bank" style="margin-top:10px;border-color:transparent">${it.toks.map((t, i) => it.used && it.used[i] ? '' : `<button class="chip" data-build="${i}" ${done ? 'disabled' : ''}>${esc(t)}</button>`).join('')}</div>
        ${done ? `<div class="result ${right ? 'ok' : 'ko'}">${right ? 'Correct' : 'Not quite'} <span class="fr">${fr(ex.fr)} ${speakBtn(ex.fr)}</span></div><div class="actions"><button class="btn primary" id="next">Next</button></div>`
          : `<div class="actions"><button class="btn ghost" id="hear">Hear it</button><button class="btn ghost" id="clear">Clear</button><button class="btn primary" id="check" ${it.built.length === it.toks.length ? '' : 'disabled'}>Check</button></div>`}
      </div>`;
    } else if (v.mode === 'dictation') {
      const done = D.phase === 'done';
      body = `<div class="card"><div class="row">${lvl}<span class="en">Word: <b>${esc(w.fr)}</b> — ${esc(w.en)}</span></div>
        <div class="player" style="margin-top:10px"><button class="btn primary" id="play">▶ Play</button><button class="btn" id="slow" title="In breath groups, with a pause between them">Slower</button><span class="en num" id="plays"></span></div>
        <textarea class="dict" id="dict" placeholder="Type what you hear…" ${done ? 'disabled' : ''} autocapitalize="off" autocomplete="off" spellcheck="false">${done ? esc(D.answer) : ''}</textarea>
        ${done ? `<div class="result ${D.right ? 'ok' : 'ko'}">${D.right ? 'Correct' : A.dictation.summary(D.res)}<span class="diff">${D.diff}</span><span class="en">${esc(ex.en)}</span></div>${D.right ? '' : A.dictation.legend}<div class="actions"><button class="btn" id="play2">Hear again</button><button class="btn primary" id="next">Next</button></div>`
          : `<div class="actions"><button class="btn primary" id="check">Check</button></div>`}
      </div>`;
    } else if (v.mode === 'translate') {
      const done = D.phase === 'done';
      body = `<div class="card"><div class="row">${lvl}<span class="en">Uses: <b>${esc(w.fr)}</b> ${esc(w.pos)}</span></div>
        <p class="prompt" style="margin-top:10px;font-family:var(--font-ui);font-size:1.3rem">${esc(ex.en)}</p>
        <p class="hint">Say it in French, out loud if you can, then check.</p>
        ${done ? `<div class="result ok" style="background:var(--accent-soft);color:var(--fg)"><span class="fr" style="font-size:1.3rem">${fr(ex.fr)} ${speakBtn(ex.fr)}</span></div>
          <div class="rate" style="grid-template-columns:1fr 1fr"><button class="again" data-grade="0">Missed it<small>not yet</small></button><button class="good" data-grade="2">Got it<small>close enough</small></button></div>`
          : `<div class="actions"><button class="btn primary" id="reveal">Show French</button></div>`}
      </div>`;
    } else if (v.mode === 'listenpick') {
      const done = D.phase === 'done', right = done && D.answer === ex.en;
      body = `<div class="card"><div class="row">${lvl}<span class="en">Listen, then choose what it means.</span></div>
        <div class="player" style="margin-top:10px"><button class="btn primary" id="play">▶ Play</button><button class="btn" id="slow" title="In breath groups, with a pause between them">Slower</button></div>
        ${done ? `<p class="prompt" style="margin-top:12px">${fr(ex.fr)}</p>` : ''}
        <div class="choices">${it.choices.map(c => `<button class="choice ${done ? (c === ex.en ? 'ok' : (c === D.answer ? 'ko' : '')) : ''}" data-ans="${esc(c)}" ${done ? 'disabled' : ''}>${esc(c)}</button>`).join('')}</div>
        ${done ? `<div class="result ${right ? 'ok' : 'ko'}">${right ? 'Correct' : 'Not this time'} — <b>${esc(w.fr)}</b> ${esc(w.en)}</div><div class="actions"><button class="btn primary" id="next">Next</button></div>` : ''}
      </div>`;
    }
    return head + body;
  };

  views.drill.after = v => {
    const it = D.items[D.i], $ = id => document.getElementById(id);
    const next = () => { D.i++; D.phase = 'ask'; D.answer = null; TTS.stop(); A.render(); if (D.items[D.i]) window.scrollTo(0, 0); };
    const finish = ok => { if (ok) D.ok++; A.practiceResult(it.w.key, ok, CAP[v.mode]); };
    if ($('again')) $('again').addEventListener('click', () => go('drill', Object.assign({}, v)));
    if (!it) return;
    const { w, ex } = it;
    const playBtn = (id, opts) => { const b = $(id); if (b) b.addEventListener('click', () => { TTS.stop(); b.classList.add('playing'); TTS.speak(ex.fr, opts || {}).then(() => b.classList.remove('playing')); if ($('plays')) { D.plays = (D.plays || 0) + 1; $('plays').textContent = D.plays + ' play' + (D.plays > 1 ? 's' : ''); } }); };
    if (v.mode === 'cards') {
      if (D.phase === 'ask') { TTS.speak(w.fr); $('reveal').addEventListener('click', () => { D.phase = 'done'; A.render(); TTS.speak(ex.fr); }); }
      document.querySelectorAll('[data-grade]').forEach(b => b.addEventListener('click', () => { const g = +b.dataset.grade; A.rate(w.key, g); if (g > 0) D.ok++; next(); }));
    }
    if (v.mode === 'cloze' || v.mode === 'listenpick') {
      document.querySelectorAll('[data-ans]').forEach(b => b.addEventListener('click', () => {
        D.answer = b.dataset.ans; D.phase = 'done';
        finish(v.mode === 'cloze' ? norm(D.answer) === norm(it.gap.answer) : D.answer === ex.en);
        A.render(); TTS.speak(ex.fr);
      }));
      if (v.mode === 'listenpick' && D.phase === 'ask') TTS.speak(ex.fr);
      playBtn('play'); playBtn('slow', { slow: true });
    }
    if (v.mode === 'rebuild') {
      it.used = it.used || {};
      document.querySelectorAll('[data-build]').forEach(b => b.addEventListener('click', () => { const i = +b.dataset.build; it.used[i] = true; it.built.push(it.toks[i]); it.order = it.order || []; it.order.push(i); A.render(); }));
      document.querySelectorAll('[data-unbuild]').forEach(b => b.addEventListener('click', () => { const k = +b.dataset.unbuild; const i = it.order.splice(k, 1)[0]; it.used[i] = false; it.built.splice(k, 1); A.render(); }));
      if ($('clear')) $('clear').addEventListener('click', () => { it.built = []; it.order = []; it.used = {}; A.render(); });
      if ($('hear')) $('hear').addEventListener('click', () => TTS.speak(ex.fr));
      if ($('check')) $('check').addEventListener('click', () => { D.phase = 'done'; finish(norm(it.built.join(' ')) === norm(ex.fr)); A.render(); TTS.speak(ex.fr); });
    }
    if (v.mode === 'dictation') {
      playBtn('play'); playBtn('play2'); playBtn('slow', { slow: true });
      if (D.phase === 'ask') { TTS.speak(ex.fr); D.plays = 1; if ($('plays')) $('plays').textContent = '1 play'; const ta = $('dict'); ta.focus(); ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('check').click(); } }); }
      if ($('check')) $('check').addEventListener('click', () => {
        const typed = $('dict').value, r = A.dictation.compare(ex.fr, typed); D.answer = typed; // scored in app-listen.js: words missed by ear vs heard but misspelt
        D.diff = r.html; D.score = r.score; D.total = r.total; D.right = r.right; D.res = r; D.hear = (D.hear || 0) + r.hear; D.spell = (D.spell || 0) + r.spell; A.dictation.record(r);
        D.phase = 'done'; finish(D.right); A.render();
      });
    }
    if (v.mode === 'translate') {
      if ($('reveal')) $('reveal').addEventListener('click', () => { D.phase = 'done'; A.render(); TTS.speak(ex.fr); });
      document.querySelectorAll('[data-grade]').forEach(b => b.addEventListener('click', () => { finish(+b.dataset.grade > 0); next(); }));
    }
    if ($('next')) $('next').addEventListener('click', next);
  };

  // ---------- Listening ----------
  views.listen = () => {
    const S = A.state();
    return `<div class="lesson-head"><span class="eyebrow">Listening</span><h1>Passages &amp; ear training</h1>
      <p class="en">Short texts read aloud by the French voice. Listen first without the transcript, answer the questions, then read along. The drills below pull random sentences from a whole level.</p></div>
    ${A.listenHub()}
    <div class="card"><span class="eyebrow">Sentence drills by level</span>
      <div class="stack" style="margin-top:10px">${A.VLEVELS().map(L => `<div class="row"><span class="pill lvl">${L}</span><button class="btn" data-ldrill="listenpick|${L}">Listen &amp; pick</button><button class="btn" data-ldrill="dictation|${L}">Dictation</button><button class="btn" data-ldrill="rebuild|${L}">Rebuild</button></div>`).join('')}</div></div>
    ${A.VLEVELS().map(L => { const ps = A.LISTEN.filter(p => p.lvl === L); return ps.length ? `<section class="card chapter"><div class="chapter-head"><div class="lvl">${L}</div><h2>${esc((A.BOOK.find(c => c.lvl === L) || {}).title || '')}</h2><p>${ps.length} passage${ps.length > 1 ? 's' : ''}</p></div>
      <div class="lessons">${ps.map(p => { const r = S.listen[p.id]; return `<button class="passage-row" data-go="passage|${p.id}"><span><span class="t fr" style="font-size:1.15rem">${fr(p.title)}</span><br><span class="sub en num">${p.s.length} sentences · ${p.q.length} questions</span></span><span class="pill num ${r && r.score === r.total ? '' : ''}" style="${r ? (r.score === r.total ? 'background:var(--good-soft);color:var(--good)' : 'background:var(--warn-soft);color:var(--warn)') : ''}">${r ? r.score + '/' + r.total : 'new'}</span></button>`; }).join('')}</div></section>` : ''; }).join('')}`;
  };
  views.listen.after = () => { document.querySelectorAll('[data-ldrill]').forEach(b => b.addEventListener('click', () => { const [mode, lvl] = b.dataset.ldrill.split('|'); go('drill', { mode, lvl, from: 'listen' }); })); };

  let P = null;
  views.passage = v => {
    const p = A.LISTEN.find(x => x.id === v.id); if (!p) return views.listen();
    if (!P || P.id !== p.id) P = { id: p.id, show: false, en: false, slow: false, ans: {}, checked: false };
    const S = A.state(), prev = S.listen[p.id];
    return `<div class="lesson-head"><div class="row"><button class="btn ghost" data-go="listen">← Listening</button><span class="pill lvl">${p.lvl}</span>${prev ? `<span class="pill num">best ${prev.score}/${prev.total}</span>` : ''}</div><h1 class="fr" style="font-size:2rem">${fr(p.title)}</h1></div>
    <div class="card"><div class="player"><button class="btn primary" id="playAll">▶ Play all</button><button class="btn" id="slowAll" aria-pressed="${P.slow ? 'true' : 'false'}" title="In breath groups, with a pause between them" style="${P.slow ? 'background:var(--accent-soft);border-color:var(--accent)' : ''}">Slow${P.slow ? ': on' : ''}</button><label class="row" style="gap:8px;flex:1 1 160px"><span class="en">Speed</span><input type="range" id="speed" min="0.5" max="1.2" step="0.05" value="${S.settings.rate}"><span class="en num" id="speedVal">${S.settings.rate.toFixed(2)}×</span></label>
      <button class="btn" data-go="dictee|passage:${p.id}">Dictée</button><button class="btn" id="showText">${P.show ? 'Hide transcript' : 'Show transcript'}</button>${P.show ? `<button class="btn ghost" id="showEn">${P.en ? 'Hide' : 'Show'} English</button>` : ''}</div>
      <div id="sents" data-slow="${P.slow ? '1' : ''}" style="margin-top:12px">${p.s.map((s, i) => `<div class="sent" id="s${i}">${speakBtn(s)}<div>${P.show ? `<div class="fr">${fr(s)}</div>${P.en ? `<div class="en">${esc(p.en[i])}</div>` : ''}` : `<div class="en">Sentence ${i + 1}</div>`}</div></div>`).join('')}</div></div>
    <div class="card"><span class="eyebrow">Questions</span>
      ${p.q.map((q, qi) => `<div class="q"><div class="qt">${qi + 1}. ${esc(q.q)}</div><div class="choices">${q.o.map((o, oi) => `<button class="choice ${P.checked ? (oi === q.a ? 'ok' : (P.ans[qi] === oi ? 'ko' : '')) : ''}" style="${!P.checked && P.ans[qi] === oi ? 'background:var(--accent-soft);border-color:var(--accent)' : ''}" data-q="${qi}" data-o="${oi}" ${P.checked ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div></div>`).join('')}
      ${P.checked ? `<div class="result ${P.score === p.q.length ? 'ok' : 'ko'}">${P.score}/${p.q.length} correct</div><div class="actions"><button class="btn" id="retry">Try again</button><button class="btn primary" data-go="listen">Done</button></div>`
        : `<div class="actions"><button class="btn primary" id="checkQ" ${Object.keys(P.ans).length === p.q.length ? '' : 'disabled'}>Check answers</button></div>`}
    </div>`;
  };
  views.passage.after = v => {
    const p = A.LISTEN.find(x => x.id === v.id); if (!p) return;
    const $ = id => document.getElementById(id), S = A.state();
    const pa = $('playAll');
    pa.addEventListener('click', () => {
      if (pa.dataset.on) { TTS.stop(); pa.dataset.on = ''; pa.textContent = '▶ Play all'; document.querySelectorAll('.sent').forEach(el => el.classList.remove('active')); return; }
      pa.dataset.on = '1'; pa.textContent = '■ Stop';
      TTS.seq(p.s, { gap: 600, slow: P.slow, each: i => { document.querySelectorAll('.sent').forEach(el => el.classList.remove('active')); $('s' + i).classList.add('active'); }, end: () => { pa.dataset.on = ''; pa.textContent = '▶ Play all'; document.querySelectorAll('.sent').forEach(el => el.classList.remove('active')); } });
    });
    $('speed').addEventListener('input', e => { S.settings.rate = parseFloat(e.target.value); $('speedVal').textContent = S.settings.rate.toFixed(2) + '×'; A.save(); });
    $('showText').addEventListener('click', () => { P.show = !P.show; A.render(); });
    $('slowAll').addEventListener('click', () => { P.slow = !P.slow; TTS.stop(); A.render(); });
    if ($('showEn')) $('showEn').addEventListener('click', () => { P.en = !P.en; A.render(); });
    document.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { P.ans[+b.dataset.q] = +b.dataset.o; A.render(); }));
    if ($('checkQ')) $('checkQ').addEventListener('click', () => { P.checked = true; P.score = p.q.filter((q, i) => P.ans[i] === q.a).length; const prev = S.listen[p.id]; if (!prev || P.score >= prev.score) S.listen[p.id] = { score: P.score, total: p.q.length, at: Date.now() }; A.save(); P.show = true; A.render(); });
    if ($('retry')) $('retry').addEventListener('click', () => { P = { id: p.id, show: false, en: false, slow: false, ans: {}, checked: false }; A.render(); });
  };

  A.blankFor = blankFor; A.splitBlank = splitBlank; A.tokens = tokens; A.posClass = posClass;
  A.render();
})();
