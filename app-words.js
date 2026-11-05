/* Allons-y — word bank: some six thousand lemmas from A1 to C2, apart from the Book's lessons. The level of each word comes from FLELex
   (CEFR-graded frequencies in French-as-a-foreign-language textbooks), the order inside a level from Lexique 3 (how common the word is in
   French at large), so new words arrive most useful first. Two drills: Meaning (pick the English out of four) and Sentence (write your own
   sentence with the word, then compare it with a model). Progress has its own Leitner boxes in S.bank; the sentences you write are kept in S.sents. */
(function () {
  'use strict';
  const A = window.App, { views, esc, fr, shuffle, norm, speakBtn, TTS, go, toast } = A;
  const BL = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const IV = A.BANK_INTERVALS, DAY = A.DAY; // boxes 0–7: 0 · 1 · 3 · 7 · 14 · 30 · 60 · 120 days
  const RAW = window.FR_BANK || {};
  const BANK = [], BY = {};
  BL.forEach(L => (RAW[L] || []).forEach((e, i) => { const w = { key: e[0] + '|' + e[1], fr: e[0], pos: e[1], en: e[2], ex: e[3], exEn: e[4], lvl: L, r: i }; if (!BY[w.key]) { BY[w.key] = w; BANK.push(w); } }));
  const $ = id => document.getElementById(id);
  const S = () => A.state();
  const bank = () => { const s = S(); return s.bank || (s.bank = {}); };
  const st = w => bank()[w.key] || { b: 0, d: 0, n: 0 };
  const isDue = w => { const x = st(w); return x.n > 0 && x.d <= Date.now(); };
  const levels = () => { const l = (S().settings.bankLv || []).filter(L => BL.includes(L)); return l.length ? l : BL.filter(L => BL.indexOf(L) >= Math.max(0, BL.indexOf(S().settings.minLevel || 'A1'))); };
  const inLv = () => { const l = new Set(levels()); return BANK.filter(w => l.has(w.lvl)); };
  const roundSize = () => [10, 20, 40].includes(S().settings.bankN) ? S().settings.bankN : 20;
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const dots = w => `<span class="dots" aria-label="box ${st(w).b}"><i class="${A.boxClass(Math.min(5, st(w).b))}"></i></span>`;

  // ---------- spaced repetition ----------
  // Meaning: right the first time you ever see the word → box 4 (back in two weeks: you knew it already); right later → one box up, to box 5 at most
  // (a month: recognising a word is not yet owning it). Sentence: Good → one box up, to box 7 (four months); Hard keeps the box at half the interval.
  // Wrong or Again → box 0, back in ten minutes.
  function recognised(w, ok) {
    const x = Object.assign({ b: 0, d: 0, n: 0 }, bank()[w.key]), first = !x.n; x.n++;
    if (!ok) { x.b = 0; x.d = Date.now() + 10 * 60e3; }
    else { x.b = first ? 4 : Math.max(x.b, Math.min(5, x.b + 1)); x.d = Math.max(x.d, Date.now() + IV[x.b] * DAY); }
    bank()[w.key] = x; A.save();
  }
  function produced(w, g) {
    const x = Object.assign({ b: 0, d: 0, n: 0 }, bank()[w.key]); x.n++;
    if (g === 0) { x.b = 0; x.d = Date.now() + 10 * 60e3; }
    else if (g === 1) { x.b = Math.max(1, x.b); x.d = Date.now() + Math.max(0.5, IV[x.b] / 2) * DAY; }
    else { x.b = Math.min(7, x.b + 1); x.d = Date.now() + IV[x.b] * DAY; }
    bank()[w.key] = x; A.save();
  }

  // ---------- Meaning: three distractors of the same part of speech and level whose English shares no content word with the answer ----------
  const posClass = p => /^n\./.test(p) ? 'n' : p === 'v.' ? 'v' : p === 'adj.' ? 'adj' : p === 'adv.' ? 'adv' : 'x';
  const STOP = new Set('the and for with from into onto out off one ones someone something somebody sth sb its his her their your our this that these those not very more most less such being been have has had are was were get got make made take put give way kind sort thing things person people informal formal literary slang vulgar familiar figurative old fashioned pejorative also used about over under'.split(' '));
  const sense = w => w._c || (w._c = new Set(w.en.toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z]+/).filter(x => x.length >= 3 && !STOP.has(x)).map(x => x.replace(/(ing|ed|es|s|ly)$/, '')).filter(x => x.length >= 3)));
  const clash = (a, b) => { const sa = sense(a); if (a.en.toLowerCase() === b.en.toLowerCase()) return true; for (const x of sense(b)) if (sa.has(x)) return true; return false; };
  function options(w) {
    const cls = posClass(w.pos), out = [w], seen = new Set([w.en.toLowerCase()]);
    const take = list => { for (const c of shuffle(list)) { if (out.length >= 4) return; if (seen.has(c.en.toLowerCase()) || out.some(o => clash(o, c))) continue; seen.add(c.en.toLowerCase()); out.push(c); } };
    const near = BL.slice(Math.max(0, BL.indexOf(w.lvl) - 1), BL.indexOf(w.lvl) + 2);
    take(BANK.filter(c => c !== w && c.lvl === w.lvl && posClass(c.pos) === cls));
    if (out.length < 4) take(BANK.filter(c => c !== w && near.includes(c.lvl) && posClass(c.pos) === cls));
    if (out.length < 4) take(BANK.filter(c => c !== w && posClass(c.pos) === cls));
    if (out.length < 4) take(BANK.filter(c => c !== w));
    return shuffle(out);
  }

  // ---------- Sentence: is the word there, in any form? ----------
  const IRR = {
    etre: 'suis es est sommes etes sont etais etait etions etiez etaient ete serai seras sera serons serez seront serais serait serions seriez seraient sois soit soyons soyez soient fus fut furent',
    avoir: 'ai as a avons avez ont eu eue eus eues aurai auras aura aurons aurez auront aurais aurait aurions auriez auraient aie aies ait ayons ayez aient eut eurent',
    aller: 'vais vas va vont irai iras ira irons irez iront irais irait irions iriez iraient aille ailles aillent',
    faire: 'fais fait faisons faites font ferai feras fera ferons ferez feront ferais ferait fasse fasses fassions fassiez fassent fis fit firent',
    pouvoir: 'peux peut peuvent pu pourrai pourras pourra pourrons pourrez pourront pourrais pourrait pourrions pourriez pourraient puisse puisses puissions puissiez puissent put purent',
    vouloir: 'veux veut veulent veuille veuilles veuillez', savoir: 'sais sait su sache saches sachions sachiez sachent saurai sauras saura saurons saurez sauront saurais saurait sut surent',
    devoir: 'dois doit doivent du due dus dues doive doives dut durent', voir: 'vois voit voyons voyez voient vu vue vus vues verrai verras verra verrons verrez verront verrais verrait voie voies vit virent',
    dire: 'dis dit disons dites disent dise', mettre: 'mets met mis mise mises', boire: 'bois boit buvons buvez boivent bu bue', croire: 'crois croit croyons croyez croient cru crue',
    vivre: 'vis vit vecu vecue', naitre: 'nais nait ne nee nes nees naquit', mourir: 'meurs meurt meurent mort morte morts mortes', lire: 'lis lit lu lue', plaire: 'plais plait plu',
    pleuvoir: 'pleut plu', falloir: 'faut fallu faudra faudrait faille fallait', valoir: 'vaut vaux valu vaudra vaudrait vaille', asseoir: 'assieds assied assis assise assoit',
    suivre: 'suis suit suivi', courir: 'cours court couru', acquerir: 'acquiers acquiert acquis', emouvoir: 'emeus emeut emeuvent emu emue emus emues', mouvoir: 'meus meut meuvent mu mue', vaincre: 'vaincs vainc vainquons vainquent vaincu', convaincre: 'convaincs convainc convainquons convainquent convaincu',
    oeil: 'yeux', ciel: 'cieux', beau: 'bel belle belles beaux', nouveau: 'nouvel nouvelle nouvelles nouveaux', vieux: 'vieil vieille vieilles', fou: 'fol folle folles fous', mou: 'molle molles', bon: 'bonne bonnes meilleur meilleure', mauvais: 'pire', bien: 'mieux'
  };
  const ADJF = [['eux', 'euse'], ['if', 'ive'], ['el', 'elle'], ['en', 'enne'], ['on', 'onne'], ['er', 'ere'], ['al', 'aux'], ['ail', 'aux'], ['eau', 'eaux'], ['et', 'ete'], ['et', 'ette'], ['c', 'che'], ['c', 'que'], ['f', 've'], ['x', 'se'], ['x', 'ce'], ['eur', 'euse'], ['eur', 'rice'], ['eur', 'resse'], ['g', 'gue']];
  const parts = s => norm(s).split(/[\s'\-]+/).filter(Boolean);
  const lcp = (a, b) => { let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++; return k; };
  const conj = inf => { // every simple form the conjugator in app-forms.js gives for one verb
    const t = A.forms.table(inf), o = [inf, ...t.pr, t.pp, t.pp + 'e', t.pp + 's', t.pp + 'es', ...t.subj, ...t.imper, t.impStem('ant') + 'ant'];
    ['ais', 'ait', 'ions', 'iez', 'aient'].forEach(e => o.push(t.impStem(e) + e, t.fut + e)); ['ai', 'as', 'a', 'ons', 'ez', 'ont'].forEach(e => o.push(t.fut + e));
    return o.filter(Boolean);
  };
  const verbForms = inf => { // the conjugator knows about ninety irregular verbs and guesses regular endings for the rest; a prefixed verb it does not
    // know (prévenir, détenir, reparaître) is conjugated like the irregular verb it ends with, prefix kept, as well as the regular guess
    if (!A.forms || !A.forms.table) return [];
    const V = (window.FR_FORMS || {}).verbs || {}, out = [];
    try { out.push(...conj(inf)); } catch (e) { /* not a verb the conjugator can read */ }
    if (!V[inf]) for (let k = 1; k < inf.length - 3; k++) { const base = inf.slice(k); if (V[base]) { try { conj(base).forEach(f => out.push(inf.slice(0, k) + f)); } catch (e) { /* ignore */ } break; } }
    return out.map(norm);
  };
  const REFL = new Set(['me', 'm', 'te', 't', 'se', 's', 'nous', 'vous', 'toi']);
  // the indices (in the sentence split at spaces) of the words that are a form of w, or [] when none is
  function locate(w, sentence) {
    const words = sentence.split(/\s+/).filter(Boolean), wp = words.map(parts);
    const hit = test => words.map((_, i) => i).filter(i => wp[i].some(test));
    for (const variant of w.fr.split(' / ')) {
      const v = variant.trim().replace(/^(se |s')/, '').replace(/^(l'|le |la |les |un |une )/, ''), t = parts(v);
      if (!t.length) continue;
      if (t.length > 1) { // an expression or a compound: its words in order, each may inflect (demi-heures, sous-titré, haut-parleurs)
        const flat = [], like = (x, y) => x === y || (y.length >= 4 && lcp(x, y) >= y.length - 2 && Math.abs(x.length - y.length) <= 4) || [y + 's', y + 'x', y + 'e', y + 'es'].includes(x);
        wp.forEach((p, i) => p.forEach(x => flat.push([x, i])));
        for (let s = 0; s + t.length <= flat.length; s++) {
          if (t.every((x, k) => like(flat[s + k][0], x))) return [...new Set(flat.slice(s, s + t.length).map(f => f[1]))];
        }
        continue;
      }
      const b = t[0], cands = new Set([b, b + 's', b + 'x', b + 'e', b + 'es']);
      ADJF.forEach(([a, f]) => { if (b.endsWith(a)) { cands.add(b.slice(0, -a.length) + f); cands.add(b.slice(0, -a.length) + f + 's'); } });
      (IRR[b] || '').split(' ').forEach(x => x && cands.add(x));
      if (w.pos === 'v.') verbForms(v.trim()).forEach(x => cands.add(x));
      let found = hit(x => cands.has(x));
      if (!found.length) { const stem = b.length > 4 ? b.replace(/(oir|er|ir|re)$/, '') : b, need = Math.max(3, Math.min(stem.length, b.length - 3)); found = hit(x => lcp(x, b) >= need); }
      if (found.length) return found;
    }
    return [];
  }
  // a few things a machine can check in a sentence it does not understand: the word is there, a noun's article agrees, a pronominal verb has its pronoun
  function review(w, sentence) {
    const words = sentence.split(/\s+/).filter(Boolean), idx = locate(w, sentence), notes = [];
    if (!idx.length) { notes.push(`I can't find <b>${esc(w.fr)}</b> in your sentence in any form I recognise. If you used an irregular form, ignore this.`); return { idx, notes }; }
    const i = idx[0], before = i > 0 ? parts(words[i - 1]) : [], prev = before[before.length - 1] || '', own = parts(words[i]);
    const glued = own.length > 1 ? own[own.length - 2] : ''; // l'homme, d'un… the article glued to the word itself
    const art = glued === 'l' ? '' : prev;
    if (w.pos === 'n.m.' && ['la', 'une', 'cette'].includes(art)) notes.push(`<b>${esc(w.fr)}</b> is masculine: <span class="fi">le, un, ce</span>, not <span class="fi">${esc(art)}</span>.`);
    if (w.pos === 'n.f.' && ['le', 'un', 'ce', 'cet', 'du', 'au'].includes(art)) notes.push(`<b>${esc(w.fr)}</b> is feminine: <span class="fi">la, une, cette</span>, not <span class="fi">${esc(art)}</span>.`);
    if (/^(se |s')/.test(w.fr) && w.pos === 'v.') { // a pronoun among the three words before, or glued to the verb (s'habitue, souviens-toi)
      if (!words.slice(Math.max(0, i - 3), i).flatMap(parts).concat(own).some(x => REFL.has(x))) notes.push(`<b>${esc(w.fr)}</b> is pronominal: it needs <span class="fi">me, te, se, nous, vous</span> (<span class="fi">je me…, il s'…</span>).`);
    }
    if (words.length < 4) notes.push('Short: a sentence of five words or more shows how the word is used.');
    return { idx, notes };
  }
  const marked = (sentence, idx) => sentence.split(/\s+/).filter(Boolean).map((x, i) => idx.includes(i) ? `<mark>${esc(x)}</mark>` : esc(x)).join(' ').replace(/ ([?!;:»])/g, '\u202f$1').replace(/« /g, '«\u202f');

  // ---------- the learner's sentences ----------
  const sents = () => { const s = S(); return Array.isArray(s.sents) ? s.sents : (s.sents = []); };
  function keepSentence(w, text, g) { const list = sents(); list.push({ k: w.key, w: w.fr, s: text, t: Date.now(), g }); if (list.length > 2000) list.splice(0, list.length - 2000); A.save(); }
  const prompt = list => 'I am learning French. For each numbered line I was asked to write my own sentence with the French word given. Correct each sentence with as few changes as possible so that it is correct, natural French, and explain every change in one short line in English. If a sentence is already correct and natural, say so. If the word is used with the wrong meaning or register, say how it is really used and give one better example.\n\n'
    + list.map((x, i) => { const w = BY[x.k]; return (i + 1) + '. ' + x.w + (w ? ' (' + w.pos + ' ' + w.en + ', ' + w.lvl + ')' : '') + ': ' + x.s; }).join('\n');
  function copy(text, box) {
    const fallback = () => { if (box) { box.hidden = false; box.value = text; box.focus(); box.select(); toast('Select all and copy'); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('Copied: paste it to any assistant')).catch(fallback); else fallback();
  }

  // ---------- rounds ----------
  function meaningRound() {
    const pool = inLv(), now = Date.now(), N = roundSize();
    const due = pool.filter(isDue).sort((a, b) => st(a).d - st(b).d).slice(0, N);
    const fresh = due.length < N ? pool.filter(w => !st(w).n).slice(0, N - due.length) : [];
    return shuffle(due).concat(fresh).map(w => ({ w, fresh: !st(w).n, opts: null, t: now }));
  }
  function sentenceRound(keys) {
    if (keys) return keys.map(k => BY[k]).filter(Boolean).map(w => ({ w }));
    const pool = inLv(), N = Math.max(5, Math.round(roundSize() / 2.5));
    const met = pool.filter(w => st(w).n > 0);
    const due = met.filter(isDue).sort((a, b) => st(a).d - st(b).d);
    const rest = met.filter(w => !isDue(w)).sort((a, b) => st(a).b - st(b).b || (st(a).d - IV[st(a).b] * DAY) - (st(b).d - IV[st(b).b] * DAY));
    let list = due.concat(rest).slice(0, N);
    if (list.length < N) list = list.concat(pool.filter(w => !st(w).n).slice(0, N - list.length));
    return shuffle(list).map(w => ({ w }));
  }
  let R = null; // the running round: {v, items, i, ok, phase, answer, again}

  views.wdrill = v => {
    if (!R || R.v !== v) R = { v, items: v.mode === 'mean' ? meaningRound() : sentenceRound(v.keys), i: 0, ok: 0, phase: 'ask', answer: null, requeued: new Set(), wrote: [] };
    const it = R.items[R.i], back = v.back || 'words';
    const head = `<div class="drill-head"><button class="btn ghost" data-go="${back}">← Back</button><div class="bar"><i style="width:${(R.i / Math.max(1, R.items.length)) * 100}%"></i></div><span class="en num">${Math.min(R.i + 1, R.items.length)}/${R.items.length}</span></div>`;
    const title = v.mode === 'mean' ? 'Meaning' : 'Sentence';
    if (!R.items.length) return `${head}<div class="card done"><span class="eyebrow">${title}</span><p class="en">Nothing to practise in ${levels().join(', ')}: no word is due and every word has been seen. Pick more levels on the Words page.</p><div class="row"><button class="btn" data-go="words">Back</button></div></div>`;
    if (!it) {
      if (v.mode === 'mean') {
        const total = R.items.length - R.requeued.size, pct = total ? Math.round((R.ok / total) * 100) : 0, missed = [...R.requeued].map(k => BY[k]);
        return `${head}<div class="card done"><span class="eyebrow">Meaning</span><b class="num">${R.ok}/${total}</b><p class="en">${pct === 100 ? 'All right the first time.' : pct >= 70 ? 'Good. The misses are back in box 0 and come up again soon.' : 'The words you missed are back in box 0 and come up again soon.'}</p>
          ${missed.length ? `<div class="stack" style="text-align:left;width:100%">${missed.map(w => `<div class="row"><span class="fr">${fr(w.fr)}</span>${speakBtn(w.fr)}<span class="en">${esc(w.en)}</span></div>`).join('')}</div>` : ''}
          <div class="row"><button class="btn primary" id="again">Next round</button><button class="btn" data-go="words">Done</button></div></div>`;
      }
      return `${head}<div class="card done"><span class="eyebrow">Sentence</span><b class="num">${R.wrote.length}</b><p class="en">${R.wrote.length ? plural(R.wrote.length, 'sentence') + ' written. A machine can only check the obvious: for a real correction, copy them to any assistant.' : 'No sentences written this round.'}</p>
        ${R.wrote.length ? `<div class="stack" style="text-align:left;width:100%">${R.wrote.map(x => `<div><span class="pill">${esc(x.w)}</span> <span class="fr">${fr(x.s)}</span> ${speakBtn(x.s)}</div>`).join('')}</div>
        <div class="row"><button class="btn" id="copyRound">Copy for correction</button></div><textarea class="dict" id="copyBox" hidden readonly style="min-height:160px;font-family:var(--font-ui);font-size:.9rem"></textarea>` : ''}
        <div class="row"><button class="btn primary" id="again">${v.keys ? 'Write another' : 'Next round'}</button><button class="btn" data-go="${back}">Done</button></div></div>`;
    }
    const w = it.w, x = st(w), done = R.phase === 'done';
    const tags = `<div class="row"><span class="pill lvl">${w.lvl}</span>${x.n ? `<span class="pill num">box ${x.b}</span>` : '<span class="pill">new</span>'}</div>`;
    if (v.mode === 'mean') {
      if (!it.opts) it.opts = options(w);
      const right = done && R.answer === w.key;
      return `${head}<div class="card">
        <div class="wq">${tags.replace('class="row"', 'class="row" style="justify-content:center"')}
        <div><span class="fr">${fr(w.fr)}</span> ${speakBtn(w.fr)}</div><div class="pos">${esc(w.pos)}</div></div>
        <div class="choices">${it.opts.map((o, i) => `<button class="choice ${done ? (o === w ? 'ok' : (o.key === R.answer ? 'ko' : '')) : ''}" data-wopt="${esc(o.key)}" ${done ? 'disabled' : ''}><span class="num" style="color:var(--faint);margin-right:8px">${i + 1}</span>${esc(o.en)}</button>`).join('')}</div>
        ${done ? `<div class="result ${right ? 'ok' : 'ko'}">${right ? (it.fresh ? 'Correct, first time: back in two weeks' : 'Correct') : 'Not this time: it comes back at the end of the round'}
          <span class="fr" style="margin-top:6px">${fr(w.ex)} ${speakBtn(w.ex)}</span><span class="en">${esc(w.exEn)}</span></div>
          <div class="actions"><button class="btn ghost" id="toSent" title="Write your own sentence with this word">Write a sentence</button><button class="btn primary" id="next">Next</button></div>` : ''}
      </div>`;
    }
    const rv = done && it.text ? review(w, it.text) : null;
    return `${head}<div class="card">
      ${tags}
      <div class="word-head" style="margin-top:8px"><span class="fr">${fr(w.fr)}</span>${speakBtn(w.fr)}<span class="pos">${esc(w.pos)}</span><span class="meaning">${esc(w.en)}</span></div>
      <p class="hint">Write a sentence of your own with <b>${esc(w.fr)}</b>, in any form. Say it aloud as you write.</p>
      <textarea class="dict" id="sent" placeholder="Votre phrase…" ${done ? 'disabled' : ''} autocapitalize="sentences" autocomplete="off" spellcheck="false">${esc(it.text || '')}</textarea>
      ${done ? `${it.text ? `<div class="result" style="background:var(--surface-2);color:var(--fg)"><span class="eyebrow">Yours</span><span class="fr" style="display:block;margin-top:4px">${marked(it.text, rv.idx)} ${speakBtn(it.text)}</span>
          ${rv.notes.length ? `<ul class="wnotes">${rv.notes.map(n => `<li>${n}</li>`).join('')}</ul>` : `<span class="en" style="display:block;margin-top:6px">${esc(w.fr)} is there. Compare with the model and read both aloud.</span>`}</div>` : ''}
        <div class="result" style="background:var(--accent-soft);color:var(--fg)"><span class="eyebrow">Model</span><span class="fr" style="display:block;margin-top:4px">${fr(w.ex)} ${speakBtn(w.ex)}</span><span class="en">${esc(w.exEn)}</span></div>
        <div class="rate"><button class="again" data-wgrade="0">Again<small>${it.text ? 'wrong use' : "couldn't"}</small></button><button class="hard" data-wgrade="1">Hard<small>unsure</small></button><button class="good" data-wgrade="2">Good<small>used it right</small></button></div>`
        : `<div class="actions"><button class="btn ghost" id="skip">Skip</button><button class="btn primary" id="check">Check</button></div>`}
    </div>`;
  };
  views.wdrill.after = v => {
    const it = R && R.items[R.i];
    if ($('again')) $('again').addEventListener('click', () => go('wdrill', Object.assign({}, v)));
    if ($('copyRound')) $('copyRound').addEventListener('click', () => copy(prompt(R.wrote), $('copyBox')));
    if (!it) return;
    const w = it.w;
    const next = () => { R.i++; R.phase = 'ask'; R.answer = null; TTS.stop(); A.render(); window.scrollTo(0, 0); };
    if (v.mode === 'mean') {
      if (R.phase === 'ask') TTS.speak(w.fr);
      document.querySelectorAll('[data-wopt]').forEach(b => b.addEventListener('click', () => {
        if (R.phase !== 'ask') return;
        R.answer = b.dataset.wopt; R.phase = 'done'; const ok = R.answer === w.key;
        if (!R.requeued.has(w.key)) { recognised(w, ok); if (ok) R.ok++; }
        if (!ok && !R.requeued.has(w.key)) { R.requeued.add(w.key); R.items.push({ w, fresh: false, opts: null }); }
        A.render(); TTS.speak(w.ex);
      }));
      if ($('toSent')) $('toSent').addEventListener('click', () => go('wdrill', { mode: 'sent', keys: [w.key] }));
    } else {
      const ta = $('sent');
      if (R.phase === 'ask') {
        ta.focus();
        ta.addEventListener('input', () => { it.text = ta.value; $('check').textContent = ta.value.trim() ? 'Check' : 'Show the model'; });
        ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('check').click(); } });
        $('check').textContent = ta.value.trim() ? 'Check' : 'Show the model';
        $('check').addEventListener('click', () => { it.text = ta.value.replace(/\s+/g, ' ').trim(); R.phase = 'done'; A.render(); });
        $('skip').addEventListener('click', next);
      }
      document.querySelectorAll('[data-wgrade]').forEach(b => b.addEventListener('click', () => {
        const g = +b.dataset.wgrade; produced(w, g);
        if (it.text) { keepSentence(w, it.text, g); R.wrote.push({ k: w.key, w: w.fr, s: it.text }); }
        next();
      }));
    }
    if ($('next')) $('next').addEventListener('click', next);
  };
  // keys: 1–4 pick a meaning; 1–3 rate a sentence (outside the text box)
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) return;
    const n = +e.key; if (!(n >= 1 && n <= 4)) return;
    const opt = document.querySelectorAll('[data-wopt]:not([disabled])')[n - 1] || (n <= 3 && document.querySelector(`[data-wgrade="${n - 1}"]`));
    if (opt) { e.preventDefault(); opt.click(); }
  });

  // ---------- the Words page ----------
  function counts(list) { let started = 0, known = 0, due = 0; const now = Date.now(); list.forEach(w => { const x = st(w); if (x.n) { started++; if (x.b >= 3) known++; if (x.d <= now) due++; } }); return { total: list.length, started, known, due }; }
  views.words = () => {
    const sel = new Set(levels()), pool = inLv(), c = counts(pool), N = roundSize();
    const nNew = Math.max(0, Math.min(N - Math.min(N, c.due), c.total - c.started)), nSent = sents().length;
    const rows = BL.map(L => { const k = counts(BANK.filter(w => w.lvl === L)); return { L, k }; });
    return `<div class="lesson-head"><span class="eyebrow">Word bank</span><h1>${BANK.length.toLocaleString('en')} words, A1 to C2</h1>
      <p class="en">Apart from the Book. Each word has a meaning and a model sentence; new words come most common first. Pick the levels you want to work on.</p></div>
    <div class="row" role="group" aria-label="Levels">${BL.map(L => `<button class="btn ${sel.has(L) ? 'on' : ''}" data-wlv="${L}" aria-pressed="${sel.has(L)}">${L}</button>`).join('')}
      <label class="row" style="gap:6px;margin-left:auto"><span class="en" style="font-size:.9rem">Round</span><select id="wN">${[10, 20, 40].map(n => `<option value="${n}" ${n === N ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
    <div class="summary">
      <div class="stat"><b class="num">${c.due}</b><span>due now</span></div>
      <div class="stat"><b class="num">${c.total - c.started}</b><span>new, not yet seen</span></div>
      <div class="stat"><b class="num">${c.known}<span style="font-size:1rem;color:var(--muted)"> / ${c.total}</span></b><span>known (box 3+)</span></div>
    </div>
    <div class="modes" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
      <button class="mode" data-wmode="mean"><b>Meaning</b><span>${c.due || nNew ? `${Math.min(N, c.due)} due${nNew ? ' + ' + nNew + ' new' : ''} · pick the English` : 'nothing due or new'}</span></button>
      <button class="mode" data-wmode="sent"><b>Sentence</b><span>Write your own sentence with the word</span></button>
      <button class="mode" data-go="wlist"><b>Browse</b><span>Search, listen, read the examples</span></button>
      <button class="mode" data-go="wsents"><b>My sentences</b><span>${nSent ? plural(nSent, 'sentence') + ' · copy for correction' : 'What you write is kept here'}</span></button>
    </div>
    <div class="card"><span class="eyebrow">By level</span><div class="stack" style="margin-top:10px">${rows.map(({ L, k }) => `<div class="row"><span class="pill lvl" style="min-width:36px;text-align:center">${L}</span><div class="bar grow"><i class="${k.known === k.total ? 'good' : ''}" style="width:${k.total ? (k.known / k.total) * 100 : 0}%"></i></div><span class="en num" style="font-size:.9rem;min-width:150px;text-align:right">${k.known} / ${k.total} known${k.due ? ' · ' + k.due + ' due' : ''}</span></div>`).join('')}</div></div>
    <details class="card sec"><summary><span class="eyebrow">How it works</span></summary><div class="notes">
      <p><b>Meaning</b> shows a French word; pick its English out of four. Due words come first, then new ones, the most common first. A word you get right the first time you ever see it goes straight to box 4 and comes back in two weeks: you knew it already. After that each right answer moves it one box up, to box 5 (a month) at most. A miss sends it to box 0 and it comes back at the end of the round.</p>
      <p style="margin-top:8px"><b>Sentence</b> gives you a word you have met and asks for a sentence of your own. Check looks for the word in any form, the article of a noun, the pronoun of a pronominal verb; then you compare with a model and rate yourself. Only this drill takes a word past a month, up to four months: a word you can use is a word you own. Copy your sentences to any assistant for a real correction.</p>
      <p style="margin-top:8px">Boxes: 0 · 1 day · 3 days · a week · two weeks · a month · two months · four months. Keys: 1 to 4 pick, Enter goes on.</p>
      <p style="margin-top:8px;color:var(--faint);font-size:.88rem">Levels from FLELex (Pintard &amp; François 2020, CC BY-NC-SA 4.0), order from Lexique 3.83 (New &amp; Pallier, CC BY-SA 4.0); meanings and sentences written for this app.</p></div></details>`;
  };
  views.words.after = () => {
    document.querySelectorAll('[data-wlv]').forEach(b => b.addEventListener('click', () => {
      const cur = new Set(levels()), L = b.dataset.wlv; if (cur.has(L)) cur.delete(L); else cur.add(L);
      if (!cur.size) { toast('Keep at least one level'); return; }
      S().settings.bankLv = BL.filter(x => cur.has(x)); A.save(); A.render();
    }));
    $('wN').addEventListener('change', e => { S().settings.bankN = +e.target.value; A.save(); A.render(); });
    document.querySelectorAll('[data-wmode]').forEach(b => b.addEventListener('click', () => go('wdrill', { mode: b.dataset.wmode })));
  };

  // ---------- Browse ----------
  const B = { lv: '', q: '', f: 'all', n: 100 };
  const FILTERS = { all: ['All', () => true], new: ['New', w => !st(w).n], learning: ['Learning', w => st(w).n > 0 && st(w).b < 3], known: ['Known', w => st(w).b >= 3], due: ['Due', isDue] };
  function browseList() {
    const q = norm(B.q.trim()), ql = B.q.trim().toLowerCase(), f = FILTERS[B.f][1];
    const all = BANK.filter(w => (!B.lv || w.lvl === B.lv) && f(w) && (!q || norm(w.fr).includes(q) || w.en.toLowerCase().includes(ql)));
    if (q) all.sort((a, b) => (norm(b.fr).startsWith(q) - norm(a.fr).startsWith(q)) || BL.indexOf(a.lvl) - BL.indexOf(b.lvl) || a.r - b.r);
    const shown = all.slice(0, B.n);
    return `<p class="en num" style="font-size:.9rem">${all.length.toLocaleString('en')} word${all.length === 1 ? '' : 's'}${all.length > shown.length ? ', first ' + shown.length + ' shown' : ''}</p>
      <div class="gloss">${shown.map(w => `<details class="g wrow"><summary class="g-head"><span class="fr">${fr(w.fr)}</span>${speakBtn(w.fr)}<span class="pos">${esc(w.pos)}</span><span class="meaning">${esc(w.en)}</span><span class="pill lvl" style="margin-left:auto">${w.lvl}</span>${dots(w)}</summary>
        <div class="ex-line">${speakBtn(w.ex)}<span class="fr">${fr(w.ex)}</span></div><div class="en" style="margin:2px 0 0 40px;font-size:.92rem">${esc(w.exEn)}</div>
        <div class="row" style="margin-top:6px;justify-content:flex-end"><button class="btn ghost" data-wsent="${esc(w.key)}">Write a sentence</button></div></details>`).join('')}</div>
      ${all.length > shown.length ? '<div class="row" style="justify-content:center"><button class="btn" id="wmore">Show more</button></div>' : ''}`;
  }
  views.wlist = () => `<div class="lesson-head"><div class="row"><button class="btn ghost" data-go="words">← Words</button></div><h1>Browse the bank</h1></div>
    <div class="row"><input type="text" id="wq" class="grow" placeholder="Search French or English" value="${esc(B.q)}" autocomplete="off" autocapitalize="off" spellcheck="false" style="min-width:180px">
      <select id="wlv" aria-label="Level"><option value="">All levels</option>${BL.map(L => `<option ${B.lv === L ? 'selected' : ''}>${L}</option>`).join('')}</select>
      <select id="wf" aria-label="Status">${Object.entries(FILTERS).map(([k, v]) => `<option value="${k}" ${B.f === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div>
    <div class="card" id="wlistBox">${browseList()}</div>`;
  views.wlist.after = () => {
    const box = $('wlistBox'), redraw = () => { box.innerHTML = browseList(); wire(); };
    const wire = () => {
      box.querySelectorAll('[data-wsent]').forEach(b => b.addEventListener('click', () => go('wdrill', { mode: 'sent', keys: [b.dataset.wsent], back: 'wlist' })));
      if ($('wmore')) $('wmore').addEventListener('click', () => { B.n += 200; redraw(); });
    };
    wire();
    box.addEventListener('click', e => { if (e.target.closest('summary [data-say]')) e.preventDefault(); }); // the word's speaker in a row's head speaks without opening the row
    let t = null; $('wq').addEventListener('input', e => { B.q = e.target.value; B.n = 100; clearTimeout(t); t = setTimeout(redraw, 120); });
    $('wlv').addEventListener('change', e => { B.lv = e.target.value; B.n = 100; redraw(); });
    $('wf').addEventListener('change', e => { B.f = e.target.value; B.n = 100; redraw(); });
  };

  // ---------- My sentences ----------
  views.wsents = () => {
    const list = sents().slice().reverse(), day = t => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    let last = '';
    return `<div class="lesson-head"><div class="row"><button class="btn ghost" data-go="words">← Words</button></div><h1>My sentences</h1>
      <p class="en">Everything you wrote in Sentence, newest first. Copy a batch and paste it to any assistant for a correction.</p></div>
    ${list.length ? `<div class="row"><button class="btn primary" id="copy20">Copy the latest ${Math.min(20, list.length)} for correction</button></div><textarea class="dict" id="copyBox" hidden readonly style="min-height:160px;font-family:var(--font-ui);font-size:.9rem"></textarea>` : ''}
    <div class="card">${list.length ? list.map((x, i) => { const d = day(x.t), h = d !== last ? `<p class="eyebrow" style="margin-top:${i ? 14 : 0}px">${esc(d)}</p>` : ''; last = d; const w = BY[x.k];
      return `${h}<div class="sent" style="grid-template-columns:32px 1fr auto">${speakBtn(x.s)}<div><div class="fr">${fr(x.s)}</div><div class="en" style="font-size:.88rem">${esc(x.w)}${w ? ' · ' + esc(w.en) : ''}${x.g === 0 ? ' · again' : x.g === 1 ? ' · hard' : ''}</div></div><button class="btn ghost" data-wdel="${x.t}" title="Delete" aria-label="Delete">×</button></div>`; }).join('')
      : '<p class="en">Nothing yet. The sentences you write in the Sentence drill are kept here.</p>'}</div>`;
  };
  views.wsents.after = () => {
    if ($('copy20')) $('copy20').addEventListener('click', () => copy(prompt(sents().slice(-20)), $('copyBox')));
    document.querySelectorAll('[data-wdel]').forEach(b => b.addEventListener('click', () => { const t = +b.dataset.wdel, list = sents(), i = list.findIndex(x => x.t === t); if (i >= 0) { list.splice(i, 1); A.save(); A.render(); } }));
  };

  // ---------- the Review page mentions the bank ----------
  const baseReview = views.review, baseAfter = views.review.after;
  views.review = v => { const due = BANK.filter(isDue).length; return baseReview(v) + (due ? `<button class="read-card" data-go="words"><span class="eyebrow">Word bank</span><span class="t">${plural(due, 'word')} due</span><span class="sub en">Meaning and Sentence drills on the Words page</span></button>` : ''); };
  views.review.after = baseAfter;

  A.bank = { BANK, BY, BL, st, isDue, recognised, produced, options, clash, locate, review, meaningRound, sentenceRound, prompt, levels, counts, state: () => R };
})();
