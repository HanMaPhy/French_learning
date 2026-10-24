#!/usr/bin/env python3
"""Turn the learner's own corpus (PDFs in french/French, never committed) into Allons-y text files for Mine → Settings → Import a file.
Each output is {"app": "allons-y", "texts": [{title, text, src, level}]}; long chapters are cut into parts of about 700 words at paragraph
boundaries, so a part is a realistic dictée. Needs pypdf (pip install pypdf). Run from the project folder:  python3 tools/extract-library.py"""
import os, re, io, json, sys, glob, unicodedata
from pypdf import PdfReader
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORPUS = os.path.join(ROOT, 'french', 'French'); OUT = os.path.join(ROOT, 'library')
os.makedirs(OUT, exist_ok=True)

CJK = re.compile(r'[\u2e80-\u2fdf\u3000-\u9fff\uff00-\uffef]')

def clean(s):
    s = unicodedata.normalize('NFC', s).replace('\u200b', '').replace('\u00a0', ' ').replace('\u202f', ' ').replace('’', "'").replace('‘', "'").replace('œ', 'œ')
    s = re.sub(r'[ \t]+', ' ', s)
    return s.strip()

def reflow(text):
    """PDF lines → paragraphs: a line ending without end punctuation continues the sentence; blank lines and dialogue dashes start paragraphs."""
    out, cur = [], ''
    for raw in text.split('\n'):
        line = clean(raw)
        if not line: 
            if cur: out.append(cur); cur = ''
            continue
        if re.match(r'^\d+$', line) or 'about:blank' in line or re.match(r'^\d+/\d+/\d+, \d+:\d+ [AP]M', line): continue  # page numbers, browser print footers
        starts_new = bool(re.match(r'^(—|–|-|«)\s', line)) or (cur and re.search(r'[.!?…»]$', cur) and line[:1].isupper() and (len(cur) > 300 or words(cur) <= 7))
        if cur and not starts_new:
            label = words(cur) <= 7 and not re.search(r'[.!?…»:,;]$', cur) and line[:1].isupper()  # a speaker's name on its own line
            cur = (cur[:-1] + line) if cur.endswith('-') and line[:1].islower() else cur + (' : ' if label else ' ') + line
        else:
            if cur: out.append(cur)
            cur = line
    if cur: out.append(cur)
    return out

def words(s): return len(re.findall(r"[\w'’]+", s))

def split_parts(paras, target=700):
    parts, cur, n = [], [], 0
    for p in paras:
        if cur and n + words(p) > target * 1.25 and n >= target * 0.6: parts.append(cur); cur, n = [], 0
        cur.append(p); n += words(p)
    if cur:
        if parts and n < target * 0.35: parts[-1].extend(cur)
        else: parts.append(cur)
    return parts

def sentences(p): return [x for x in re.split(r'(?<=[.!?…])\s+(?=[«"A-ZÀ-ÝŒ0-9])', p) if x]

def repara(paras, n=6):
    """a text that came in as one or two blocks (a transcript without time stamps) is cut into paragraphs of about n sentences"""
    out = []
    for p in paras:
        ss = sentences(p)
        if len(ss) <= n + 2: out.append(p); continue
        for i in range(0, len(ss), n): out.append(' '.join(ss[i:i + n]))
    return out

def tidy(paras):
    """the French text ends where a Chinese translation or a glossary begins: cut at the first paragraph with CJK characters, drop
    stray quotation marks left by such a cut, and drop short unpunctuated tail lines (headwords of a glossary)"""
    out = []
    for p in paras:   # a Chinese translation may follow each page: keep the French part of every paragraph and nothing else
        p = re.sub(r'\s*[“”]+\s*$', '', CJK.split(p)[0]).strip()
        if p: out.append(p)
    while out and not re.search(r'[.!?…»"”)]$', out[-1]): out.pop()   # a story ends with punctuation; a glossary tail does not
    return out

def entry(title, paras, src, level, parts=True):
    paras = tidy(paras)
    if sum(words(p) for p in paras) > 300 and len(paras) < max(3, words(' '.join(paras)) // 400): paras = repara(paras)
    ps = split_parts(paras) if parts else [paras]
    res = []
    for i, part in enumerate(ps):
        t = title if len(ps) == 1 else f'{title} ({i + 1}/{len(ps)})'
        res.append({'title': t, 'text': '\n'.join(part), 'src': src, 'level': level})
    return res

def strip_title(paras, title):
    key = lambda x: re.sub(r"[^\w]+", ' ', clean(x).lower()).strip()
    if paras and key(paras[0]).startswith(key(title)):
        m = re.match(r'^\W*' + r'\W+'.join(re.escape(w) for w in key(title).split()) + r'\W*', paras[0], re.I)
        if m: paras[0] = paras[0][m.end():]
    return [p for p in paras if p]

def pdf_text(path, first=0, last=None):
    r = PdfReader(path); pages = r.pages[first:last]
    return '\n'.join((p.extract_text() or '') for p in pages)

def write(name, texts):
    path = os.path.join(OUT, name)
    io.open(path, 'w', encoding='utf8').write(json.dumps({'app': 'allons-y', 'texts': texts}, ensure_ascii=False, indent=1))
    print(f'{name}: {len(texts)} texts, {sum(words(t["text"]) for t in texts)} words')

# --- Le Petit Nicolas: one PDF per chapter, clean text layer; the first line is the title
nic = []
for path in sorted(glob.glob(os.path.join(CORPUS, '[0-9][0-9] - *.pdf'))):
    name = os.path.basename(path)[:-4]
    if name.endswith(' 1'): continue  # duplicate scan of chapter 08
    paras = reflow(pdf_text(path))
    title = re.sub(r'^\d+ - ', '', name)
    nic += entry(title, strip_title(paras, title), 'Le Petit Nicolas', 'A2')
write('petit-nicolas.json', nic)

# --- TV5Monde: short press articles, one page each; the title is the first line
tv = []
for path in sorted(glob.glob(os.path.join(CORPUS, 'tv5monde', '*.pdf'))):
    raw = pdf_text(path); first = next((clean(l) for l in raw.split('\n') if clean(l)), '')
    fname = os.path.basename(path)[:-4].replace('_', ' '); fwords = [w for w in re.findall(r'\w+', fname.lower()) if len(w) >= 4]
    alike = sum(w in first.lower() for w in fwords) >= max(1, len(fwords) // 2)
    title = first if 0 < words(first) <= 10 and alike else fname[:1].upper() + fname[1:]
    tv += entry(title, strip_title(reflow(raw), title), 'TV5Monde', 'B2', parts=False)
write('tv5monde.json', tv)

# --- InnerFrench: the PDF places one word per line; the transcript follows the heading TRANSCRIPTION and is cut by (hh:mm:ss.ff) time stamps
inner = []
for path in sorted(glob.glob(os.path.join(CORPUS, 'Ep *.pdf'))):
    toks = [clean(l) for l in pdf_text(path).split('\n')]; toks = [t for t in toks if t]
    stamp = lambda t: re.match(r'^\(\d\d:\d\d:\d\d\.\d\d\)$', t)
    title = re.sub(r'^Ep \d+ - ', '', os.path.basename(path)[:-4]); tw = [clean(w) for w in title.split()]
    heads = [i for i, t in enumerate(toks) if t.lower() == 'transcription' and [clean(x) for x in toks[i + 1:i + 1 + len(tw)]] == tw]
    if not heads:
        cands = [i for i, t in enumerate(toks) if t.lower() == 'transcription']
        print('skip', os.path.basename(path), '| title tokens', tw, '| after each Transcription:', [[clean(x) for x in toks[i + 1:i + 9]] for i in cands][-3:]); continue
    k = heads[-1] + 1 + len(tw)                              # past the heading and the title
    if k < len(toks) and re.match(r"^[A-ZÀ-Ý][\w'’-]+$", toks[k]) and (stamp(toks[k + 1]) or toks[k + 1][:1].isupper()): k += 1   # the speaker's name
    if stamp(toks[k]): k += 1
    toks = toks[k:]
    for i in range(len(toks) - 1, -1, -1):   # a page number: one or two digits right after a sentence end, before a capital
        if re.match(r'^\d{1,2}$', toks[i]) and i > 0 and re.search(r'[.!?…»]$', toks[i - 1]) and (i + 1 == len(toks) or toks[i + 1][:1].isupper()): del toks[i]
    from collections import Counter
    isname = lambda i: re.match(r'^[A-ZÀ-Ý][a-zà-ÿ]+$', toks[i]) and i + 1 < len(toks) and toks[i + 1][:1].isupper() and (i == 0 or re.search(r'[.!?…»]$', toks[i - 1]) or stamp(toks[i - 1]))
    names = {n for n, c in Counter(toks[i] for i in range(len(toks)) if isname(i)).items() if c >= 3}
    for i in range(len(toks)):
        if toks[i] in names and isname(i): toks[i] = '\n' + toks[i] + ' :'
    body = ' '.join(toks)
    body = re.sub(r'\(\d\d:\d\d:\d\d\.\d\d\)', '\n', body)          # time stamps → paragraph breaks
    body = re.sub(r'\s+([,.!?;:…»])', r'\1', body).replace('« ', '«').replace('«', '« ')
    body = re.sub(r"'\s+", "'", body)
    paras = [clean(p) for p in body.split('\n')]
    paras = [p for p in paras if words(p) > 3 and not re.match(r'^(innerfrench|page|\d+)$', p.lower())]
    inner += entry(title, paras, 'InnerFrench podcast', 'B1')
write('innerfrench.json', inner)

# --- Le Petit Prince (精听党 edition): layout extraction keeps every glyph; the French body is the left column, the Chinese translation
# and the glossary in the right column are dropped (CJK lines, and anything after a wide gap or starting deep in the page)
pp = []
SMALL = set('qui que quoi les des est une mon ton son pas sur par ses mes tes nos vos aux ils dans pour avec plus bien tout chez vous nous elle ont fait dit non oui'.split())
for path in sorted(glob.glob(os.path.join(CORPUS, '第*章*.pdf')), key=lambda x: int(re.search(r'第(\d+)章', x).group(1))):
    n = int(re.search(r'第(\d+)章', os.path.basename(path)).group(1)); lines = []; done = False
    for page in PdfReader(path).pages:
        if done: break
        for l in (page.extract_text(extraction_mode='layout') or '').split('\n'):
            l = l.replace('\u00a0', ' ').rstrip()
            if not l.strip(): continue
            if len(l) - len(l.lstrip(' ')) >= 40: continue
            if l.strip().startswith('[') and lines and words(lines[-1]) <= 3 and not re.search(r'[.!?…»]$', lines[-1]):
                lines.pop(); done = True; break   # a headword followed by its phonetics in the left column: the chapter's glossary starts here
            keep = []  # segments split by wide gaps: the text (and its highlighted words) sits left of column 88, notes to the right or in Chinese
            for m in re.finditer(r'\S(?:.*?\S)?(?= {5,}|$)', l):
                seg = m.group(0)
                if m.start() >= 88 or re.match(r'^\[.*\]$', seg): break
                seg = re.sub(r'\s*\[[^\]]*\]', '', seg)   # a phonetic transcription drifted into the text column
                if CJK.search(seg): keep.append(CJK.split(seg)[0].strip()); break
                keep.append(seg)
            t = ' '.join(keep).strip()
            if not t: continue
            # a highlighted word comes out letter-spaced (« p re m i e r », « voya g e », « m e »): a run of tiny tokens holding a letter that is
            # no word by itself is one word, together with a longer piece just before it unless that piece is a common word of its own
            toks = t.split(' '); out = []; i = 0
            while i < len(toks):
                j = i
                while j < len(toks) and re.match(r"^[\w'’-]{1,2}$", toks[j]) and not re.search(r'\d', toks[j]) and toks[j] != '-' or (j < len(toks) and toks[j] == '-' and i < j and j + 1 < len(toks) and re.match(r"^[\w'’]{1,2}$", toks[j + 1])): j += 1
                run = toks[i:j]
                if run and any(len(x) == 1 and x.isalpha() and x.islower() and x not in ('a', 'y', 'à', 'ô') for x in run):
                    if out and re.match(r"^[A-Za-zÀ-ÿ'’-]{3,}$", out[-1]) and out[-1].lower() not in SMALL: out[-1] += ''.join(run)
                    else: out.append(''.join(run))
                    i = j
                else: out.append(toks[i]); i += 1
            lines.append(re.sub(r'(\w) - (\w)', r'\1-\2', re.sub(r' +([.,])', r'\1', ' '.join(out))))
    paras = reflow('\n'.join(lines))
    pp += entry(f'Le Petit Prince, chapitre {n}', paras, 'Le Petit Prince', 'B1')
write('petit-prince.json', pp)
