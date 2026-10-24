/* Allons-y — mine: French the learner meets in daily life, pasted in and kept with the account; each text can be read aloud, explained by Claude
   (translation, vocabulary, patterns, idioms, grammar, in the same shape as the course readings) and run as a dictée. */
(function () {
  'use strict';
  const A = window.App, { views, esc, fr, go, toast } = A;
  const $ = id => document.getElementById(id), paras = A.paragraphs;

  // ---------- from a stored text to the reading shape the shared cards render ----------
  const asReading = t => { const ps = paras(t.text), ex = t.ex || null; return { title: t.title, intro: ex && ex.intro, text: ps.map((p, i) => [p, ex ? (ex.en[i] || '') : null]), notes: ex && ex.notes, vocab: ex ? ex.vocab : [], patterns: ex ? ex.patterns : [], idioms: ex ? ex.idioms : [], grammar: ex ? ex.grammar : [] }; };
  // Claude's answer is data from outside the page: keep only well-formed strings and tuples, in the counts the page expects
  const str = x => typeof x === 'string' ? x.trim() : '';
  const tuple = (a, n) => Array.isArray(a) && a.length >= n && a.slice(0, n).every(x => typeof x === 'string') ? a.slice(0, n).map(s => s.trim()) : null;
  const list = (a, n, max) => (Array.isArray(a) ? a.map(x => tuple(x, n)).filter(Boolean) : []).slice(0, max);
  const sanitize = (d, nParas) => {
    d = d && typeof d === 'object' ? d : {};
    const en = (Array.isArray(d.en) ? d.en.map(str) : []).slice(0, nParas); while (en.length < nParas) en.push('');
    return { title: str(d.title).slice(0, 80), level: /^(A1|A2|B1|B2|C1)$/.test(str(d.level)) ? str(d.level) : '', intro: str(d.intro), notes: str(d.notes), en, vocab: list(d.vocab, 4, 16), patterns: list(d.patterns, 3, 6), idioms: list(d.idioms, 3, 6), grammar: list(d.grammar, 3, 5), at: Date.now() };
  };
  const prompt = ps => `You are a French teacher writing study notes in English for an adult learner: a Chinese native speaker who reads English well, French level around B1. The learner collected the French text below and does not fully understand it.
Reply with ONLY a JSON object with these keys:
"title": a short French title for the text (its own first words if it has no title),
"level": the CEFR level the text requires, one of "A1", "A2", "B1", "B2", "C1",
"intro": one English sentence saying what kind of text this is and what it is about,
"en": an array of exactly ${ps.length} strings: a natural English translation of each paragraph, in order, one string per paragraph as given,
"notes": 2 to 4 English sentences on register, tone and what to notice (idiomatic phrasing, cultural references, anything implied),
"vocab": 8 to 14 items, each an array of 4 strings [the word or expression as a dictionary entry with its article, its part of speech such as "n.m." "n.f." "v." "adj." "adv." "phrase", its English meaning here, the short phrase from the text where it appears]; choose what a B1 learner may not know,
"patterns": 3 to 4 items, each an array of 3 strings [a reusable sentence frame with slots in square brackets, an English explanation of how and when to use it, the sentence from the text that uses it],
"idioms": 0 to 4 items that really occur in the text, each an array of 3 strings [the expression, "literally: " followed by its word-for-word meaning, what it actually means and how it is used],
"grammar": 2 to 3 items, each an array of 3 strings [the topic, an English explanation of 3 to 6 sentences, an example quoted from the text].
Use straight apostrophes, put French fragments inside « » in the English explanations, and quote only words that are in the text. Output nothing but the JSON.

The paragraphs, as a JSON array:
${JSON.stringify(ps)}`;
  // the answer as an assistant pastes it: the whole text as JSON, else the body of a code fence, else from the first { to the last }
  const parseAnswer = txt => { const s = String(txt || '').trim(); const tries = [s, (s.match(/```(?:json)?\s*([\s\S]*?)```/) || [])[1], s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)]; for (const c of tries) { if (!c) continue; try { const v = JSON.parse(c); if (v && typeof v === 'object') return v; } catch (e) { /* next */ } } return null; };
  A.mine = { asReading, sanitize, prompt, parseAnswer };

  const fmtDate = t => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const autoTitle = text => { const p0 = paras(text)[0] || '', mm = p0.match(/^(.*?[.!?…])(\s|$)/), first = mm ? mm[1] : p0; return first.length > 60 ? first.slice(0, 57).replace(/\s+\S*$/, '') + '…' : first; };

  // ---------- the list and the add form ----------
  let draft = { text: '', src: '' }; // survives a re-render (the account sync renders once when it arrives)
  views.mine = () => {
    const S = A.state(), list = Object.values(S.texts).sort((a, b) => b.added - a.added);
    const row = t => { const b = S.dictee['audio:' + t.id] || S.dictee['mine:' + t.id], n = A.reading.words(asReading(t)); return `<button class="drow" data-go="mytext|${t.id}"><span><span class="t fr" style="font-size:1.1rem">${fr(t.title)}</span><br><span class="sub en">${n} words · ${fmtDate(t.added)}${t.src ? ' · ' + esc(t.src) : ''}${t.level ? ' · ' + esc(t.level) : ''}${t.audio ? ' · ♪ recording' : ''}</span></span><span class="pill num" style="${b ? (b.score === b.total ? 'background:var(--good-soft);color:var(--good)' : 'background:var(--warn-soft);color:var(--warn)') : t.ex ? 'background:var(--accent-soft);color:var(--accent)' : ''}">${b ? 'dictée ' + Math.round(100 * b.score / b.total) + '%' : t.ex ? 'explained' : 'new'}</span></button>`; };
    // grouped by source once there is more than one: a course book's dialogues stay together; the group touched last opens
    const groups = {}; list.forEach(t => { const g = t.src || 'Pasted'; (groups[g] = groups[g] || []).push(t); });
    const last = g => Math.max(0, ...groups[g].map(t => t.updated || 0)), names = Object.keys(groups).sort((a, b) => last(b) - last(a));
    const body = names.length > 1 ? names.map((g, k) => `<details class="sec" style="margin-top:10px" ${k === 0 ? 'open' : ''}><summary><span class="fr" style="font-weight:600">${esc(g)}</span><span class="en">${groups[g].length} text${groups[g].length > 1 ? 's' : ''}</span></summary><div class="lessons" style="margin-top:10px">${groups[g].map(row).join('')}</div></details>`).join('') : `<div class="lessons" style="margin-top:10px">${list.map(row).join('')}</div>`;
    return `<div class="lesson-head"><span class="eyebrow">Mine</span><h1>Your own texts</h1>
      <p class="en">French you meet in daily life: a message, a notice, a paragraph from an article. Paste it here and it is kept with your account. Open a text to hear it sentence by sentence, have Claude explain it the way the course readings are explained, and run it as a dictée.</p></div>
    <div class="card"><span class="eyebrow">Add a text</span>
      <textarea class="dict" id="newText" placeholder="Collez le texte ici…" style="min-height:140px;font-size:1.05rem;margin-top:8px" autocapitalize="off" spellcheck="false">${esc(draft.text)}</textarea>
      <div class="row" style="margin-top:10px"><input class="dict" id="newSrc" type="text" placeholder="Where it is from (optional)" value="${esc(draft.src)}" style="margin-top:0;flex:1 1 200px;font-size:1rem" autocomplete="off"><button class="btn primary" id="addText">Save</button></div></div>
    ${list.length ? `<div class="card"><span class="eyebrow">${list.length} text${list.length > 1 ? 's' : ''}</span>${body}</div>` : '<div class="card"><p class="en">Nothing here yet. The first text you save appears below the form.</p></div>'}`;
  };
  views.mine.after = () => {
    const ta = $('newText'), src = $('newSrc');
    ta.addEventListener('input', () => { draft.text = ta.value; }); src.addEventListener('input', () => { draft.src = src.value; });
    $('addText').addEventListener('click', () => {
      const text = paras(ta.value).join('\n');
      if (!text || !/[\p{L}]/u.test(text)) { toast('Paste some French first'); ta.focus(); return; }
      const t = A.texts.add({ title: autoTitle(text), autoTitle: true, text, src: src.value.trim().slice(0, 80), level: '', ex: null, added: Date.now() });
      draft = { text: '', src: '' }; toast('Saved'); go('mytext', { id: t.id });
    });
  };

  // ---------- one text: read, explain, dictée, edit, delete ----------
  let U = null, ctl = null;
  views.mytext = v => {
    const t = A.state().texts[v.id]; if (!t) return views.mine();
    if (!U || U.id !== t.id) U = { id: t.id, en: false, slow: false, busy: false, err: '', edit: false };
    const r = asReading(t);
    const head = `<div class="lesson-head"><div class="row"><button class="btn ghost" data-go="mine">← Mine</button>${t.level ? `<span class="pill lvl">${esc(t.level)}</span>` : ''}<span class="pill num">${A.reading.words(r)} words</span>${t.src ? `<span class="pill">${esc(t.src)}</span>` : ''}<span class="pill num">${fmtDate(t.added)}</span></div>
      <h1 class="fr" style="font-size:1.8rem">${fr(t.title)}</h1>${r.intro ? `<p class="en">${esc(r.intro)}</p>` : ''}</div>`;
    if (U.edit) return `${head}<div class="card"><span class="eyebrow">Edit</span>
      <input class="dict" id="edTitle" type="text" value="${esc(t.title)}" placeholder="Title" style="font-size:1.05rem">
      <textarea class="dict" id="edText" style="min-height:200px;font-size:1.05rem;margin-top:10px" autocapitalize="off" spellcheck="false">${esc(t.text)}</textarea>
      <input class="dict" id="edSrc" type="text" value="${esc(t.src || '')}" placeholder="Where it is from (optional)" style="font-size:1rem">
      <input class="dict" id="edAudio" type="text" value="${esc(t.audio || '')}" placeholder="Recording: a file name such as 12. Le travail 1.mp3 (optional)" style="font-size:1rem" autocomplete="off">
      <p class="en" style="margin-top:8px;font-size:.9rem">${t.ex ? 'Changing the text itself removes its explanation; the title and source can change freely.' : ''}</p>
      <div class="actions"><button class="btn" id="edCancel">Cancel</button><button class="btn primary" id="edSave">Save</button></div></div>`;
    const explain = t.ex ? '' : `<div class="card"><span class="eyebrow">Explain</span>
      <p class="en" style="margin-top:6px">Claude reads the text and writes what the course readings have: a translation of each paragraph, the words worth learning, sentence patterns, idioms and the grammar at work. It runs on your own Claude account; the first time, the page asks your permission.</p>
      <div class="row" style="margin-top:10px"><button class="btn primary" id="explain" ${U.busy ? 'disabled' : ''}>${U.busy ? 'Thinking…' : 'Explain this text'}</button>${U.busy ? '<button class="btn" id="stopExplain">Stop</button>' : ''}<span class="en" id="explainNote">${esc(U.err)}</span></div>
      <details class="sec" style="margin-top:12px"><summary><span class="eyebrow">Without Claude</span><span class="en">copy the prompt, paste the answer</span></summary>
        <p class="en" style="margin-top:8px;font-size:.9rem">Copy the prompt and give it to any assistant you like; paste its JSON answer below and it is kept exactly as if it had been written here. Or just read the text elsewhere: <a href="https://www.deepl.com/translator#fr/en/${encodeURIComponent(t.text.slice(0, 3000))}" target="_blank" rel="noopener">open in DeepL</a>.</p>
        <div class="row" style="margin-top:8px"><button class="btn" id="copyPrompt">Copy prompt</button><span class="en" id="copyNote" style="font-size:.9rem"></span></div>
        <textarea class="dict" id="pasteAnswer" placeholder="Paste the JSON answer here…" style="min-height:110px;font-size:.95rem;font-family:var(--font-ui);margin-top:10px" spellcheck="false"></textarea>
        <div class="actions"><button class="btn primary" id="useAnswer">Use this answer</button></div></details></div>`;
    const audio = t.audio ? A.audio.card(t.audio, { buttons: `<button class="btn" data-go="adictee|${t.id}">Dictée from the recording</button>` }) : '';
    return head + audio + A.reading.textCard(r, U, { dictee: 'mine:' + t.id }) + explain + (t.ex ? A.reading.notesCards(r) : '')
      + `<div class="card"><div class="row"><span class="eyebrow">This text</span><span class="grow"></span>${t.ex ? `<button class="btn ghost" id="reexplain" ${U.busy ? 'disabled' : ''}>${U.busy ? 'Thinking…' : 'Explain again'}</button>` : ''}<button class="btn ghost" id="editText">Edit</button><button class="btn ghost" id="delText">Delete</button></div>${t.ex && U.err ? `<p class="en" style="margin-top:6px">${esc(U.err)}</p>` : ''}</div>`;
  };
  const COPY = { not_granted: 'You did not allow this page to use Claude. Allow it from the page\'s Permissions menu and try again.', sampling_disabled: 'Claude is not available on this account.', rate_limited: 'Claude is busy or your usage limit is reached: try again in a little while.', session_expired: 'Please sign in to claude.ai again.', refused: 'Claude declined to explain this text.', invalid_json: 'The answer could not be read: try once more, or shorten the text.', prompt_too_large: 'This text is too long for one explanation: split it in two.', empty_completion: 'Claude gave no answer: try once more.', cancelled: '' };
  const explain = async (t, again) => {
    const sample = window.claude && typeof claude.use === 'function' ? await claude.use('sample') : null;
    if (!sample) { U.err = 'Explaining works when this page is open on claude.ai, signed in.'; A.render(); return; }
    const ps = paras(t.text); U.busy = true; U.err = ''; A.render(); ctl = new AbortController();
    try {
      const data = await sample.json(prompt(ps), Object.assign({ signal: ctl.signal }, again ? { cache: false } : {}));
      const ex = sanitize(data, ps.length), patch = { ex, level: ex.level || t.level };
      if (t.autoTitle && ex.title) patch.title = ex.title;
      A.texts.update(t.id, patch); toast('Explained');
    } catch (e) { U.err = COPY[e && e.code] !== undefined ? COPY[e.code] : 'Something went wrong on the way to Claude: try again.'; }
    U.busy = false; ctl = null; A.render();
  };
  views.mytext.after = v => {
    const t = A.state().texts[v.id]; if (!t) return;
    if (U.edit) {
      $('edCancel').addEventListener('click', () => { U.edit = false; A.render(); });
      $('edSave').addEventListener('click', () => {
        const text = paras($('edText').value).join('\n'), title = $('edTitle').value.trim().slice(0, 80) || autoTitle(text), src = $('edSrc').value.trim().slice(0, 80);
        if (!text) { toast('The text cannot be empty'); return; }
        const patch = { title, src, audio: $('edAudio').value.trim().slice(0, 120), autoTitle: title === t.title ? t.autoTitle : false }; if (text !== t.text) Object.assign(patch, { text, ex: null, level: '' });
        A.texts.update(t.id, patch); U.edit = false; A.render();
      });
      return;
    }
    A.reading.wirePlayer(asReading(t), U, A.render);
    if (t.audio) A.audio.wire(t.audio);
    if ($('explain')) $('explain').addEventListener('click', () => explain(t, false));
    if ($('reexplain')) $('reexplain').addEventListener('click', () => explain(t, true));
    if ($('stopExplain')) $('stopExplain').addEventListener('click', () => { if (ctl) ctl.abort(); });
    if ($('copyPrompt')) $('copyPrompt').addEventListener('click', () => {
      const p = prompt(paras(t.text)), note = $('copyNote'), done = () => { note.textContent = 'Copied. Paste it to your assistant.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(p).then(done).catch(() => { $('pasteAnswer').value = p; $('pasteAnswer').select(); note.textContent = 'Copy the prompt from the box below, then clear it for the answer.'; });
      else { $('pasteAnswer').value = p; $('pasteAnswer').select(); note.textContent = 'Copy the prompt from the box below, then clear it for the answer.'; }
    });
    if ($('useAnswer')) $('useAnswer').addEventListener('click', () => {
      const d = parseAnswer($('pasteAnswer').value); if (!d) { toast('No JSON object found in the pasted text'); return; }
      const ps = paras(t.text), ex = sanitize(d, ps.length), patch = { ex, level: ex.level || t.level }; if (t.autoTitle && ex.title) patch.title = ex.title;
      A.texts.update(t.id, patch); toast('Explanation saved'); A.render();
    });
    $('editText').addEventListener('click', () => { U.edit = true; A.render(); });
    const del = $('delText');
    del.addEventListener('click', () => { if (!del.dataset.armed) { del.dataset.armed = '1'; del.textContent = 'Tap again to delete'; return; } A.texts.remove(t.id); toast('Deleted'); go('mine'); });
  };
})();
