/* Allons-y — reading: one long text per lesson, read aloud sentence by sentence, with notes, vocabulary, sentence patterns, idioms and grammar.
   The text card and the notes cards are shared with the learner's own texts (app-mine.js). */
(function () {
  'use strict';
  const A = window.App, { views, esc, fr, speakBtn, TTS, go } = A;
  const $ = id => document.getElementById(id);
  const wordCount = t => t.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
  const words = r => r.text.reduce((n, p) => n + wordCount(p[0]), 0);

  // r: { title, intro?, text: [[fr, en | null], …], notes?, vocab?, patterns?, idioms?, grammar? }; ui: { en, slow }
  const textCard = (r, ui, o = {}) => {
    const hasEn = r.text.some(p => p[1]);
    return `<div class="card">
      <div class="player"><button class="btn primary" id="playAll">▶ Play all</button><button class="btn" id="slowAll" aria-pressed="${ui.slow ? 'true' : 'false'}" title="In breath groups, with a pause between them" style="${ui.slow ? 'background:var(--accent-soft);border-color:var(--accent)' : ''}">Slow${ui.slow ? ': on' : ''}</button>${hasEn ? `<button class="btn" id="showEn">${ui.en ? 'Hide' : 'Show'} English</button>` : ''}${o.dictee ? `<button class="btn" data-go="dictee|${o.dictee}">Dictée</button>` : ''}${o.buttons || ''}</div>
      <div class="reading" id="paras" data-slow="${ui.slow ? '1' : ''}">${r.text.map((p, i) => `<div class="para" id="p${i}">${speakBtn(p[0])}<div><p class="fr">${fr(p[0])}</p>${ui.en && p[1] ? `<p class="en">${esc(p[1])}</p>` : ''}</div></div>`).join('')}</div>
      ${o.footer || ''}</div>`;
  };
  const sec = (id, title, count, body) => `<details class="card sec" id="${id}" open><summary><span class="eyebrow">${title}</span><span class="en num">${count}</span></summary>${body}</details>`;
  const notesCards = r => {
    const v = r.vocab || [], p = r.patterns || [], i = r.idioms || [], g = r.grammar || [];
    return (r.notes ? `<div class="card"><span class="eyebrow">About this text</span><p class="notes">${esc(r.notes)}</p></div>` : '')
      + (v.length ? sec('vocab', 'Vocabulary', v.length + ' words', `<div class="gloss">${v.map(w => `<div class="g"><div class="g-head"><span class="fr">${fr(w[0])}</span>${speakBtn(w[0])}<span class="pos">${esc(w[1])}</span><span class="meaning">${esc(w[2])}</span></div><div class="g-ctx fr">${fr(w[3])}</div></div>`).join('')}</div>`) : '')
      + (p.length ? sec('patterns', 'Sentence patterns', p.length, p.map(x => `<div class="note"><div class="fr pattern">${fr(x[0])}</div><p class="en">${esc(x[1])}</p><div class="ex-line">${speakBtn(x[2])}<span class="fr">${fr(x[2])}</span></div></div>`).join('')) : '')
      + (i.length ? sec('idioms', 'Idioms &amp; expressions', i.length, i.map(x => `<div class="note"><div class="row"><span class="fr pattern">${fr(x[0])}</span>${speakBtn(x[0])}</div><p class="en lit">${esc(x[1])}</p><p class="en">${esc(x[2])}</p></div>`).join('')) : '')
      + (g.length ? sec('grammar', 'Grammar', g.length + ' points', g.map(x => `<div class="note"><h3>${esc(x[0])}</h3><p class="en">${esc(x[1])}</p><div class="ex-line">${speakBtn(x[2])}<span class="fr">${fr(x[2])}</span></div></div>`).join('')) : '');
  };
  // wires Play all (one utterance per sentence, the paragraph being read highlighted), the Slow toggle and Show English; `rerender` is called after a toggle
  const wirePlayer = (r, ui, rerender) => {
    const pa = $('playAll'); if (!pa) return;
    const items = []; r.text.forEach((p, pi) => TTS.sentences(p[0]).forEach(s => items.push({ pi, s })));
    pa.addEventListener('click', () => {
      if (pa.dataset.on) { TTS.stop(); pa.dataset.on = ''; pa.textContent = '▶ Play all'; document.querySelectorAll('.para').forEach(el => el.classList.remove('active')); return; }
      pa.dataset.on = '1'; pa.textContent = '■ Stop';
      TTS.seq(items.map(x => x.s), { gap: 350, slow: ui.slow, each: i => { document.querySelectorAll('.para').forEach(el => el.classList.remove('active')); const el = $('p' + items[i].pi); if (el) { el.classList.add('active'); if (i === 0 || items[i - 1].pi !== items[i].pi) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } },
        end: () => { pa.dataset.on = ''; pa.textContent = '▶ Play all'; document.querySelectorAll('.para').forEach(el => el.classList.remove('active')); } });
    });
    $('slowAll').addEventListener('click', () => { ui.slow = !ui.slow; TTS.stop(); rerender(); });
    if ($('showEn')) $('showEn').addEventListener('click', () => { ui.en = !ui.en; rerender(); });
  };
  A.reading = { words, textCard, notesCards, wirePlayer };
  A.readingWords = words;

  let R = null; // per-reading UI state: English shown, slow reading on
  views.reading = v => {
    const r = A.READING[v.id], l = A.LESSONS[v.id]; if (!r || !l) return views.lesson(v);
    if (!R || R.id !== r.lesson) R = { id: r.lesson, en: false, slow: false };
    const S = A.state(), read = S.read && S.read[l.id];
    return `<div class="lesson-head">
      <div class="row"><button class="btn ghost" data-go="lesson|${l.id}">← ${esc(l.t)}</button><span class="pill lvl">${l.lvl}</span><span class="pill">${esc(r.genre)}</span><span class="pill num">${words(r)} words</span></div>
      <h1 class="fr" style="font-size:2rem">${fr(r.title)}</h1>
      ${r.intro ? `<p class="en">${esc(r.intro)}</p>` : ''}
    </div>
    ${textCard(r, R, { dictee: 'reading:' + l.id, footer: `<div class="actions"><button class="btn ${read ? '' : 'primary'}" id="markRead">${read ? 'Read ✓ · mark as unread' : 'Mark as read'}</button></div>` })}
    ${notesCards(r)}`;
  };
  views.reading.after = v => {
    const r = A.READING[v.id], l = A.LESSONS[v.id]; if (!r || !l) return;
    const S = A.state();
    wirePlayer(r, R, A.render);
    $('markRead').addEventListener('click', () => { S.read = S.read || {}; if (S.read[l.id]) delete S.read[l.id]; else S.read[l.id] = Date.now(); A.save(); A.render(); });
  };
})();
