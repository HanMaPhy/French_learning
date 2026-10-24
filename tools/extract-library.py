#!/usr/bin/env python3
"""Turn the learner's own corpus (PDFs in french/French, never committed) into Allons-y text files for Mine → Settings → Import a file.
Each output is {"app": "allons-y", "texts": [{title, text, src, level}]}; long chapters are cut into parts of about 700 words at paragraph
boundaries, so a part is a realistic dictée. Needs pypdf (pip install pypdf). Run from the project folder:  python3 tools/extract-library.py"""
import os, re, io, json, sys, glob
from pypdf import PdfReader
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORPUS = os.path.join(ROOT, 'french', 'French'); OUT = os.path.join(ROOT, 'library')
os.makedirs(OUT, exist_ok=True)

def clean(s):
    s = s.replace('\u00a0', ' ').replace('\u202f', ' ').replace('’', "'").replace('‘', "'").replace('œ', 'œ')
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
        if re.match(r'^\d+$', line): continue  # page numbers
        starts_new = bool(re.match(r'^(—|–|-|«)\s', line)) or (cur and re.search(r'[.!?…»]$', cur) and line[:1].isupper() and len(cur) > 300)
        if cur and not starts_new:
            cur = (cur[:-1] + line) if cur.endswith('-') and line[:1].islower() else cur + ' ' + line
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

def entry(title, paras, src, level, parts=True):
    ps = split_parts(paras) if parts else [paras]
    res = []
    for i, part in enumerate(ps):
        t = title if len(ps) == 1 else f'{title} ({i + 1}/{len(ps)})'
        res.append({'title': t, 'text': '\n'.join(part), 'src': src, 'level': level})
    return res

def strip_title(paras, title):
    if paras and paras[0].lower().startswith(title.lower()): paras[0] = paras[0][len(title):].lstrip(' .:')
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
    title = first if 0 < words(first) <= 10 else os.path.basename(path)[:-4].replace('_', ' ')
    tv += entry(title, strip_title(reflow(raw), title), 'TV5Monde', 'B2', parts=False)
write('tv5monde.json', tv)

# --- InnerFrench: the PDF places one word per line; the transcript follows the heading TRANSCRIPTION and is cut by (hh:mm:ss.ff) time stamps
inner = []
for path in sorted(glob.glob(os.path.join(CORPUS, 'Ep *.pdf'))):
    toks = [clean(l) for l in pdf_text(path).split('\n')]; toks = [t for t in toks if t]
    stamp = lambda t: re.match(r'^\(\d\d:\d\d:\d\d\.\d\d\)$', t)
    starts = [k for k, t in enumerate(toks) if t.lower() == 'transcription' and any(stamp(x) for x in toks[k + 1:k + 16]) and not any(x.isdigit() for x in toks[k + 1:k + 4])]
    if not starts: print('skip', path); continue
    k = starts[-1]; k = next(i for i in range(k, len(toks)) if stamp(toks[i]))   # skip the heading, the title and the speaker's name
    body = ' '.join(toks[k:])
    body = re.sub(r'\(\d\d:\d\d:\d\d\.\d\d\)', '\n', body)          # time stamps → paragraph breaks
    body = re.sub(r'\s+([,.!?;:…»])', r'\1', body).replace('« ', '«').replace('«', '« ')
    body = re.sub(r"'\s+", "'", body)
    paras = [clean(p) for p in body.split('\n')]
    paras = [p for p in paras if words(p) > 3 and not re.match(r'^(innerfrench|page|\d+)$', p.lower())]
    title = re.sub(r'^Ep \d+ - ', '', os.path.basename(path)[:-4])
    inner += entry(title, paras, 'InnerFrench podcast', 'B1')
write('innerfrench.json', inner)

# --- Le Petit Prince (精听党 edition): layout extraction keeps every glyph; the French body is the left column, the Chinese translation
# and the glossary in the right column are dropped (CJK lines, and anything after a wide gap or starting deep in the page)
CJK = re.compile(r'[\u3000-\u9fff\uff00-\uffef]')
pp = []
for path in sorted(glob.glob(os.path.join(CORPUS, '第*章*.pdf')), key=lambda x: int(re.search(r'第(\d+)章', x).group(1))):
    n = int(re.search(r'第(\d+)章', os.path.basename(path)).group(1)); lines = []
    for page in PdfReader(path).pages:
        for l in (page.extract_text(extraction_mode='layout') or '').split('\n'):
            if len(l) - len(l.lstrip(' ')) >= 40: continue
            l = re.split(r' {5,}', l.replace('\u00a0', ' ').rstrip())[0].strip()
            if not l or CJK.search(l) or re.match(r'^\[.*\]$', l): continue
            lines.append(l)
    paras = reflow('\n'.join(lines))
    pp += entry(f'Le Petit Prince, chapitre {n}', paras, 'Le Petit Prince', 'B1')
write('petit-prince.json', pp)
