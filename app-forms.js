/* Allons-y — forms in sentences: a conjugator, verb items generated from sentence frames, hand-written agreement items,
   and one drill in two modes: write the form from a cue, or hear the whole sentence and write the form the ear caught. */
(function () {
  'use strict';
  const A = window.App, { views, esc, fr, speakBtn, TTS, go } = A;
  const D = window.FR_FORMS || { verbs: {}, frames: [], items: [] };
  const $ = id => document.getElementById(id), rnd = n => Math.floor(Math.random() * n), pick = a => a[rnd(a.length)];
  const VOW = /^[aeiouyàâäéèêëîïôöùûüœh]/i, CONS = '[^aeiouyéèêâîôûœ]';

  // ---------- conjugator ----------
  const T = { pr: 'présent', pc: 'passé composé', imp: 'imparfait', fut: 'futur simple', cond: 'conditionnel présent', subj: 'subjonctif présent', imper: 'impératif', pqp: 'plus-que-parfait' };
  const END = { imp: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'], fut: ['ai', 'as', 'a', 'ons', 'ez', 'ont'], subj: ['e', 'es', 'e', 'ions', 'iez', 'ent'] };
  const soft = (stem, e) => /^[aoâ]/.test(e) ? stem.replace(/g$/, 'ge').replace(/c$/, 'ç') : stem; // mangeons, commençais, but mangions
  // the stem of the forms whose ending is silent (je, tu, il, ils in the present; the future and conditional): e → è, é → è, y → i, or a doubled consonant
  const shifted = (inf, v) => {
    const s = inf.slice(0, -2);
    if (v.dbl) return s + s.slice(-1);
    if (/yer$/.test(inf)) return s.slice(0, -1) + 'i';
    if (new RegExp('e' + CONS + 'er$').test(inf)) return s.slice(0, -2) + 'è' + s.slice(-1);
    if (new RegExp('é' + CONS + '+er$').test(inf)) return s.replace(new RegExp('é(' + CONS + '+)$'), 'è$1');
    return s;
  };
  const CLS = { // irregular patterns worked out from the infinitive: present (6), participle, future stem
    venir: i => { const s = i.slice(0, -4); return { pr: [s + 'iens', s + 'iens', s + 'ient', s + 'enons', s + 'enez', s + 'iennent'], pp: s + 'enu', fut: s + 'iendr' }; },
    prendre: i => { const s = i.slice(0, -3); return { pr: [s + 'ds', s + 'ds', s + 'd', s + 'ons', s + 'ez', s + 'nent'], pp: i.slice(0, -5) + 'is' }; },
    mettre: i => { const s = i.slice(0, -3); return { pr: [s + 's', s + 's', s, s + 'tons', s + 'tez', s + 'tent'], pp: i.slice(0, -5) + 'is' }; },
    tir: i => { const s = i.slice(0, -2), h = s.slice(0, -1); return { pr: [h + 's', h + 's', h + 't', s + 'ons', s + 'ez', s + 'ent'], pp: s + 'i' }; },
    aitre: i => { const s = i.slice(0, -5); return { pr: [s + 'ais', s + 'ais', s + 'aît', s + 'aissons', s + 'aissez', s + 'aissent'], pp: s + 'u' }; },
    ire: i => { const s = i.slice(0, -2); return { pr: [s + 's', s + 's', s + 't', s + 'vons', s + 'vez', s + 'vent'], pp: s + 't' }; },
    uire: i => { const s = i.slice(0, -2); return { pr: [s + 's', s + 's', s + 't', s + 'sons', s + 'sez', s + 'sent'], pp: s + 't' }; },
    indre: i => { const s = i.slice(0, -4); return { pr: [s + 'ns', s + 'ns', s + 'nt', s + 'gnons', s + 'gnez', s + 'gnent'], pp: s + 'nt' }; },
    cevoir: i => { const s = i.slice(0, -6); return { pr: [s + 'çois', s + 'çois', s + 'çoit', s + 'cevons', s + 'cevez', s + 'çoivent'], pp: s + 'çu', fut: s + 'cevr' }; },
    vrir: i => { const s = i.slice(0, -2); return { pr: [s + 'e', s + 'es', s + 'e', s + 'ons', s + 'ez', s + 'ent'], pp: s.slice(0, -1) + 'ert' }; }
  };
  const regular = (inf, v) => {
    if (/er$/.test(inf)) { const s = inf.slice(0, -2), sh = shifted(inf, v); return { pr: [sh + 'e', sh + 'es', sh + 'e', soft(s, 'ons') + 'ons', s + 'ez', sh + 'ent'], pp: s + 'é', fut: new RegExp('é' + CONS + '+er$').test(inf) ? inf : sh + 'er', impStem: e => soft(s, e) }; }
    if (/ir$/.test(inf)) { const s = inf.slice(0, -2); return { pr: [s + 'is', s + 'is', s + 'it', s + 'issons', s + 'issez', s + 'issent'], pp: s + 'i', fut: inf }; }
    const s = inf.slice(0, -2); return { pr: [s + 's', s + 's', s, s + 'ons', s + 'ez', s + 'ent'], pp: s + 'u', fut: inf.slice(0, -1) };
  };
  const tables = {};
  const table = inf => { // every stem of one (non-reflexive) verb
    if (tables[inf]) return tables[inf];
    const v = D.verbs[inf] || {}, base = v.cls ? CLS[v.cls](inf) : regular(inf, v);
    const pr = v.pr || base.pr, pp = v.pp || base.pp, fut = v.fut || base.fut || inf.replace(/e$/, ''), nous = pr[3] || '';
    const impStem = e => v.imp ? v.imp : base.impStem ? base.impStem(e) : nous.slice(0, -3);
    let subj;
    if (Array.isArray(v.subj)) subj = v.subj;
    else if (typeof v.subj === 'string') subj = END.subj.map(e => v.subj + e);
    else { const st = (pr[5] || '').slice(0, -3); subj = END.subj.map((e, i) => i === 3 || i === 4 ? impStem(e) + e : st + e); }
    const imper = v.imper || [(/er$/.test(inf) || v.cls === 'vrir') ? pr[1].replace(/s$/, '') : pr[1], pr[3], pr[4]];
    return (tables[inf] = { inf, pr, pp, fut, impStem, subj, imper, aux: v.aux || 'avoir' });
  };
  const simple = (t, tense, p) => tense === 'pr' ? t.pr[p] : tense === 'imp' ? t.impStem(END.imp[p]) + END.imp[p] : tense === 'fut' ? t.fut + END.fut[p] : tense === 'cond' ? t.fut + END.imp[p] : tense === 'subj' ? t.subj[p] : null;
  const splitRefl = inf => { const m = inf.match(/^s(?:e |')(.*)$/); return m ? { refl: true, base: m[1] } : { refl: false, base: inf }; };
  const REFL = ['me', 'te', 'se', 'nous', 'vous', 'se'], TONIC = ['', 'toi', '', 'nous', 'vous', ''];
  // the verb group for one subject: a list of accepted spellings (gender or number of the subject unknown → every agreement) and the one shown
  const group = (inf, tense, p, o) => {
    const { refl, base } = splitRefl(inf), t = table(base), compound = tense === 'pc' || tense === 'pqp', etre = refl || t.aux === 'être';
    const genders = o.g ? [o.g] : ['m', 'f'], numbers = p >= 3 ? (o.vous ? ['p', 's'] : ['p']) : ['s'];
    const make = (g, n) => {
      let words, pron = refl ? (tense === 'imper' ? (o.neg ? REFL[p] : '') : REFL[p]) : '';
      if (compound) { const aux = table(etre ? 'être' : 'avoir'); words = [tense === 'pc' ? aux.pr[p] : simple(aux, 'imp', p), etre ? t.pp + (g === 'f' ? 'e' : '') + (n === 'p' ? 's' : '') : t.pp]; }
      else if (tense === 'imper') { const f = t.imper[{ 1: 0, 3: 1, 4: 2 }[p]]; if (refl && !o.neg) return f + '-' + TONIC[p]; words = [f]; }
      else words = [simple(t, tense, p)];
      const toks = [];
      if (o.neg) toks.push('ne');
      if (pron) toks.push(pron);
      toks.push(words[0]);
      if (o.neg) toks.push('pas');
      toks.push(...words.slice(1));
      for (let i = 0; i < toks.length - 1; i++) if (/^(ne|me|te|se)$/.test(toks[i]) && VOW.test(toks[i + 1])) toks[i] = toks[i][0] + "'";
      return toks.join(' ').replace(/' /g, "'");
    };
    const all = []; genders.forEach(g => numbers.forEach(n => { const f = make(g, n); if (!all.includes(f)) all.push(f); }));
    return { answers: all, text: all[0] };
  };

  // ---------- subjects and frames ----------
  const SUBJ = [
    { w: 'je', p: 0, en: 'I', o: 'me', pron: 1 }, { w: 'tu', p: 1, en: 'you', o: 'you', pron: 1 },
    { w: 'il', p: 2, g: 'm', en: 'he', o: 'him', pron: 1 }, { w: 'elle', p: 2, g: 'f', en: 'she', o: 'her', pron: 1 }, { w: 'on', p: 2, g: 'm', en: 'we', o: 'us', pron: 1, on: 1 },
    { w: 'nous', p: 3, en: 'we', o: 'us', pron: 1 }, { w: 'vous', p: 4, en: 'you', o: 'you', pron: 1, vous: 1 },
    { w: 'ils', p: 5, g: 'm', en: 'they', o: 'them', pron: 1 }, { w: 'elles', p: 5, g: 'f', en: 'they', o: 'them', pron: 1 },
    { w: 'Marie', p: 2, g: 'f', en: 'Marie', o: 'Marie' }, { w: 'Paul', p: 2, g: 'm', en: 'Paul', o: 'Paul' }, { w: 'ma sœur', p: 2, g: 'f', en: 'my sister', o: 'my sister' }, { w: 'mon frère', p: 2, g: 'm', en: 'my brother', o: 'my brother' },
    { w: 'les enfants', p: 5, g: 'm', en: 'the children', o: 'the children' }, { w: 'mes parents', p: 5, g: 'm', en: 'my parents', o: 'my parents' }, { w: 'Marie et Julie', p: 5, g: 'f', en: 'Marie and Julie', o: 'Marie and Julie' }, { w: 'Paul et Lucas', p: 5, g: 'm', en: 'Paul and Lucas', o: 'Paul and Lucas' }, { w: 'les filles', p: 5, g: 'f', en: 'the girls', o: 'the girls' }
  ];
  const POS = { mon: ['mon', 'ton', 'son', 'notre', 'votre', 'leur'], ma: ['ma', 'ta', 'sa', 'notre', 'votre', 'leur'], mes: ['mes', 'tes', 'ses', 'nos', 'vos', 'leurs'] };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const pool = f => { // the subjects a frame allows
    const [tense, inf, text, , o = {}] = f, { refl, base } = splitRefl(inf);
    if (tense === 'imper') return SUBJ.filter(s => [1, 3, 4].includes(s.p) && (!o.s || o.s.includes(s.w)));
    if (text.indexOf('{S}') < 0) return SUBJ.filter(s => s.w === 'il');
    let ps = SUBJ.filter(s => !o.s ? true : Array.isArray(o.s) ? o.s.includes(s.w) : o.s === 'pron' ? s.pron : /^not:/.test(o.s) ? !o.s.slice(4).split(',').includes(s.w) : true); // s: a list of subjects, 'pron', or 'not:je,nous'
    if ((tense === 'pc' || tense === 'pqp') && (refl || table(base).aux === 'être')) ps = ps.filter(s => !s.on);
    return ps;
  };
  const hint = (inf, tense, p) => { // the rule behind the form, in one line
    const { refl, base } = splitRefl(inf), t = table(base), etre = refl || t.aux === 'être';
    if (tense === 'pc' || tense === 'pqp') return (etre ? (refl ? 'A reflexive verb takes être, and the participle agrees with the subject.' : 'A verb of movement or change takes être: the participle agrees with the subject.') : 'With avoir the participle does not agree with the subject.') + (tense === 'pqp' ? ' The auxiliary is in the imparfait.' : '');
    if (tense === 'imp') return 'Imparfait: the stem of nous in the present (' + t.pr[3] + ' → ' + t.impStem('ais') + '-) with -ais, -ais, -ait, -ions, -iez, -aient.' + (t.impStem('ais') !== t.impStem('ions') ? ' The ç or ge appears only before a.' : '');
    if (tense === 'fut' || tense === 'cond') return (tense === 'fut' ? 'Futur simple' : 'Conditionnel') + ': the stem ' + t.fut + '- with ' + (tense === 'fut' ? '-ai, -as, -a, -ons, -ez, -ont.' : 'the imparfait endings -ais, -ais, -ait, -ions, -iez, -aient.') + (t.fut !== base.replace(/e$/, '') ? ' The stem is irregular.' : '');
    if (tense === 'subj') return 'Subjonctif: the stem of ils in the present with -e, -es, -e, -ions, -iez, -ent; nous and vous look like the imparfait.' + (D.verbs[base] && D.verbs[base].subj ? ' This verb has its own subjunctive stem.' : '');
    if (tense === 'imper') return 'Impératif: the present form without the subject; an -er verb loses the -s of tu.' + (refl ? ' The reflexive pronoun follows with a hyphen (toi, not te), but comes before the verb in the negative.' : '');
    if (/cer$/.test(base) && p === 3) return '-cer: the c takes a cedilla before o to stay soft.';
    if (/ger$/.test(base) && p === 3) return '-ger: an e is kept before o to keep the g soft.';
    if (D.verbs[base] && D.verbs[base].dbl && [0, 1, 2, 5].includes(p)) return 'appeler, jeter: the consonant doubles when the ending is silent.';
    if (/yer$/.test(base) && [0, 1, 2, 5].includes(p)) return '-yer: y becomes i before a silent e.';
    if (new RegExp('[eé]' + CONS + '+er$').test(base) && [0, 1, 2, 5].includes(p) && table(base).pr[0] !== base.slice(0, -2) + 'e') return 'The e before the silent ending opens to è (lever → lève, préférer → préfère).';
    if (refl) return 'Reflexive: the pronoun matches the subject (me, te, se, nous, vous, se), and elides before a vowel.';
    return 'Présent: ' + (t.pr.filter(Boolean).join(', ')) + '.';
  };
  const fromFrame = f => { // one item: a frame, a subject drawn for it, the verb group as the answer
    const [tense, inf, text, en, o = {}] = f, s = pick(pool(f)), neg = text.includes('{NV}');
    const g = group(inf, tense, s.p, { g: s.g, vous: s.vous, neg });
    const fill = (txt, verb) => { let t = txt.replace(/\{mon\}/g, POS.mon[s.p]).replace(/\{ma\}/g, POS.ma[s.p]).replace(/\{mes\}/g, POS.mes[s.p]).replace(/\{S\}/g, s.w).replace(/\{N?V\}/g, verb); return cap(t.replace(/\b([Jj])e ([aeiouyéèêâàîôûœh])/g, "$1'$2").replace(/\b([Qq])ue ([aeiouyéèêâàîôûœh])/g, "$1u'$2")); };
    const my = s.p === 2 ? (s.on ? 'our' : s.g === 'f' ? 'her' : 'his') : ['my', 'your', '', 'our', 'your', 'their'][s.p], third = s.p === 2 && !s.on;
    const enText = cap(en.replace(/\{S\}/g, s.en).replace(/\{O\}/g, s.o).replace(/\{my\}/g, my).replace(/\{V:([^|}]+)\|([^}]+)\}/g, (m, a, b) => third ? b : a)
      .replace(/\{B:([^}]+)\}/g, (m, x) => { const v = x.split('|'); return v.length === 3 ? (s.p === 0 ? v[0] : third ? v[1] : v[2]) : (s.p === 0 || third ? v[0] : v[1]); }));
    return { topic: tense, kind: 'verb', blank: fill(text, '___'), full: fill(text, g.text), answers: g.answers, show: g.text, cue: (neg ? 'ne pas ' : '') + inf + (tense === 'imper' ? ', ' + s.w : ''), label: T[tense], en: enText, note: hint(inf, tense, s.p) };
  };
  const fromItem = it => { const [topic, text, ans, cue, en, note] = it, answers = ans.split('|'); return { topic, kind: 'item', blank: text, full: text.replace('___', answers[0]).replace(/' /g, "'"), answers, show: answers[0], cue, label: LABEL[topic], en, note }; };

  const TOPICS = [['pr', 'Présent'], ['pc', 'Passé composé'], ['imp', 'Imparfait'], ['fut', 'Futur simple'], ['cond', 'Conditionnel'], ['subj', 'Subjonctif'], ['imper', 'Impératif'], ['pqp', 'Plus-que-parfait'],
    ['adj', 'Adjectives'], ['pl', 'Plurals'], ['adv', 'Adverbs in -ment'], ['pro', 'Pronouns'], ['det', 'Articles & possessives'], ['cmp', 'Comparatives'], ['tout', 'tout, toute, tous'], ['ppa', 'Participle agreement']];
  const LABEL = {}; TOPICS.forEach(t => { LABEL[t[0]] = t[1]; });
  const VERB_TOPICS = Object.keys(T);
  const round = (topic, n) => { // n items for a topic, 'verbs', 'agree' or 'all'; frames are not repeated within a round when there are enough
    const tenses = topic === 'all' || topic === 'verbs' ? VERB_TOPICS : VERB_TOPICS.includes(topic) ? [topic] : [];
    const frames = A.shuffle(D.frames.filter(f => tenses.includes(f[0]))), items = A.shuffle(D.items.filter(it => topic === 'all' || topic === 'agree' || it[0] === topic));
    const out = [];
    if (topic === 'all') { const nf = Math.ceil(n / 2); for (let i = 0; i < nf && frames.length; i++) out.push(fromFrame(frames[i % frames.length])); for (let i = 0; out.length < n && i < items.length; i++) out.push(fromItem(items[i])); }
    else if (frames.length) for (let i = 0; i < n; i++) out.push(fromFrame(frames[i % frames.length]));
    else for (let i = 0; i < Math.min(n, items.length); i++) out.push(fromItem(items[i]));
    return A.shuffle(out);
  };

  // ---------- judging an answer ----------
  const clean = s => String(s || '').toLowerCase().replace(/[’`´]/g, "'").replace(/\s*'\s*/g, "'").replace(/[.!?,;:]/g, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  const bare = s => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const sounds = (a, b) => { const P = A.dictation.phon, x = clean(a).replace(/'/g, ' ').split(' ').filter(Boolean), y = clean(b).replace(/'/g, ' ').split(' ').filter(Boolean); return x.length === y.length && x.every((w, i) => P(w) === P(y[i])); };
  const judge = (it, typed) => { // ok · accent (right letters, wrong accents) · sound (sounds right, spelt wrong: grammar) · ko
    const t = clean(typed); if (!t) return 'ko';
    if (it.answers.some(a => clean(a) === t)) return 'ok';
    if (it.answers.some(a => bare(a) === bare(t))) return 'accent';
    if (it.answers.some(a => sounds(a, t))) return 'sound';
    return 'ko';
  };

  // ---------- the drill ----------
  let F = null;
  const stat = (topic, verdict) => { const S = A.state(); S.stats = S.stats || {}; const all = S.stats.forms = S.stats.forms || {}; const st = all[topic] = all[topic] || { n: 0, ok: 0, acc: 0, snd: 0 }; st.n++; if (verdict === 'ok') st.ok++; if (verdict === 'accent') st.acc++; if (verdict === 'sound') st.snd++; A.save(); };
  const blankHtml = (it, state) => { // the sentence with the gap: the cue in writing mode, dots when listening, the answer once checked
    const [a, b] = it.blank.split('___');
    const inner = state === 'write' ? `<span class="blank cue">${esc(it.cue)}</span>` : state === 'hear' ? '<span class="blank">…</span>' : `<span class="blank ${state}">${esc(it.show)}</span>`;
    return fr(a) + inner + fr(b);
  };
  const ACCENTS = ['é', 'è', 'ê', 'à', 'ç', 'ù', 'û', 'î', 'ô', 'œ'];
  views.formdrill = v => {
    const topic = v.topic || 'all', mode = v.mode === 'hear' ? 'hear' : 'write';
    if (!F || F.topic !== topic || F.mode !== mode) F = { topic, mode, items: round(topic, 10), i: 0, ok: 0, acc: 0, snd: 0, verdict: null, typed: '' };
    const it = F.items[F.i], n = F.items.length, name = topic === 'all' ? 'Everything' : topic === 'verbs' ? 'All tenses' : topic === 'agree' ? 'Agreement & small words' : LABEL[topic];
    const head = `<div class="drill-head"><button class="btn ghost" data-go="forms">← Forms</button><div class="bar"><i style="width:${(F.i / n) * 100}%"></i></div><span class="en num">${Math.min(F.i + 1, n)}/${n}</span></div>`;
    if (!it) return `${head}<div class="card done"><span class="eyebrow">${esc(name)} · ${mode === 'hear' ? 'by ear' : 'written'}</span><b class="num">${F.ok}/${n}</b><p class="en">${F.ok === n ? 'Every form right.' : (F.acc ? F.acc + ' right but for the accents. ' : '') + (F.snd ? F.snd + ' sounded right and were spelt wrong: that is grammar, not hearing. ' : '') + (n - F.ok - F.acc - F.snd ? (n - F.ok - F.acc - F.snd) + ' wrong form' + (n - F.ok - F.acc - F.snd > 1 ? 's' : '') + '.' : '')}</p>
      <div class="row"><button class="btn primary" id="again">Another ten</button><button class="btn" data-go="forms">Done</button></div></div>
      <div class="card"><span class="eyebrow">This round</span><div style="margin-top:8px">${F.items.map(x => `<div class="sent">${speakBtn(x.full)}<div><div class="fr">${blankHtml(x, x.verdict === 'ok' ? 'ok' : x.verdict === 'accent' || x.verdict === 'sound' ? 'sp' : 'ko')}</div><div class="en" style="font-size:.9rem">${esc(x.en)}</div></div></div>`).join('')}</div></div>`;
    const done = F.verdict !== null, V = F.verdict;
    const verdictText = V === 'ok' ? 'Correct' : V === 'accent' ? 'Right letters, wrong accents' : V === 'sound' ? 'Sounds right, spelt wrong' : 'Not this time';
    return `${head}<div class="card"><div class="row"><span class="pill lvl">${esc(it.label)}</span><span class="en">${mode === 'hear' ? 'Listen, then write the missing form.' : 'Write the form that fits.'}</span></div>
      <p class="prompt" style="margin-top:12px">${blankHtml(it, done ? (V === 'ok' ? 'ok' : V === 'accent' || V === 'sound' ? 'sp' : 'ko') : mode)}</p>
      ${mode === 'hear' ? `<div class="player" style="margin-top:10px"><button class="btn primary" id="play">▶ Play</button><button class="btn" id="slow" title="In breath groups, with a pause between them">Slower</button><span class="en num" id="plays"></span></div>` : ''}
      <input class="dict" id="ans" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${mode === 'hear' ? 'the missing word or words' : esc(it.cue) + ' → ?'}" ${done ? 'disabled' : ''} value="${done ? esc(F.typed) : ''}" lang="fr">
      ${done ? '' : `<div class="row" style="margin-top:8px;gap:6px">${ACCENTS.map(c => `<button class="btn ghost chip-acc" data-acc="${c}" tabindex="-1" style="padding:4px 9px;font-family:var(--font-fr);font-size:1.1rem">${c}</button>`).join('')}</div>`}
      ${done ? `<div class="result ${V === 'ok' ? 'ok' : 'ko'}" ${V === 'accent' || V === 'sound' ? 'style="background:var(--warn-soft);color:var(--warn)"' : ''}>${verdictText}<b class="fr" style="font-weight:600;display:block">${fr(it.show)}</b>${it.answers.length > 1 ? `<span class="en">also accepted: ${it.answers.slice(1).map(esc).join(', ')}</span>` : ''}
          <span class="fr">${fr(it.full)} ${speakBtn(it.full)}</span><span class="en">${esc(it.en)}</span><span class="en" style="margin-top:6px">${esc(it.note)}</span></div>
        <div class="actions"><button class="btn primary" id="next">${F.i + 1 < n ? 'Next' : 'Finish'}</button></div>` : `<div class="actions"><button class="btn primary" id="check">Check</button></div>`}
    </div>`;
  };
  views.formdrill.after = v => {
    if ($('again')) $('again').addEventListener('click', () => { F = null; A.render(); });
    const it = F && F.items[F.i]; if (!it) return;
    const inp = $('ans'); let plays = 0;
    const play = slow => { TTS.stop(); TTS.speak(it.full, slow ? { slow: true } : {}); plays++; if ($('plays')) $('plays').textContent = plays + ' play' + (plays > 1 ? 's' : ''); };
    if ($('play')) { $('play').addEventListener('click', () => play(false)); $('slow').addEventListener('click', () => play(true)); }
    if (F.verdict === null) {
      if (F.mode === 'hear') play(false);
      inp.focus(); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('check').click(); } });
      document.querySelectorAll('.chip-acc').forEach(b => b.addEventListener('mousedown', e => { e.preventDefault(); const s = inp.selectionStart || 0; inp.setRangeText(b.dataset.acc, s, inp.selectionEnd || s, 'end'); inp.focus(); }));
      $('check').addEventListener('click', () => { F.typed = inp.value; F.verdict = judge(it, inp.value); it.verdict = F.verdict; if (F.verdict === 'ok') F.ok++; if (F.verdict === 'accent') F.acc++; if (F.verdict === 'sound') F.snd++; stat(it.topic, F.verdict); A.render(); if (F.mode === 'write' || F.verdict !== 'ok') TTS.speak(it.full); });
    }
    if ($('next')) $('next').addEventListener('click', () => { TTS.stop(); F.i++; F.verdict = null; F.typed = ''; A.render(); window.scrollTo(0, 0); });
  };

  // ---------- the menu ----------
  views.forms = v => {
    const S = A.state(), st = (S.stats || {}).forms || {}, mode = (v.mode || S.settings.formsMode) === 'hear' ? 'hear' : 'write';
    const pct = k => { const x = st[k]; return x && x.n ? Math.round(100 * x.ok / x.n) : null; };
    const chip = (k, label, sub) => { const p = pct(k); return `<button class="mode" data-topic="${k}"><b>${esc(label)}</b><span>${sub ? esc(sub) + ' · ' : ''}${p === null ? 'new' : p + '% of ' + st[k].n}</span></button>`; };
    const tot = Object.values(st).reduce((a, x) => ({ n: a.n + x.n, ok: a.ok + x.ok, acc: a.acc + (x.acc || 0), snd: a.snd + (x.snd || 0) }), { n: 0, ok: 0, acc: 0, snd: 0 });
    return `<div class="lesson-head"><div class="row"><button class="btn ghost" data-go="listen">← Listening</button></div><span class="eyebrow">Forms in sentences</span><h1>Conjugation &amp; agreement</h1>
      <p class="en">Every item is a sentence with one form missing: a verb to conjugate, an adjective to agree, a plural, an adverb, a pronoun, an article. In <b>Write</b> you see the base form and the tense and type the form. In <b>Hear</b> you hear the whole sentence and write what filled the gap: endings that sound alike (parlé, parlait, parlaient) are told apart only by grammar, which is the point.</p>
      ${tot.n ? `<p class="en num">${tot.n} forms so far · ${Math.round(100 * tot.ok / tot.n)}% right${tot.acc ? ' · ' + tot.acc + ' accent slips' : ''}${tot.snd ? ' · ' + tot.snd + ' sounded right, spelt wrong' : ''}</p>` : ''}</div>
    <div class="card"><div class="row"><span class="eyebrow">Mode</span><button class="btn ${mode === 'write' ? 'on' : ''}" data-mode="write">Write the form</button><button class="btn ${mode === 'hear' ? 'on' : ''}" data-mode="hear">Hear it, then write</button></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-topic="all">Everything, ten at a time</button><button class="btn" data-topic="verbs">All tenses</button><button class="btn" data-topic="agree">Agreement &amp; small words</button></div></div>
    <div class="card"><span class="eyebrow">Verbs</span><div class="modes" style="margin-top:10px">${TOPICS.slice(0, 8).map(t => chip(t[0], t[1], D.frames.filter(f => f[0] === t[0]).length + ' frames')).join('')}</div></div>
    <div class="card"><span class="eyebrow">Agreement &amp; small words</span><div class="modes" style="margin-top:10px">${TOPICS.slice(8).map(t => chip(t[0], t[1], D.items.filter(i => i[0] === t[0]).length + ' items')).join('')}</div></div>`;
  };
  views.forms.after = v => {
    document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { const S = A.state(); S.settings.formsMode = b.dataset.mode; A.save(); go('forms', { mode: b.dataset.mode }); }));
    document.querySelectorAll('[data-topic]').forEach(b => b.addEventListener('click', () => { const S = A.state(); F = null; go('formdrill', { topic: b.dataset.topic, mode: (v.mode || S.settings.formsMode) === 'hear' ? 'hear' : 'write' }); }));
  };
  A.forms = { table, group, fromFrame, fromItem, round, judge, pool, TOPICS, T, state: () => F };
})();
