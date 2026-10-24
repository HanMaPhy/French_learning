#!/usr/bin/env python3
"""Turn the OCR of the « en Dialogues » books (CLE International) into Mine import files, each dialogue carrying the name of its
recording, so the app can play the real voices and run the dictée from them.

Input:  library/ocr/<book>/pNNN.json written by tools/ocr-pdf.swift (see the README: the books are scanned, so they are OCR'd first).
Output: library/en-dialogues-<book>.json, importable from Settings → Import a file. Nothing here is committed: the books are copyrighted.

Run from the project folder:  python3 tools/extract-dialogues.py"""
import io, os, re, json, glob, unicodedata, difflib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORPUS = os.path.join(ROOT, 'french', 'French', 'en Dialogues')
OCR = os.path.join(ROOT, 'library', 'ocr')
OUT = os.path.join(ROOT, 'library')

# ---------- text clean-up ----------
# OCR gives the words; this restores the typography the data files use (straight apostrophes, a space before ? ! ; :, « … »)
# and undoes the usual OCR slips: footnote marks read as ' ! ?, a capital J read as l at the start of a sentence.
JE_VERBS = r"suis|vais|voudrais|veux|peux|sais|pense|crois|dois|ne|me|te|vous|lui|les|le|la|regarde|rigole|trouve|comprends|regrette|propose|viens|prends|fais|dis|vois|cherche|reviens|pars|reste|mange|bois|vends|achète|habite|travaille|aime|adore|déteste|connais|rappelle|parle|passe|rentre|sors|attends|demande|espère|imagine|ai|avais|étais|serais|voulais|pouvais|finis|commence|arrive|descends|monte|tombe|laisse|donne|mets|lis|écris|appelle|réponds|téléphone|préférerais|aimerais|pourrais|devrais|saurais|sais|tiens|crains|préfère|déjeune|dîne|dors|pleure|ris|souris|cours|marche|tourne|nage|joue|chante|danse|gagne|perds|paie|paye|signe|compte|note|oublie|garde|range|lave|nettoie|choisis|offre|ouvre|ferme|allume|éteins|cuisine|invite|réserve|loue|vends|conduis|roule|pose|montre|explique|raconte|promets|jure|suppose|parie|préviens|vérifie|essaie|essaye|continue|termine|quitte|retourne|rejoins|t'|m'|n'|l'|j'"
def clean(s):
    s = unicodedata.normalize('NFC', s).replace(' ', ' ').replace(' ', ' ').replace('’', "'").replace('‘', "'")
    s = re.sub(r'\.{3}', '…', s).replace('. . .', '…')
    s = re.sub(r'[¹²³⁴⁵]', '', s)
    s = re.sub(r"(?<=[\wé])'(?=\s*[.,;:!?…»)]|\s*$)", '', s)  # a footnote mark read as an apostrophe: « plus'… »
    s = re.sub(r'(?<=\w)[!?](?=[,.])', '', s)  # a footnote mark read as ! or ? before a comma or a full stop
    s = re.sub(r"(?<=[a-zà-ÿ]{3})'(?=\s)", '', s)  # « beurs' tous » : a footnote mark; an apostrophe is never followed by a space
    s = re.sub(r"\s'\s*(?=[?!.,;:…])", '', s)  # « main ' ? » : the same, with a space before it
    s = re.sub(r"\b([ldjmntscLDJMNTSC]|[qQ]u)'\s+(?=[a-zà-ÿœ])", r"\1'", s)  # « l' avion » : a space slipped in
    s = re.sub(r'\s*([?!;])', r' \1', s)
    s = re.sub(r'(?<=[^\d\s])\s*:', ' :', s)  # a space before a colon, except in times like 16:35
    s = re.sub(r'«\s*', '« ', s); s = re.sub(r'\s*»', ' »', s)
    s = re.sub(r'\s+([,.…])', r'\1', s)
    s = re.sub(r"(^|[.!?…]\s+|:\s+|«\s+)l'ai\b", r"\1J'ai", s)
    s = re.sub(r"(^|[.!?…]\s+|:\s+|«\s+)le (?=(?:%s)\b)" % JE_VERBS, r'\1Je ', s)
    s = re.sub(r"(^|[.!?…]\s+|:\s+|«\s+)l'(?=(?:ai|avais|aurai|aurais|étais|aime|adore|espère|habite|appelle|attends|arrive|essaie|essaye|ouvre|oublie|écris|entends|invite|imagine|achète|allume|éteins)\b)", r"\1J'", s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s
def norm(s):
    s = unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()
def sentence_case(t, body=''):
    """A title in capitals becomes a sentence; a word the dialogue itself capitalises inside a sentence (a name, a place) keeps its capital."""
    low = set(w.lower() for w in re.findall(r"[\wÀ-ÿ-]+", body) if w[:1].islower())
    proper = set(w for w in re.findall(r"(?<=[a-zà-ÿ,;] )([A-ZÀ-ÜŒ][\wÀ-ÿ-]+)", body) + re.findall(r"^([A-ZÀ-ÜŒ][\wÀ-ÿ-]+)(?: [\wÀ-ÿ-]+)* :", body, re.M) if w.lower() not in low)
    t = clean(t).rstrip(' .').lower()
    t = re.sub(r"[\wÀ-ÿ-]+", lambda m: next((w for w in proper if w.lower() == m.group(0)), m.group(0)), t)
    t = re.sub(r'(^|« )(\w)', lambda m: m.group(1) + m.group(2).upper(), t)
    return t

# ---------- lines → turns ----------
NAMED = re.compile(r"^(?P<name>[A-ZÀ-ÜŒ][\w'’.\- ]{0,26}?)(?P<dir>\s*\([^)]*\))?\s*(?P<sep>:|\s[-–—])\s*(?P<text>\S.*)$")
UNNAMED = re.compile(r"^[-–—]\s*(?P<text>\S.*)$")
def is_caps(t):
    letters = re.sub(r'[^\w]', '', re.sub(r'\d+(er|re|e|ème)\b', '', t).replace('_', ''))
    letters = re.sub(r'\d', '', letters)
    return len(letters) >= 2 and letters == letters.upper()
def turn_of(t):
    if t.startswith('(') and t.count('(') > t.count(')'): t = t[1:].lstrip()
    m = UNNAMED.match(t)
    if m: return ('', m.group('text'))
    m = NAMED.match(t)
    if m:
        name = m.group('name').strip()
        if len(name.split()) <= 4 and not re.search(r'[.!?…]$', name.rstrip()) or re.match(r'^(M|Mme|Mlle|Dr|Me)\.', name):
            return (name + (m.group('dir') or ''), m.group('text'))
    return None
def join(prev, nxt):
    if re.search(r'[A-Za-zÀ-ÿ]-$', prev) and re.match(r'[a-zà-ÿ]', nxt): return prev[:-1] + nxt
    return prev + ' ' + nxt

class Block:
    def __init__(self, x0, x1): self.title, self.paras, self.turns, self.named, self.x0, self.x1, self.top, self.bottom = '', [], 0, 0, x0, x1, 0, 1
    def add_turn(self, name, text):
        self.paras.append(['turn', name, text]); self.turns += 1; self.named += 1 if name else 0
    def add_stage(self, text): self.paras.append(['stage', '', text])
    def add_cont(self, text):
        if self.paras: self.paras[-1][2] = join(self.paras[-1][2], text)
        else: self.paras.append(['stage', '', text])
    def names(self): return set(re.sub(r'\s*\(.*', '', n) for k, n, t in self.paras if k == 'turn' and n)
    def text(self, heading=None):
        out = [heading] if heading else []
        for k, name, t in self.paras:
            t = clean(t)
            if not t: continue
            if k == 'stage': out.append(t if t.startswith('(') else '(' + t.rstrip('.') + '.)')
            elif name: out.append(clean(name) + ' : ' + t)
            else: out.append('– ' + t)
        return '\n'.join(out)

def page_lines(book, p, second=None):
    """The OCR lines of a page. With a second OCR pass of the same page (another scale), a line the first pass cut short near the
    gutter takes the second pass's longer reading, and a line the first pass missed is added."""
    fn = os.path.join(OCR, book, 'p%03d.json' % p)
    if not os.path.exists(fn): return None
    lines = json.load(io.open(fn, encoding='utf8'))['lines']
    fn2 = os.path.join(OCR, second, 'p%03d.json' % p) if second else None
    if not fn2 or not os.path.exists(fn2): return lines
    other = json.load(io.open(fn2, encoding='utf8'))['lines']; used = set()
    same = lambda a, b: abs(a['y'] - b['y']) < 0.007 and abs(a['x'] - b['x']) < 0.03
    for l in lines:
        m = [(k, o) for k, o in enumerate(other) if k not in used and same(l, o)]
        if not m: continue
        k, o = min(m, key=lambda ko: abs(ko[1]['y'] - l['y'])); used.add(k)
        a, b = l['text'].strip(), o['text'].strip()
        if len(b) > len(a) and norm(b).startswith(norm(a)[:max(8, len(norm(a)) - 3)]): l['text'] = b; l['w'] = max(l['w'], o['w'])
    for k, o in enumerate(other):
        if k not in used and o['h'] >= 0.009 and not any(abs(o['y'] - l['y']) < 0.012 and abs(o['x'] - l['x']) < 0.03 for l in lines): lines.append(o)
    return lines

CAPWORD = r"[A-ZÀ-ÜŒÇ0-9'’:«»!?.,\-…()]*[A-ZÀ-ÜŒÇ][A-ZÀ-ÜŒÇ0-9'’:«»!?.,\-…()]*(?:\d+(?:er|re|e))?"
def title_of(l, t):
    """The title a line carries: the whole line in capitals, or its leading run of capitalised words when OCR glued a picture label to it
    (« DANS UNE ANIMALERIE un hamster »). None when the line is not a title."""
    if l['h'] < 0.012: return None
    t = unicodedata.normalize('NFC', t)
    if is_caps(t) and re.fullmatch(r"[A-ZÀ-ÜŒÇ0-9'’ :«»!?.,\-…()]+", re.sub(r'\d+(er|re|e)\b', '', t)) and len(re.sub(r'[^A-ZÀ-ÜŒÇ]', '', t)) >= 2: return t
    m = re.match(r"^((?:%s\s+){2,}%s)(?=\s+[a-zà-ÿ])" % (CAPWORD, CAPWORD), t)
    if m and len(m.group(1).split()) * 2 >= len(t.split()): return m.group(1)
    return None

def blocks_on(lines, body_h, xmax=1.0, ymax=0.925, stop=None, stage_first=False, foot=None):
    """Collect the dialogue boxes of a page. A box is a run of turns (« Name : … » or « – … ») that start at the same left margin; boxes
    can sit side by side in two columns, so lines are grouped by their left edge first and by their height on the page second. The
    wrapped lines of a turn and the stage directions in parentheses are attached to the box they fall in; the title in capitals just
    above a box is its title (two title lines are joined). Lines smaller than body_h are footnotes and are skipped."""
    ymin = max([l['y'] for l in lines if stop and stop.match(l['text'].strip()) and l['y'] < 0.8] or [0])  # a heading that ends the dialogue part of the page
    L = [(l, l['text'].strip()) for l in lines if l['x'] < xmax and ymin < l['y'] < ymax and l['h'] >= body_h and not re.fullmatch(r'[\d\s.]*', l['text'].strip())
         and not re.match(r'^\d+[.)]?\s+[A-ZÀ-ÜŒ]', l['text'].strip())  # « 1 Je n'en peux plus : … » is a footnote
         and not (foot and l['y'] < foot[0] and l['h'] < foot[1])]  # small print at the foot of the page: the rest of a footnote
    L.sort(key=lambda a: (-round(a[0].get('yl', a[0]['y']), 3), a[0]['x']))
    turns = [(l, t, turn_of(t)) for l, t in L]
    turns = [(l, t, tn) for l, t, tn in turns if tn]
    caps = [(l, title_of(l, t)) for l, t in L if title_of(l, t)]
    # left-edge clusters of the turn lines
    xs = sorted(set(round(l['x'], 2) for l, t, tn in turns)); clusters = []
    for x in xs:
        if clusters and x - clusters[-1][-1] <= 0.035: clusters[-1].append(x)
        else: clusters.append([x])
    blocks = []
    for c in clusters:
        x0 = c[0] - 0.02; members = [(l, t, tn) for l, t, tn in turns if c[0] <= round(l['x'], 2) <= c[-1]]
        x1 = max(l['x'] + l['w'] for l, t, tn in members) + 0.03
        inside = lambda l: x0 <= l['x'] <= x1 and (l['x'] + l['w'] / 2) <= x1
        cur = None; prev_y = None
        for l, t, tn in members:
            split = cur is None or any(l.get('yl', l['y']) < cl['y'] < prev_y and inside(cl) for cl, ct in caps)
            if split: cur = Block(x0, x1); cur.top = l['y'] + l['h']; blocks.append(cur)
            cur.add_turn(*tn); cur.bottom = l['y']; cur.rows = getattr(cur, 'rows', []) + [l]; prev_y = l.get('yl', l['y'])
    # the other lines: wrapped turn lines and stage directions, in the box they fall in; then the paragraphs are put back in reading order
    others = [(l, t) for l, t in L if not turn_of(t) and not title_of(l, t)]
    for l, t in others:
        home = None
        for b in blocks:
            if not (b.x0 - 0.02 <= l['x'] <= b.x0 + 0.06): continue  # wrapped lines start at the box's left margin; a picture label elsewhere is not text
            if b.bottom - 0.05 <= l['y'] <= b.top + (0.035 if re.match(r'^\(', t) or stage_first else 0.004): home = b if home is None or abs(l['y'] - (b.top + b.bottom) / 2) < abs(l['y'] - (home.top + home.bottom) / 2) else home
        if home is None: continue
        home.rows.append(l); home.rows_text = getattr(home, 'rows_text', {}); home.rows_text[id(l)] = t
    for b in blocks:
        rows = sorted(b.rows, key=lambda l: (-round(l.get('yl', l['y']), 3), l['x'])); b.paras = []; b.turns = b.named = 0; b.top = max(l['y'] + l['h'] for l in rows)
        for l in rows:
            t = l['text'].strip(); tn = turn_of(t)
            if tn: b.add_turn(*tn)
            elif re.match(r'^\(.*\)$', t) or (stage_first and not b.paras): b.add_stage(t)
            else: b.add_cont(t)
    # titles: the capitals just above a block, inside its width; two of them are joined top first
    for b in blocks:
        ts = sorted([(l, t) for l, t in caps if b.top - 0.005 <= l['y'] <= b.top + 0.07 and b.x0 - 0.06 <= l['x'] + l['w'] / 2 <= b.x1 + 0.06], key=lambda a: -a[0]['y'])
        ts = [a for a in ts if not any(o is not b and o.top < a[0]['y'] < o.bottom + 0.005 for o in blocks)]  # not a label sitting inside another block
        keep = ts[-1:]  # the line just above the box; the line above that joins it only when it is centred the same way (a title on two lines, not the chapter's)
        if len(ts) >= 2 and abs((ts[-2][0]['x'] + ts[-2][0]['w'] / 2) - (ts[-1][0]['x'] + ts[-1][0]['w'] / 2)) < 0.08 and ts[-2][0]['y'] - ts[-1][0]['y'] < 2.2 * ts[-1][0]['h']: keep = ts[-2:]
        b.title = ' '.join(t for l, t in keep)
    blocks.sort(key=lambda b: (-round(b.top, 2), b.x0))
    return blocks

def audio_files(folder):
    d = os.path.join(CORPUS, folder)
    return sorted(f for f in os.listdir(d) if re.search(r'\.(mp3|wma|m4a)$', f, re.I))

def entry(title, text, src, level, audio):
    return {'title': title, 'text': text, 'src': src, 'level': level, 'audio': audio}

def words(t): return len([w for w in re.split(r'\s+', t) if re.search(r'\w', w)])

# ---------- Civilisation en dialogues (A1): one recording per unit, the unit page holds two or three short dialogues ----------
def civilisation():
    folder = 'Civilisation/A0-A1 Civilisation en Dialogues Niveau Débutant'
    pages = {1: 6, 2: 10, 3: 14, 4: 18, 5: 22, 6: 26, 7: 30, 8: 34, 9: 38, 10: 42, 11: 46, 12: 50, 13: 54, 14: 58, 15: 62, 16: None, 17: 69, 18: 73, 19: 77, 20: 81, 21: 85, 22: 89, 23: 93, 24: 97, 25: 101, 26: 105}
    files = audio_files(folder); out = []
    for unit, p in pages.items():
        audio = next((f for f in files if f.startswith('%d. ' % unit)), None)
        if p is None: print('  civ unit %d: no dialogue page in the PDF (skipped; audio %s)' % (unit, audio)); continue
        L = page_lines('civ', p)
        head = [l['text'].strip() for l in L if l['y'] >= 0.925 and re.search(r'[a-zà-ÿ]', l['text'])]
        title = clean(re.sub(r'^\d+\s*', '', head[0])) if head else 'Unité %d' % unit
        bl = [b for b in blocks_on(L, 0.0095, foot=(0.14, 0.0108)) if b.turns >= 2]
        if not bl: print('  civ unit %d: no dialogue found on page %d' % (unit, p)); continue
        text = '\n'.join(b.text(sentence_case(b.title).upper() if b.title else None) for b in bl)
        out.append(entry(title, text, 'Civilisation en dialogues (A1)', 'A1', audio))
    return out

# ---------- Vocabulaire en dialogues: every dialogue has its own recording, named after the dialogue (débutant: after the chapter) ----------
def vocabulaire(book, folder, pat, src, level, pages, body_h, xmax=1.0, second=None):
    files = audio_files(folder)
    audio = sorted(((tuple(int(x) for x in re.findall(r'\d+', re.match(pat, f).group(1))), re.match(pat, f).group(2), f) for f in files if re.match(pat, f)))
    found = []
    for p in pages:
        L = page_lines(book, p, second)
        if not L: continue
        for b in blocks_on(L, body_h, xmax=xmax, ymax=0.935):
            if b.named >= 3 and len(b.names()) >= 2 and b.title and not re.search(r'BILAN|VOIR AUSSI|CORRIG|EXERCICE', b.title): found.append((p, b))
    print('  %s: %d dialogues found, %d recordings' % (book, len(found), len(audio)))
    if len(found) != len(audio):
        for i in range(max(len(found), len(audio))):
            print('    %-45s | %s' % ((found[i][1].title + ' (p%d)' % found[i][0]) if i < len(found) else '', audio[i][2] if i < len(audio) else ''))
        return []
    out = []
    for (p, b), (num, atitle, f) in zip(found, audio):
        r = difflib.SequenceMatcher(None, norm(b.title), norm(atitle.replace('_', "'"))).ratio()
        if r < 0.6: print('    p%d « %s » ↔ %s (named after the chapter?)' % (p, b.title, f))
        out.append(entry(sentence_case(b.title, b.text()), b.text(), src, level, f))
    return out

# ---------- Phonétique en dialogues (A1): one dialogue per lesson, recorded as « Leçon N.mp3 » ----------
def phonetique():
    folder = 'Phonétique/A0-A1 Phonétique en Dialogues Niveua Débutnat'
    pages = {1: 14, 2: None, 3: 21, 4: 24, 5: 27, 6: 30, 7: 33, 8: 36, 9: 42, 10: 46, 11: 50, 12: 54, 13: 57, 14: 60, 15: 63, 16: 67, 17: 74, 18: 77, 19: 81, 20: 85, 21: 88, 22: 95}
    files = audio_files(folder); out = []
    for n, p in pages.items():
        audio = 'Leçon %d.mp3' % n
        if audio not in files: audio = next((f for f in files if norm(f) == norm('Leçon %d.mp3' % n)), audio)
        if p is None: print('  phon lesson %d: no dialogue page in the PDF (skipped)' % n); continue
        L = page_lines('phon', p)
        bl = [b for b in blocks_on(L, 0.0105, ymax=0.925, stop=re.compile(r'^(EXPLICATIONS|EXERCICES|R[ée]écoutez|Relevez|[ÉE]coutez|Observez|Répétez|Lisez|Notez|Cochez|Soulignez|Classez|Complétez|Indiquez|Vous allez entendre)'), stage_first=True) if b.named >= 2]
        if not bl: print('  phon lesson %d: no dialogue found on page %d' % (n, p)); continue
        b = bl[0]
        out.append(entry(sentence_case(b.title, b.text()) if b.title else 'Leçon %d' % n, b.text(), 'Phonétique en dialogues (A1)', 'A1', audio))
    return out

def write(name, texts):
    if not texts: print('  nothing written for', name); return
    fn = os.path.join(OUT, 'en-dialogues-%s.json' % name)
    io.open(fn, 'w', encoding='utf8').write(json.dumps({'app': 'allons-y', 'texts': texts}, ensure_ascii=False, indent=1))
    w = sum(words(t['text']) for t in texts)
    print('  wrote %s: %d texts, %d words, %d turns' % (os.path.relpath(fn, ROOT), len(texts), w, sum(t['text'].count('\n') + 1 for t in texts)))

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    print('Civilisation'); write('civilisation', civilisation())
    print('Vocabulaire débutant'); write('vocabulaire-a1', vocabulaire('voca1', 'Vocabulaire/A0-A1 Vocabulaire en Dialogues Niveau Débutant', r'^(\d+)[.,]\s*Chapitre \d+,\s*(.*)\.wma$', 'Vocabulaire en dialogues (A1)', 'A1', range(5, 107), 0.010))
    print('Vocabulaire intermédiaire'); write('vocabulaire-b1', vocabulaire('vocb1c', 'Vocabulaire/A2-B1 Vocabulaire en Dialogues Niveau Intermédiaire', r'^(\d+(?:-\d)?)\s+(.*)\.mp3$', 'Vocabulaire en dialogues (A2-B1)', 'A2', range(3, 59), 0.007, xmax=0.9, second='vocb1d'))
    print('Phonétique'); write('phonetique', phonetique())
