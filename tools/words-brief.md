# Word-bank annotation brief

The brief each annotator (one per chunk) followed when the bank in `data/words-*.js` was written. Reuse it to add or redo a chunk.

You are annotating one chunk of a CEFR-graded French word list for a personal French-learning web app. The learner is an adult working towards C-level French, reading the glosses in English. The app will drill each word two ways: (1) show the French headword, pick its English meaning out of four; (2) the learner writes their own sentence with the word, then compares with the model sentence you provide. So each entry needs a precise, concise English gloss and one natural model sentence with its English translation.

Files (the chunks come from `tools/words-select.py`; `tools/words-assemble.py` turns the annotations into `data/words-*.js`):
- your input: `CHUNKS/<name>.tsv` — columns `id, word, tag, gender, level, primary, other_entries_of_same_word`. Rows are ordered by general frequency (most common first). `word` is the lemma from the FLELex lexicon (auto-tagged, so there is some noise); `tag` is its part of speech (NOM, VER, ADJ, ADV, PRP, KON, PRO, INT); `gender` is a hint from the Lexique database (`m`, `f`, `fm` = both attested, blank = unknown/ambiguous); `primary` is `no` when the same word also appears with another tag at the same or a lower level (listed in the last column).
- your output: `ANNOT/<name>.p01.tsv`, `ANNOT/<name>.p02.tsv`, … — at most 150 lines per file, input order preserved. No header line.
- checker: `python3 -I tools/words-check.py CHUNKS/<name>.tsv ANNOT/<name>.p*.tsv`

Do not read or write anything else (no other chunks, no project files, no web).

## Output line format

One line per input id, tab-separated, exactly 6 fields:

```
id	headword	pos	english	example_fr	example_en
```

or, to leave a row out:

```
id	DROP	short reason
```

## When to DROP

- Tagger noise: a proper name or brand (`tommy`), a verb form or participle mis-tagged as a noun/adjective when it adds nothing (`retrouve` NOM), a fragment or non-word (`pers`, `pat`, `quia`), a Latin/foreign tag that is not French vocabulary.
- `primary = no` and the entry has **the same meaning** as the other entry of the same word (e.g. `anglais` NOM when `anglais` ADJ exists at a lower level; `petit` NOM vs `petit` ADJ; `noir` NOM vs `noir` ADJ). KEEP it when the meaning is genuinely different and worth learning on its own (`pouvoir` n.m. "power", `devoir` n.m. "duty; homework", `souvenir` n.m. "memory; souvenir", `être` n.m. "being", `sourire` n.m. "smile", `rire` n.m. "laugh", `mal` n.m. "harm; pain", `droit` adj. "straight; right").
- Pure grammar words with no stable meaning to test (`ne`, `y`, the article `des`). Keep prepositions, conjunctions and adverbs that have a real meaning (`malgré`, `lorsque`, `parmi`, `cependant`, `d'ailleurs`, `dès`).
- Vulgar or slang words are real French and the learner will hear them: KEEP them, gloss them honestly with a register label, e.g. `(vulgar)`, `(slang)`, `(informal)`. Only drop if it is a slur with no use beyond insulting a group.

Expect to drop roughly 2–8 % of a chunk; do not drop words just because they are rare or technical — C-level words are supposed to be rare.

## Headword

The headword is the progress key, so keep the lemma's spelling. Allowed changes, nothing else:
- a verb that is essentially pronominal gets `se` / `s'`: `se souvenir`, `s'évanouir`, `se méfier` (not `se laver` — `laver` is common without `se`).
- a noun used essentially in the plural takes its plural: `lunettes` (n.f.pl.), `vivres` (n.m.pl.), `fiançailles`.
- an adjective or a person noun whose feminine is not just `+e` shows it after ` / `: `heureux / heureuse`, `beau / belle`, `vif / vive`, `acteur / actrice`, `boulanger / boulangère`. Regular `+e` forms are not shown (`grand`, `étudiant` n.m./f. is fine as `étudiant / étudiante` too — be consistent: show the feminine only for nouns of people/animals and for adjectives whose feminine is irregular).
- for a FLELex lemma that is really a participle-adjective (`diplômer` VER → `diplômé`), you may give the adjective with pos `adj.`.

## pos (exactly one of these)

`n.m.` `n.f.` `n.m./f.` (one form for both genders, or a person noun with ` / feminine`) `n.m.pl.` `n.f.pl.` `v.` `adj.` `adv.` `prep.` `conj.` `pron.` `interj.` `num.` `phrase`

Get the gender right — the app teaches it. For homonyms whose meaning depends on gender (`le livre` / `la livre`, `le tour` / `la tour`, `le poste` / `la poste`, `le mode` / `la mode`, `le voile` / `la voile`, `la manche` / `le manche`, `le page` / `la page`), pick the more common meaning and gloss only that one. Numbers (`cinquante`, `centaine`, `dizaine`) — `num.` for cardinals, normal noun gender for `-aine` nouns.

## english

- Concise: the most common sense first; at most three senses; senses separated by `; `, near-synonyms by `, `. Aim for under 50 characters, never over 70.
- Verbs start with `to ` (`to fear, to dread`). Add the construction when it is the point: `to need (avoir besoin de)` is NOT allowed (no French in the gloss) — instead write `to depend (on)`, `to get rid (of)`.
- Short context in parentheses when needed: `(of a price) steep`, `(informal) guy`, `(literary) to dwell`.
- Must be specific enough to pick out of four options: `to fear` vs `to dread` vs `to worry` should be distinguishable from the gloss alone, so prefer the exact equivalent over a vague hypernym.
- No French words, no accents in the English.

## example_fr — one model sentence

- Natural, idiomatic French that a native speaker would actually say or write; it shows the word in its most typical use and collocation (`prendre une décision`, `faire la queue`, `éprouver de la compassion`).
- Contains the headword in some inflected form (any conjugation, gender, number). For an expression, the whole expression.
- Length by level (words): A1 4–10, A2 5–12, B1 6–15, B2–C2 7–20. Vocabulary around the headword should be easier than the headword (A1/A2: présent, passé composé, futur proche, simple everyday words).
- The sentence must make the meaning guessable from context — avoid sentences where any noun would fit ("J'aime le X.").
- Varied: different subjects, tenses, contexts, registers; do not reuse a frame across entries. Avoid real living people; invented first names are fine (vary them).
- Typography (the checker enforces): straight apostrophe `'`, a plain space before `? ! : ;`, quotes as `« … »` with spaces inside, no `"`, no em/en dashes, no no-break spaces, no curly quotes. Ends with `.`, `!`, `?` or `»`.

## example_en

Natural English translation of the sentence (not word-for-word), straight apostrophes.

## Process

1. Read your whole input chunk first.
2. Write the output in files of ≤150 lines (`p01`, `p02`, …), in input order.
3. Run the checker. Fix every ERROR. Read every WARN and fix it unless it is a false alarm (the "cannot find" check is lenient but does not know every irregular form, e.g. `vont` for `aller` is fine). Re-run until there are 0 errors and every remaining warning is a deliberate choice.
4. Final reply (short, under 150 words): kept / dropped counts, the checker's last summary line, and any entries you are unsure about (id + why). Do not paste the data back.
