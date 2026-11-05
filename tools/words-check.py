#!/usr/bin/env python3
"""Check an annotated word-bank chunk against its input.
usage: python3 -I tools/words-check.py <chunk.tsv> <annotation.tsv> [<annotation.tsv> ...]  (the brief is tools/words-brief.md)
Prints ERROR lines (must be fixed) and WARN lines (look at each one; fix it or leave it if it is a false alarm)."""
import sys, re, unicodedata, csv, os

POS = {'n.m.', 'n.f.', 'n.m./f.', 'n.m.pl.', 'n.f.pl.', 'v.', 'adj.', 'adv.', 'prep.', 'conj.', 'pron.', 'interj.', 'num.', 'phrase'}
TAGPOS = {'NOM': {'n.m.', 'n.f.', 'n.m./f.', 'n.m.pl.', 'n.f.pl.', 'num.', 'phrase'}, 'VER': {'v.', 'phrase'}, 'ADJ': {'adj.', 'num.', 'phrase'},
          'ADV': {'adv.', 'phrase'}, 'PRP': {'prep.', 'phrase', 'adv.'}, 'KON': {'conj.', 'phrase', 'adv.'}, 'PRO': {'pron.', 'phrase'}, 'INT': {'interj.', 'phrase'}}
LEN = {'A1': (3, 11), 'A2': (4, 13), 'B1': (5, 16), 'B2': (6, 20), 'C1': (6, 22), 'C2': (6, 22)}

def norm(s):
    s = unicodedata.normalize('NFD', s.lower().replace('œ', 'oe').replace('æ', 'ae').replace('’', "'"))
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn')
toks = lambda s: re.findall(r"[a-z0-9]+", norm(s))

IRR = {  # forms that share fewer than three letters with the infinitive
    'etre': 'suis es est sommes etes sont etais etait etions etiez etaient ete serai seras sera serons serez seront serais serait serions seriez seraient sois soit soyons soyez soient fus fut furent fut',
    'avoir': 'ai as a avons avez ont eu eue eus eues aurai auras aura aurons aurez auront aurais aurait aurions auriez auraient aie aies ait ayons ayez aient eut eurent',
    'aller': 'vais vas va vont irai iras ira irons irez iront irais irait irions iriez iraient aille ailles aillent',
    'faire': 'fais fait faisons faites font ferai feras fera ferons ferez feront ferais ferait fasse fasses fassions fassiez fassent fis fit firent',
    'pouvoir': 'peux peut peuvent pu pourrai pourras pourra pourrons pourrez pourront pourrais pourrait pourrions pourriez pourraient puisse puisses puissions puissiez puissent put purent',
    'vouloir': 'veux veut veulent veuille veuilles veuillez',
    'savoir': 'sais sait su sache saches sachions sachiez sachent saurai sauras saura saurons saurez sauront saurais saurait sut surent',
    'devoir': 'dois doit doivent du due dus dues doive doives doivent dut durent',
    'voir': 'vois voit voyons voyez voient vu vue vus vues verrai verras verra verrons verrez verront verrais verrait voie voies vit virent',
    'dire': 'dis dit disons dites disent dise',
    'mettre': 'mets met mis mise mises', 'boire': 'bois boit buvons buvez boivent bu bue', 'croire': 'crois croit croyons croyez croient cru crue',
    'vivre': 'vis vit vecu vecue', 'naitre': 'nais nait ne nee nes nees naquit', 'mourir': 'meurs meurt meurent mort morte morts mortes',
    'lire': 'lis lit lu lue', 'plaire': 'plais plait plu', 'pleuvoir': 'pleut plu', 'falloir': 'faut fallu faudra faudrait faille fallait',
    'valoir': 'vaut vaux valu vaudra vaudrait vaille', 'asseoir': 'assieds assied assis assise assoit', 'suivre': 'suis suit suivi',
    'courir': 'cours court couru', 'tenir': 'tiens tient tiennent tint', 'venir': 'viens vient viennent vint', 'prendre': 'pris prise', 'acquerir': 'acquiers acquiert acquis',
    'oeil': 'yeux', 'ciel': 'cieux', 'beau': 'bel belle belles beaux', 'nouveau': 'nouvel nouvelle nouvelles nouveaux', 'vieux': 'vieil vieille vieilles',
    'fou': 'fol folle folles fous', 'mou': 'molle molles', 'bon': 'bonne bonnes meilleur', 'mauvais': 'pire', 'bien': 'mieux',
}
ADJF = [('eux', 'euse'), ('if', 'ive'), ('el', 'elle'), ('en', 'enne'), ('on', 'onne'), ('er', 'ere'), ('al', 'aux'), ('ail', 'aux'), ('eau', 'eaux'),
        ('et', 'ete'), ('et', 'ette'), ('c', 'che'), ('c', 'que'), ('f', 've'), ('x', 'se'), ('x', 'ce'), ('eur', 'euse'), ('eur', 'rice'), ('eur', 'resse'), ('g', 'gue')]

def present(head, sentence):
    """True when some form of the headword is in the sentence (lenient: a false alarm is cheap, a miss is what we want to catch)."""
    st = toks(sentence); text = ' ' + ' '.join(st) + ' '
    for var in [v.strip() for v in head.split(' / ')]:
        v = re.sub(r"^(se |s'|s’)", '', var.strip()); v = re.sub(r"^(l'|le |la |les |un |une )", '', v)
        t = toks(v)
        if not t: continue
        if len(t) > 1:  # an expression: the first and last content words are enough (inner words may inflect)
            if all(any(x == w or (len(w) > 3 and x.startswith(w[:-2])) or x.startswith(w[:4]) for x in st) for w in [t[0], t[-1]]): return True
            if ' ' + ' '.join(t) + ' ' in text: return True
            continue
        b = t[0]; cands = {b, b + 's', b + 'x', b + 'e', b + 'es'}
        for a, f in ADJF:
            if b.endswith(a): cands |= {b[:-len(a)] + f, b[:-len(a)] + f + 's'}
        cands |= set(IRR.get(b, '').split())
        if any(x in cands for x in st): return True
        stem = re.sub(r'(oir|er|ir|re)$', '', b) if len(b) > 4 else b
        need = max(3, min(len(stem), len(b) - 3))
        for x in st:
            k = 0
            while k < min(len(x), len(b)) and x[k] == b[k]: k += 1
            if k >= need: return True
            if b.endswith(('oir', 'oire')) or b in IRR:
                pass
    return False

def main():
    chunk = {r['id']: r for r in csv.DictReader(open(sys.argv[1], encoding='utf-8'), delimiter='\t', quoting=csv.QUOTE_NONE)}
    seen = {}; errs = warns = 0; kept = dropped = 0; heads = {}
    def E(i, m):
        nonlocal errs; errs += 1; print('ERROR', i, m)
    def W(i, m):
        nonlocal warns; warns += 1; print('WARN ', i, m)
    for path in sys.argv[2:]:
        for ln, line in enumerate(open(path, encoding='utf-8'), 1):
            line = line.rstrip('\n').rstrip('\r')
            if not line.strip(): continue
            f = line.split('\t'); i = f[0]
            if i == 'id': continue
            if i not in chunk: E('%s:%d' % (path, ln), 'unknown id %r' % i); continue
            if i in seen: E(i, 'id written twice'); continue
            seen[i] = 1; src = chunk[i]
            if len(f) >= 2 and f[1] == 'DROP':
                dropped += 1
                if len(f) < 3 or not f[2].strip(): E(i, 'DROP needs a reason in the third column')
                continue
            if len(f) != 6: E(i, 'expected 6 tab-separated fields, got %d' % len(f)); continue
            kept += 1
            _, head, pos, en, fr, tr = f
            for k, v in (('headword', head), ('pos', pos), ('english', en), ('example', fr), ('translation', tr)):
                if not v.strip() or v != v.strip(): E(i, '%s empty or padded with spaces' % k)
            if pos not in POS: E(i, 'pos %r not one of %s' % (pos, ' '.join(sorted(POS))))
            elif pos not in TAGPOS.get(src['tag'], POS): W(i, 'pos %s for tag %s: is that right?' % (pos, src['tag']))
            lw, hw = norm(src['word']), norm(head)
            if lw not in hw and os.path.commonprefix([lw, re.sub(r"^(se |s')", '', hw)]).__len__() < max(3, len(lw) - 2): E(i, 'headword %r does not match the lemma %r of this id: wrong line? (keep the lemma; change it only for se/s\', a plural-only noun, or a feminine after " / ")' % (head, src['word']))
            key = head + '|' + pos
            if key in heads: E(i, 'same headword and pos as %s' % heads[key])
            heads[key] = i
            for k, v in (('english', en), ('example', fr), ('translation', tr), ('headword', head)):
                if re.search('[’‘“”  —–]', v): E(i, '%s has a curly quote, a no-break space or a long dash: use \' and plain spaces, no dashes' % k)
            if re.search(r'[^\s«(][?!:;]', fr): E(i, 'French needs a plain space before ? ! : ;')
            if re.search(r'«[^ ]|[^ ]»', fr): E(i, '« » need a space inside')
            if '"' in fr: E(i, 'use « » in French, not "')
            if not re.search(r'[.!?…»]$', fr): W(i, 'example does not end with . ! ? or »')
            if not re.match(r'^[«A-ZÀÂÉÈÊÎÔÛÇŒ0-9]', fr) and not fr.startswith('«'): W(i, 'example should start with a capital')
            n = len(toks(fr)); lo, hi = LEN.get(src['level'], (4, 20))
            if n < lo or n > hi: W(i, 'example has %d words; aim for %d-%d at %s' % (n, lo, hi, src['level']))
            if len(en) > 70: W(i, 'english gloss is long (%d chars); keep it under ~60' % len(en))
            if pos == 'v.' and not re.match(r'^(to |can|must|it |there )', en): W(i, 'verb gloss should start with "to "')
            if re.search(r'[éèàùçâêîôûœ]', en): W(i, 'english gloss contains French letters')
            g = src['gender']
            if g in ('m', 'f') and pos in ('n.m.', 'n.f.', 'n.m.pl.', 'n.f.pl.') and pos[2] != g: W(i, 'Lexique gives gender %s, you wrote %s' % (g, pos))
            if not present(head, fr): W(i, 'cannot find %r in the example (fine if it is an irregular form: check)' % head)
    for i in chunk:
        if i not in seen: E(i, 'missing (%s)' % chunk[i]['word'])
    print('---\n%d input ids · %d written (%d kept, %d dropped) · %d errors · %d warnings' % (len(chunk), len(seen), kept, dropped, errs, warns))

if __name__ == '__main__':
    main()
