/* Allons-y — core: data model, progress storage, speech, navigation, Book / Lesson / Review views. */
(function () {
  'use strict';
  const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
  const BUILD = 9; // bump together with the ?v= on the script tags in index.html whenever the scripts change

  // ---------- merge data files into one book ----------
  const BOOK = [];
  (window.FR_BOOK || []).forEach(ch => {
    let c = BOOK.find(x => x.lvl === ch.lvl);
    if (!c) { c = { lvl: ch.lvl, title: '', desc: '', lessons: [] }; BOOK.push(c); }
    if (ch.title) c.title = ch.title;
    if (ch.desc) c.desc = ch.desc;
    c.lessons.push(...ch.lessons);
  });
  BOOK.sort((a, b) => LEVELS.indexOf(a.lvl) - LEVELS.indexOf(b.lvl));
  const WORDS = [], LESSONS = {};
  BOOK.forEach(c => c.lessons.forEach((l, li) => {
    l.lvl = c.lvl; l.n = li + 1; LESSONS[l.id] = l;
    l.words = l.w.map((w, wi) => ({ key: l.id + ':' + w[0], idx: wi, fr: w[0], pos: w[1], en: w[2], ex: w[3].map(e => ({ fr: e[0], en: e[1] })), lesson: l, lvl: c.lvl }));
    WORDS.push(...l.words);
  }));
  const LISTEN = window.FR_LISTEN || [];
  const READING = {}; (window.FR_READING || []).forEach(r => { READING[r.lesson] = r; }); // one long text per lesson, keyed by lesson id
  // ---------- level filter: Settings → "Start from level"; levels below it are hidden everywhere and never come up for review ----------
  const visible = lvl => LEVELS.indexOf(lvl) >= LEVELS.indexOf(S.settings.minLevel || 'A1');
  const VLEVELS = () => LEVELS.filter(visible), VBOOK = () => BOOK.filter(c => visible(c.lvl)), VWORDS = () => WORDS.filter(w => visible(w.lvl)), VLISTEN = () => LISTEN.filter(p => visible(p.lvl));

  // ---------- progress state: localStorage always, artifact db when available ----------
  const DEFAULT = () => ({ v: 2, words: {}, listen: {}, read: {}, dictee: {}, stats: {}, texts: {}, settings: { rate: 0.9, voice: '', showEn: true, minLevel: 'A2' }, updated: 0 });
  const LS_KEY = 'allonsy.state';
  let S = DEFAULT();
  function adopt(o) {
    // merge the defaults under whatever was saved, settings included, so a setting added in a later build gets its default for existing users
    const d = DEFAULT(), src = JSON.parse(JSON.stringify(o || {})), keepTexts = S ? S.texts : null;
    S = Object.assign(d, src, { settings: Object.assign(d.settings, src.settings || {}) });
    S.texts = src.texts || keepTexts || {}; // the learner's own texts live in their own documents, never in the state document S.words = S.words || {}; S.listen = S.listen || {}; S.read = S.read || {}; S.dictee = S.dictee || {}; S.stats = S.stats || {};
    if ((S.v || 1) < 2) { // v1 keyed a word by its position in the lesson; v2 keys it by headword, so reordering a data file keeps progress
      const m = {}; Object.entries(S.words).forEach(([k, st]) => { const i = k.lastIndexOf(':'), l = LESSONS[k.slice(0, i)], wi = k.slice(i + 1); const w = l && /^\d+$/.test(wi) ? l.words[+wi] : null; m[w ? w.key : k] = st; }); S.words = m; S.v = 2;
    }
  }
  try { const raw = localStorage.getItem(LS_KEY); if (raw) adopt(JSON.parse(raw)); } catch (e) { /* storage unavailable */ }

  let saveTimer = null, dbRef = null, dbTexts = null, dbChain = Promise.resolve();
  const sync = { status: 'local' };
  function saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
  function save() {
    S.updated = Date.now();
    saveLocal();
    clearTimeout(saveTimer); saveTimer = setTimeout(pushDb, 1200);
  }
  function pushDb() {
    if (!dbRef) return;
    const snap = JSON.parse(JSON.stringify(S)); delete snap.texts;
    dbChain = dbChain.then(() => dbRef.set(snap)).then(() => { sync.status = 'cloud'; }).catch(() => { sync.status = 'error'; });
  }
  async function initDb() {
    if (!window.claude || typeof claude.use !== 'function') return;
    try {
      const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
      if (!db || !user) return;
      const uid = await user.id();
      if (!uid) return;
      dbRef = db.doc('data/users/' + uid + '/state');
      const snap = await dbRef.get();
      if (snap.exists) {
        const d = snap.data();
        if ((d.updated || 0) > (S.updated || 0)) { adopt(d); try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } render(); }
        else if ((S.updated || 0) > (d.updated || 0)) pushDb();
      } else if (S.updated) pushDb();
      // the learner's own texts: one document each under data/users/<id>/texts/items, the newer side wins per text, a text deleted elsewhere goes here too
      dbTexts = db.doc('data/users/' + uid + '/texts').collection('items');
      const qs = await dbTexts.get(), seen = {}, before = Object.keys(S.texts).sort().join(',');
      qs.docs.forEach(ds => { const t = ds.data(); if (!t || !t.id) return; seen[t.id] = 1; const loc = S.texts[t.id]; if (!loc || (loc.updated || 0) <= (t.updated || 0)) S.texts[t.id] = Object.assign({}, t, { synced: true }); else pushText(loc); });
      Object.values(S.texts).forEach(t => { if (seen[t.id]) return; if (t.synced) delete S.texts[t.id]; else pushText(t); });
      saveLocal(); if (Object.keys(S.texts).sort().join(',') !== before) render();
      sync.status = 'cloud';
    } catch (e) { sync.status = 'error'; }
  }
  function pushText(t) {
    if (!dbTexts) return;
    const body = JSON.parse(JSON.stringify(t)); delete body.synced;
    dbChain = dbChain.then(() => dbTexts.doc(t.id).set(body)).then(() => { if (S.texts[t.id] && S.texts[t.id].updated === t.updated) { S.texts[t.id].synced = true; saveLocal(); } }).catch(() => { sync.status = 'error'; });
  }
  const texts = { // the learner's own texts (see app-mine.js): kept locally at once, pushed to the account when it is there
    add(t) { t.id = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); t.updated = Date.now(); t.synced = false; S.texts[t.id] = t; saveLocal(); pushText(t); return t; },
    update(id, patch) { const t = S.texts[id]; if (!t) return null; Object.assign(t, patch, { updated: Date.now(), synced: false }); saveLocal(); pushText(t); return t; },
    remove(id) { delete S.texts[id]; saveLocal(); if (dbTexts) dbChain = dbChain.then(() => dbTexts.doc(id).delete()).catch(() => { sync.status = 'error'; }); }
  };
  const paragraphs = text => String(text || '').replace(/\r/g, '').split('\n').map(s => s.replace(/[\u00a0\u202f]/g, ' ').replace(/[ \t]+/g, ' ').trim()).filter(Boolean);

  // ---------- spaced repetition (Leitner boxes 0–5) ----------
  const INTERVALS = [0, 1, 3, 7, 14, 30], DAY = 864e5;
  const wstate = key => S.words[key] || { b: 0, d: 0, n: 0 };
  function rate(key, grade) { // 0 again · 1 hard · 2 good
    const w = Object.assign({ b: 0, d: 0, n: 0 }, S.words[key]); w.n++;
    if (grade === 0) { w.b = 0; w.d = Date.now() + 10 * 60e3; }
    else if (grade === 1) { w.b = Math.max(1, w.b); w.d = Date.now() + Math.max(0.5, INTERVALS[w.b] / 2) * DAY; }
    else { w.b = Math.min(5, w.b + 1); w.d = Date.now() + INTERVALS[w.b] * DAY; }
    S.words[key] = w; save();
  }
  function practiceResult(key, ok, cap) { // cap: the highest box this kind of practice can reach (3 for recognition drills, 5 for production)
    const w = Object.assign({ b: 0, d: 0, n: 0 }, S.words[key]); w.n++;
    if (!ok) { w.b = 0; w.d = Date.now() + 10 * 60e3; }
    else { if (w.b < (cap || 5)) w.b++; w.d = Math.max(w.d, Date.now() + INTERVALS[w.b] * DAY); }
    S.words[key] = w; save();
  }
  const isDue = w => { const s = wstate(w.key); return s.n > 0 && s.d <= Date.now(); };
  const dueWords = () => WORDS.filter(w => visible(w.lvl) && isDue(w));

  // ---------- speech ----------
  // The voice decides whether this sounds like French at all: a browser's default voice reads French text with English or Chinese phonetics,
  // and macOS lists its novelty voices (Eddy, Flo, Grandma…) under fr-FR as well. So the voices are ranked, the list is awaited before the
  // first utterance (Chrome and WebKit fill it asynchronously), and when the browser has voices but none for French we say so instead of mispronouncing.
  const CUT = { // word classes for the breath-group cutter in TTS.chunks
    strong: /^(et|ou|mais|donc|car|puis|sinon|alors|quand|lorsque|lorsqu'\S*|puisque|puisqu'\S*|si|que|qu'\S*|qui|dont|où|parce|comme|pendant|depuis|avant|après|pour|par|dans|avec|sans|sur|sous|chez|vers|entre|contre|malgré|selon|devant|derrière)$/i,
    verb: /^(est|sont|a|ont|était|étaient|avait|avaient|sera|seront|fait|font|va|vont|peut|peuvent|doit|doivent|veut|veulent|faut)$/i,
    weakHi: /^(à|au|aux|il|elle|ils|elles|on|c'\S*|ça|cela|tout|toute|tous|toutes|chaque|demain|hier|aujourd'hui|maintenant|souvent|toujours|encore|déjà|ici|là|là-bas|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt|trente|quarante|cinquante|cent|mille|\d+)$/i,
    weakLo: /^(de|du|des|d'\S*|en)$/i,
    func: /^(à|au|aux|de|du|des|en|le|la|les|un|une|ce|cet|cette|ces|mon|ma|mes|ton|ta|tes|son|sa|ses|notre|votre|leur|leurs|nos|vos|quel|quelle|quels|quelles|plus|moins|très|trop|si|ne|pas|et|ou|mais|que|qui|dont|où|je|tu|il|elle|on|nous|vous|ils|elles|y|se|me|te|lui|pour|par|dans|avec|sans|sur|sous|chez|vers|entre|contre|comme|quand|avant|après|depuis|pendant|devant|derrière|malgré|selon|(n|j|s|m|t|c|qu)'\S*)$/i,
    deFixed: /^(beaucoup|trop|peu|assez|plus|moins|tant|autant|besoin|envie|droit|afin|cas|point|côté|près|loin|face|partir|lieu|tour|compte|bord|mise|mis|remet|remis|met|mettre|remettre)$/i,
    enFixed: /^(mise|mis|remet|remis|met|mettre|remettre)$/i
  };
  const TTS = {
    all: [], voices: [], token: 0, keep: [], warned: false,
    supported() { return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window; },
    refresh() { if (!this.supported()) return; this.all = speechSynthesis.getVoices(); this.voices = this.all.filter(v => /^fr([-_]|$)/i.test(v.lang)).sort((a, b) => this.rank(b) - this.rank(a)); },
    rank(v) { // higher is better: France French, then natural or premium engines, then the plain system voices; novelty and robotic voices last
      const n = v.name;
      let r = /fr[-_]FR/i.test(v.lang) ? 100 : 50;
      if (/(Natural|Neural|Online|Premium|Enhanced|Google|Siri|Wavenet)/i.test(n)) r += 30;
      if (/(Audrey|Aur[eé]lie|Thomas|Marie|Daniel|Denise|Henri|Hortense|Julie|Paul|Vivienne|Charline|Yvette|Claude|R[eé]my|L[eé]a|Chantal|Nicolas|Am[eé]lie|Jacques)/i.test(n)) r += 10;
      if (/^Thomas\b/i.test(n)) r += 1; // the classic Apple default, ahead of its siblings
      if (/(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Bells|Bubbles|Cellos|Jester|Organ|Superstar|Trinoids|Whisper|Zarvox|Bad News|Good News|Albert|Fred|Junior|Kathy|Ralph|Wobble|compact|Eloquence)/i.test(n)) r -= 60;
      if (v.localService) r += 1;
      return r;
    },
    voice() { if (!this.voices.length) this.refresh(); return this.voices.find(x => x.name === S.settings.voice) || this.voices[0] || null; },
    noFrench() { return this.supported() && this.all.length > 0 && this.voices.length === 0; },
    ready() {
      if (!this.supported()) return Promise.resolve();
      this.refresh();
      if (this.all.length) return Promise.resolve();
      return new Promise(res => { let done = false; const fin = () => { if (done) return; done = true; this.refresh(); res(); }; speechSynthesis.addEventListener('voiceschanged', fin, { once: true }); setTimeout(fin, 1500); });
    },
    stop() { this.token++; if (this.supported()) speechSynthesis.cancel(); document.querySelectorAll('.speak.playing').forEach(b => b.classList.remove('playing')); },
    // Slow reading. The utterance rate is only a hint, and some engines flatten it: Apple's Premium and Enhanced voices compress it so much that
    // 0.6 and 0.9 sound alike, which is why "Slower" used to sound like "Play". So slowness is built from timing the app controls itself: the
    // sentence is cut into breath groups, each group is one utterance at a reduced rate, and the pauses between groups are ours. It is how a dictée is read in class.
    sentences(text) { // one utterance per sentence: cut after . ! ? … (plus a closing ») when a capital, a digit or an opening quote follows; M. / Mme / etc. stay attached
      const guard = String(text).replace(/\b(M|MM|Mme|Mlle|Dr|Pr|St|Ste|etc|p|n°)\.\s/g, '$1.\u0001');
      return guard.replace(/([.!?…]+\s?»?)\s+(?=[«"(A-ZÀ-ÝŒ0-9])/g, '$1\u0000').split('\u0000').map(s => s.replace(/\u0001/g, ' ').trim()).filter(Boolean);
    },
    gaps: { clause: 650, group: 400 }, // ms of silence after a group that ends in punctuation / after any other group
    slowRate() { return Math.max(0.5, Math.min(0.75, Math.round(S.settings.rate * 70) / 100)); },
    chunks(text) { // breath groups: cut at punctuation, then before a conjunction, relative pronoun or preposition once a group has three words and
      // three remain; a group still seven words long is cut once more where it sounds least wrong (subject | verb, before "à", "de", a number…), never
      // right after a function word (so never "en | 1998" or "le | chat"), at the point nearest its middle; long groups are refined until they are short
      const isWord = t => /[\p{L}\p{N}]/u.test(t), bare = t => t.replace(/’/g, "'").replace(/^[«"(']+|[»")',;:.!?…]+$/g, '').toLowerCase();
      const toks = String(text).trim().split(/[\s  ]+/).filter(Boolean), words = toks.filter(isWord).length;
      const groups = []; let cur = [], n = 0, seen = 0, pending = false;
      const flush = () => { if (cur.length) groups.push(cur); cur = []; n = 0; pending = false; };
      toks.forEach(t => {
        if (!isWord(t)) { // punctuation on its own: an opening quote starts the next group, anything else stays with the words before it
          if (/^[«(]+$/.test(t)) { if (pending) flush(); cur.push(t); return; }
          if (!cur.length && groups.length) groups[groups.length - 1].push(t); else cur.push(t); if (/[,;:.!?…]/.test(t)) pending = true; return; }
        if (pending || (n >= 3 && words - seen >= 3 && CUT.strong.test(bare(t)))) flush();
        cur.push(t); n++; seen++;
        if (/[,;:.!?…]+[»")]*$/.test(t)) pending = true;
      });
      flush();
      const refine = g => {
        const wi = g.map((t, i) => i).filter(i => isWord(g[i]));
        if (wi.length < 7) return [g];
        let best = null;
        for (let k = 1; k < wi.length; k++) {
          const t = bare(g[wi[k]]), prev = bare(g[wi[k - 1]]), right = wi.length - k;
          if (right < 2 || CUT.func.test(prev)) continue;
          let bonus;
          if (CUT.strong.test(t) && k >= 2) bonus = 1.5;
          else if (CUT.verb.test(t) && k >= 2) bonus = 1;
          else if (CUT.weakHi.test(t) && k >= 3) bonus = 0.5;
          else if (CUT.weakLo.test(t) && k >= 3 && !(/^d/.test(t) && CUT.deFixed.test(prev)) && !(t === 'en' && CUT.enFixed.test(prev))) bonus = 0;
          else continue;
          const score = Math.abs(k - wi.length / 2) - bonus;
          if (!best || score < best.score) best = { k, score };
        }
        if (!best) return [g];
        return refine(g.slice(0, wi[best.k])).concat(refine(g.slice(wi[best.k])));
      };
      return groups.flatMap(refine).map(g => g.join(' '));
    },
    say(text, rate) { // one utterance; resolves true once spoken, false when cancelled or refused
      return this.ready().then(() => new Promise(res => {
        if (!this.supported()) { res(false); return; }
        const v = this.voice();
        if (!v && this.noFrench()) { if (!this.warned) { this.warned = true; toast('No French voice installed: see Settings'); } res(false); return; }
        if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'fr-FR'; if (v) u.voice = v;
        u.rate = rate != null ? rate : S.settings.rate; u.pitch = 1;
        u.onend = () => res(true); u.onerror = () => res(false);
        this.keep = [u]; // keep a reference: Chrome drops callbacks on collected utterances
        speechSynthesis.speak(u);
      }));
    },
    async play(text, opts, t) { // one text at normal or slow pace, giving up as soon as the token moves on (stop(), or a newer speak / seq)
      if (!opts.slow) return this.say(text, opts.rate);
      const parts = this.chunks(text), rate = opts.rate != null ? opts.rate : this.slowRate();
      for (let i = 0; i < parts.length; i++) {
        if (t !== this.token) return false;
        if (!(await this.say(parts[i], rate))) return false;
        if (i < parts.length - 1) await new Promise(r => setTimeout(r, /[,;:.!?…]+[»")]*$/.test(parts[i]) ? this.gaps.clause : this.gaps.group));
      }
      return t === this.token;
    },
    speak(text, opts = {}) { return this.play(text, opts, ++this.token); }, // opts.rate, or opts.slow for breath groups with pauses
    async seq(texts, opts = {}) {
      const t = ++this.token;
      for (let i = 0; i < texts.length; i++) {
        if (t !== this.token) return false;
        if (opts.each) opts.each(i);
        await this.play(texts[i], opts, t);
        if (opts.gap && t === this.token) await new Promise(r => setTimeout(r, opts.gap));
      }
      if (t === this.token && opts.end) opts.end();
      return t === this.token;
    }
  };
  if (TTS.supported()) { TTS.refresh(); speechSynthesis.addEventListener('voiceschanged', () => { const had = TTS.all.length; TTS.refresh(); if (!had && V.name === 'book') render(); }); }

  // ---------- helpers ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fr = s => esc(s).replace(/ ([?!;:»])/g, '\u202f$1').replace(/« /g, '«\u202f'); // French spacing: a narrow no-break space keeps ? ! ; : on the line with their word
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a, n) => shuffle(a).slice(0, n);
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/[’]/g, "'").replace(/[^a-z0-9'\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const SPK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  const speakBtn = (text, extra) => `<button class="speak ${extra || ''}" data-say="${esc(text)}" aria-label="Listen" title="Listen">${SPK}</button>`;
  let toastTimer = null;
  function toast(msg) { let t = document.querySelector('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); } t.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 2200); }
  const boxClass = b => b >= 5 ? 'b5' : b >= 3 ? 'b3' : b >= 1 ? 'b1' : '';
  const lessonStats = l => { let seen = 0, known = 0; l.words.forEach(w => { const b = wstate(w.key).b, n = wstate(w.key).n; if (n > 0) seen++; if (b >= 3) known++; }); return { seen, known, total: l.words.length }; };

  // ---------- navigation ----------
  const app = document.getElementById('app');
  const views = {};
  let V = { name: 'book' };
  try { const last = JSON.parse(sessionStorage.getItem('allonsy.view') || 'null'); if (last && last.name && last.name !== 'drill') V = last; } catch (e) { /* ignore */ }
  function go(name, params) { TTS.stop(); V = Object.assign({ name }, params || {}); try { sessionStorage.setItem('allonsy.view', JSON.stringify(V)); } catch (e) { /* ignore */ } window.scrollTo(0, 0); render(); }
  function render() {
    const fn = views[V.name] || views.book;
    app.innerHTML = fn(V) || '';
    if (fn.after) fn.after(V);
    const top = { lesson: 'book', reading: 'book', mytext: 'mine', dictee: 'listen', numbers: 'listen', drill: V.from === 'review' ? 'review' : V.from === 'listen' ? 'listen' : 'book', passage: 'listen' }[V.name] || V.name;
    document.querySelectorAll('#nav button').forEach(b => { if (b.dataset.view === top) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  }
  document.getElementById('nav').addEventListener('click', e => { const b = e.target.closest('button[data-view]'); if (b) go(b.dataset.view); });
  app.addEventListener('click', e => {
    const say = e.target.closest('[data-say]');
    if (say) { TTS.stop(); say.classList.add('playing'); TTS.seq(TTS.sentences(say.dataset.say), { gap: 300, slow: !!say.closest('[data-slow="1"]') }).then(() => say.classList.remove('playing')); return; } // sentence by sentence: Chrome's network voices cut long utterances off
    const g = e.target.closest('[data-go]');
    if (g) { const [name, id] = g.dataset.go.split('|'); go(name, id ? { id } : {}); }
  });

  // ---------- Book (table of contents) ----------
  views.book = () => {
    const words = VWORDS(), listen = VLISTEN(), hidden = BOOK.filter(c => !visible(c.lvl)).map(c => c.lvl);
    const seen = words.filter(w => wstate(w.key).n > 0).length, known = words.filter(w => wstate(w.key).b >= 3).length;
    const due = dueWords().length, done = listen.filter(p => S.listen[p.id]).length;
    const notice = !TTS.supported() ? '<div class="notice">This browser has no speech synthesis, so the listening buttons will stay silent. Chrome, Safari or Edge all work.</div>'
      : TTS.noFrench() ? '<div class="notice">No French voice is installed, so nothing is read aloud: a voice for another language would mispronounce every word. Install one in the system speech settings (Mac or iPhone: Audrey, Aurélie or Thomas), then reload. Chrome and Edge bring their own French voices.</div>' : '';
    return `${notice}
    <div class="summary">
      <div class="stat"><b class="num">${known}<span style="font-size:1rem;color:var(--muted)"> / ${words.length}</span></b><span>words known (box 3+)</span></div>
      <div class="stat"><b class="num">${seen}</b><span>words started</span></div>
      <div class="stat"><b class="num">${due}</b><span>due for review</span></div>
      <div class="stat"><b class="num">${done}<span style="font-size:1rem;color:var(--muted)"> / ${listen.length}</span></b><span>listening passages done</span></div>
    </div>
    ${hidden.length ? `<p class="en" style="font-size:.9rem">${hidden.join(', ')} ${hidden.length > 1 ? 'are' : 'is'} hidden as too easy. Change the starting level in Settings to bring ${hidden.length > 1 ? 'them' : 'it'} back.</p>` : ''}
    ${due ? `<div class="row"><button class="btn primary" data-go="review">Review ${due} due word${due > 1 ? 's' : ''} now</button></div>` : ''}
    ${VBOOK().map(c => `<section class="card chapter">
      <div class="chapter-head"><div class="lvl">${c.lvl}</div><h2>${esc(c.title)}</h2><p>${esc(c.desc)}</p></div>
      <div class="lessons">${c.lessons.map(l => { const st = lessonStats(l); return `<button class="lesson-row" data-go="lesson|${l.id}">
        <span class="n num">${l.n}</span>
        <span><span class="t">${esc(l.t)}</span><br><span class="sub num">${st.total} words · ${st.known} known · ${l.words.reduce((n, w) => n + w.ex.length, 0)} sentences</span></span>
        <span class="dots" aria-label="${st.known} of ${st.total} known">${l.words.map(w => `<i class="${boxClass(wstate(w.key).b)}"></i>`).join('')}</span>
      </button>`; }).join('')}</div>
    </section>`).join('')}`;
  };

  // ---------- Lesson ----------
  views.lesson = v => {
    const l = LESSONS[v.id]; if (!l) return views.book();
    const st = lessonStats(l), showEn = S.settings.showEn, r = READING[l.id];
    const readCard = r ? `<button class="read-card" data-go="reading|${l.id}"><span class="eyebrow">Reading${S.read[l.id] ? ' · read ✓' : ''}</span><span class="t fr">${fr(r.title)}</span><span class="sub en">${esc(r.genre)} · ${r.text.reduce((n, p) => n + p[0].split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length, 0)} words · notes, vocabulary, patterns, idioms and grammar</span></button>` : '';
    const modes = [
      ['cards', 'Flashcards', 'Word → meaning, rate yourself'],
      ['cloze', 'Fill the gap', 'Sentence with the word missing'],
      ['rebuild', 'Rebuild', 'Put the words back in order'],
      ['dictation', 'Dictation', 'Listen and type the sentence'],
      ['translate', 'EN → FR', 'Say the French, then check'],
      ['listenpick', 'Listen & pick', 'Hear it, choose the meaning']
    ];
    return `<div class="lesson-head">
      <div class="row"><button class="btn ghost" data-go="book">← Book</button><span class="pill lvl">${l.lvl}</span><span class="pill num">Lesson ${l.n}</span></div>
      <h1>${esc(l.t)}</h1>
      <div class="row"><div class="bar grow"><i class="${st.known === st.total ? 'good' : ''}" style="width:${(st.known / st.total) * 100}%"></i></div><span class="en num">${st.known}/${st.total} known</span></div>
      <div class="row"><button class="btn ghost" id="knowAll" title="Skip the drills: every word in this lesson goes to box 5">Mark all as known</button>${st.seen ? '<button class="btn ghost" id="resetLesson">Reset lesson</button>' : ''}</div>
    </div>
    ${readCard}
    <div class="modes">${modes.map(m => `<button class="mode" data-mode="${m[0]}"><b>${m[1]}</b><span>${m[2]}</span></button>`).join('')}</div>
    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:6px"><span class="eyebrow">Words &amp; sentences</span>
        <div class="row"><button class="btn ghost" id="playAll">Play all sentences</button><button class="btn ghost" id="toggleEn">${showEn ? 'Hide' : 'Show'} English</button></div></div>
      ${l.words.map((w, i) => `<div class="word" id="w${i}">
        <div class="word-head"><span class="fr">${fr(w.fr)}</span>${speakBtn(w.fr)}<span class="pos">${esc(w.pos)}</span><span class="meaning">${esc(w.en)}</span><span class="state dots"><i class="${boxClass(wstate(w.key).b)}"></i></span></div>
        ${w.ex.map(e => `<div class="ex">${speakBtn(e.fr)}<div><div class="fr">${fr(e.fr)}</div><div class="en" ${showEn ? '' : 'hidden'}>${esc(e.en)}</div></div></div>`).join('')}
      </div>`).join('')}
    </div>`;
  };
  views.lesson.after = v => {
    const l = LESSONS[v.id]; if (!l) return;
    app.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => go('drill', { mode: b.dataset.mode, lesson: l.id, from: 'book' })));
    const arm = (btn, label, fn) => { if (btn) btn.addEventListener('click', () => { if (btn.dataset.armed) fn(); else { btn.dataset.armed = '1'; btn.textContent = label; } }); };
    arm(document.getElementById('knowAll'), 'Tap again to mark all ' + l.words.length + ' as known', () => { l.words.forEach(w => { S.words[w.key] = { b: 5, d: Date.now() + INTERVALS[5] * DAY, n: wstate(w.key).n + 1 }; }); save(); toast('Marked as known'); render(); });
    arm(document.getElementById('resetLesson'), 'Tap again to reset this lesson', () => { l.words.forEach(w => { delete S.words[w.key]; }); save(); toast('Lesson reset'); render(); });
    const tog = document.getElementById('toggleEn');
    tog.addEventListener('click', () => { S.settings.showEn = !S.settings.showEn; save(); app.querySelectorAll('.ex .en').forEach(el => { el.hidden = !S.settings.showEn; }); tog.textContent = (S.settings.showEn ? 'Hide' : 'Show') + ' English'; });
    const pa = document.getElementById('playAll');
    pa.addEventListener('click', () => {
      if (pa.dataset.on) { TTS.stop(); pa.dataset.on = ''; pa.textContent = 'Play all sentences'; return; }
      pa.dataset.on = '1'; pa.textContent = 'Stop';
      const items = []; l.words.forEach((w, wi) => w.ex.forEach(e => items.push({ wi, fr: e.fr })));
      TTS.seq(items.map(x => x.fr), { gap: 500, each: i => { app.querySelectorAll('.word').forEach(el => { el.style.background = ''; }); const el = document.getElementById('w' + items[i].wi); if (el) { el.style.background = 'var(--accent-soft)'; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, end: () => { pa.dataset.on = ''; pa.textContent = 'Play all sentences'; app.querySelectorAll('.word').forEach(el => { el.style.background = ''; }); } });
    });
  };

  // ---------- Review ----------
  views.review = () => {
    const due = dueWords(), started = VWORDS().filter(w => wstate(w.key).n > 0);
    const byLvl = VLEVELS().map(L => ({ L, n: due.filter(w => w.lvl === L).length })).filter(x => x.n);
    const next = started.filter(w => !isDue(w)).sort((a, b) => wstate(a.key).d - wstate(b.key).d)[0];
    const fmt = ms => { const d = Math.round((ms - Date.now()) / DAY); return d <= 0 ? 'later today' : d === 1 ? 'tomorrow' : 'in ' + d + ' days'; };
    return `<div class="lesson-head"><span class="eyebrow">Spaced review</span><h1>${due.length ? `${due.length} word${due.length > 1 ? 's' : ''} due` : 'Nothing due'}</h1>
      <p class="en">${started.length ? (due.length ? 'Each card shows a different example sentence every time, so you learn the word inside its patterns.' : (next ? `Next review ${fmt(wstate(next.key).d)}. ` : '') + 'Open a lesson in the Book to start more words.') : 'Study a lesson with Flashcards or any drill, and the words you meet will come back here on a spaced schedule.'}</p></div>
    ${due.length ? `<div class="modes">
      <button class="mode" data-rmode="cards"><b>Flashcards</b><span>${due.length} due · rate yourself</span></button>
      <button class="mode" data-rmode="cloze"><b>Fill the gap</b><span>Sentences from due words</span></button>
      <button class="mode" data-rmode="dictation"><b>Dictation</b><span>Listen and type</span></button>
      <button class="mode" data-rmode="translate"><b>EN → FR</b><span>Recall the French</span></button>
    </div>
    <div class="card"><span class="eyebrow">Due by level</span><div class="stack" style="margin-top:8px">${byLvl.map(x => `<div class="row"><span class="pill lvl">${x.L}</span><span class="num">${x.n}</span></div>`).join('')}</div></div>` : ''}`;
  };
  views.review.after = () => { app.querySelectorAll('[data-rmode]').forEach(b => b.addEventListener('click', () => go('drill', { mode: b.dataset.rmode, due: true, from: 'review' }))); };

  // ---------- Settings ----------
  function openSettings() {
    TTS.refresh();
    const ov = document.createElement('div'); ov.className = 'overlay';
    const opts = TTS.voices.map(v => `<option value="${esc(v.name)}" ${S.settings.voice === v.name ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('');
    const auto = TTS.voices.some(x => x.name === S.settings.voice) ? null : TTS.voice(); // what Automatic resolves to right now
    const syncText = { local: 'Progress is saved in this browser.', cloud: 'Progress is saved to your account and in this browser.', error: 'Cloud sync failed; progress is still saved in this browser.' }[sync.status];
    ov.innerHTML = `<div class="dialog" role="dialog" aria-label="Settings">
      <div class="row" style="justify-content:space-between"><h2>Settings</h2><button class="btn ghost" id="closeSet">Close</button></div>
      <div class="field"><label for="voiceSel">French voice</label><select id="voiceSel"><option value="">Automatic${auto ? ' · ' + esc(auto.name) : ''}</option>${opts}</select>
        <span class="en" style="font-size:.88rem">${TTS.voices.length ? TTS.voices.length + ' French voice' + (TTS.voices.length > 1 ? 's' : '') + ' found, best first; Eddy, Flo, Grandma and the like are novelty voices. For the most natural reading: Chrome has Google français, Edge has Denise (Natural), and on a Mac or iPhone you can download Audrey (Premium) or Aurélie (Enhanced) in the system speech settings.' : 'No French voice found yet. Install one in the system speech settings (Mac or iPhone: Audrey, Aurélie or Thomas), then reload. Chrome and Edge bring their own French voices.'}</span></div>
      <div class="field"><label for="rateSel">Speed <span class="num" id="rateVal">${S.settings.rate.toFixed(2)}×</span></label><input type="range" id="rateSel" min="0.5" max="1.2" step="0.05" value="${S.settings.rate}">
        <span class="en" style="font-size:.88rem">Speed is a request to the voice, not a command: Apple's Premium and Enhanced voices in particular barely change pace with it. The Slower button in Dictation and Listen &amp; pick, and Slow on a passage, do not depend on it: they read in breath groups with a pause between them, at a reduced speed, so they are slower with every voice.</span></div>
      <div class="row"><button class="btn" id="testVoice">Test voice</button><label class="row" style="gap:6px"><input type="checkbox" id="showEnSel" ${S.settings.showEn ? 'checked' : ''}> Show English in lessons</label></div>
      <div class="field"><label for="fromSel">Start from level</label><select id="fromSel">${LEVELS.map(L => `<option value="${L}" ${(S.settings.minLevel || 'A1') === L ? 'selected' : ''}>${L}${L === 'A1' ? ' (show everything)' : ''}</option>`).join('')}</select><span class="en" style="font-size:.88rem">Levels below this are hidden from the Book, Listening and Review, and their words never come up for review.</span></div>
      <p class="en" style="font-size:.9rem">${syncText} <span class="num" style="color:var(--faint)">· build ${BUILD}</span></p>
      <div class="row" style="justify-content:space-between"><button class="btn ghost" id="resetBtn" style="color:var(--bad)">Reset all progress</button></div>
    </div>`;
    document.body.appendChild(ov);
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); render(); document.getElementById('settingsBtn').focus(); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('#closeSet').focus();
    ov.querySelector('#closeSet').addEventListener('click', close);
    ov.querySelector('#voiceSel').addEventListener('change', e => { S.settings.voice = e.target.value; save(); TTS.speak('Bonjour ! Je m’appelle ' + (TTS.voice() ? TTS.voice().name.replace(/\s*\(.*$/, '') : 'Allons-y') + '.'); });
    ov.querySelector('#rateSel').addEventListener('input', e => { S.settings.rate = parseFloat(e.target.value); ov.querySelector('#rateVal').textContent = S.settings.rate.toFixed(2) + '×'; save(); });
    ov.querySelector('#showEnSel').addEventListener('change', e => { S.settings.showEn = e.target.checked; save(); });
    ov.querySelector('#fromSel').addEventListener('change', e => { S.settings.minLevel = e.target.value; save(); });
    ov.querySelector('#testVoice').addEventListener('click', () => TTS.speak('Bonjour ! Allons-y, apprenons le français ensemble.'));
    const rb = ov.querySelector('#resetBtn');
    rb.addEventListener('click', () => { if (rb.dataset.armed) { adopt({}); save(); close(); toast('Progress reset'); } else { rb.dataset.armed = '1'; rb.textContent = 'Tap again to confirm reset'; } });
  }
  document.getElementById('settingsBtn').addEventListener('click', openSettings);

  // ---------- expose for the drills file ----------
  window.App = { LEVELS, BOOK, WORDS, LESSONS, LISTEN, READING, texts, paragraphs, visible, VLEVELS, VBOOK, VWORDS, VLISTEN, views, go, render, save, adopt, state: () => S, wstate, rate, practiceResult, dueWords, isDue, TTS, esc, fr, shuffle, pick, norm, speakBtn, toast, boxClass };
  render();
  initDb();
})();
