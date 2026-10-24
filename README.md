# Allons-y

法语词汇与听力练习 app，A1 到 C1。纯静态页面：一个 `index.html`、六个 JS 文件、十六个数据文件，没有 build step，没有依赖。

## 运行

- **本地**：直接双击 `index.html`；或者在本目录起一个静态服务器再开浏览器：

  ```
  python3 -m http.server 8000
  # 然后访问 http://localhost:8000
  ```

- **线上**：已发布为 Claude Artifact（链接见对话）。登录 claude.ai 后进度会同步到你的账号，本地浏览器里也存一份。

朗读用浏览器自带的 speech synthesis。**听到的是不是法语发音，完全取决于选中的 voice**：app 会在法语 voice 里按质量自动挑（法国法语优先，Premium / Enhanced / Google / Natural 优先，Eddy、Flo、Grandma 这类玩具 voice 垫底），设备上一个法语 voice 都没有时宁可不念并在首页提示，因为用英语 voice 念法语只会学到错的发音。Settings 里能看到当前实际用的 voice，换一个会立刻试听。

最自然的选择：Chrome 用自带的 Google français；Edge 用 Denise (Natural)；Mac / iPhone 到系统设置 → 辅助功能 → 朗读内容 → 系统声音 → 管理声音，下载 Audrey (Premium) 或 Aurélie (Enhanced)，装好后 app 会自动选它。

## 怎么用

三个 tab：

- **Book**：A1–C1 五章、每章六课、每课十个词 × 三句例句。点进一课有六种练习：Flashcards（看词想义，自评）、Fill the gap（选词填空）、Rebuild（把打乱的词排回句子）、Dictation（听写）、EN → FR（看英文说法语再核对）、Listen & pick（听句选义）。课文页可以逐句朗读，也能整课连播。
- **Reading**（每课页面顶部的卡片）：一篇按级别写的长文，逐段朗读、可切慢读、可显示英译；下面是 About this text（文体与语域讲解）、Vocabulary（正文里的生词，带原句）、Sentence patterns（可复用的句型）、Idioms & expressions、Grammar（以正文例句讲的语法点）。读完点 Mark as read，课页上会标 read ✓。
- **Review**：到期的词在这里复习，每次用不同的例句。
- **Start from level**（Settings）：默认从 A2 开始显示，A1 整章隐藏，不进统计也不进复习队列；改成 A1 就全部回来，改成 B1 则连 A2 也藏掉。
- **Mark all as known**（每课页面）：已经会的课一键标成 box 5，不用把练习刷一遍；旁边的 Reset lesson 可以撤销。
- **Listening**：十篇短文，先盲听答题，再看 transcript；下面还有按级别随机抽句子的听写、重组、听选。
- **听写判分**（所有听写）：错词分两类。目标词和你写的词做一次粗糙的 phonetic folding（`app-listen.js` 里的 `phon`），折叠后相同算「heard, misspelt」（拼写或语法：parlé / parler / parlait、on / ont、ses / ces、-ent 不发音、丢掉的重音符），不同算「missed by ear」。结果框下有图例，Listening 页顶部累计两条错误率。
- **Dictée progressive**（Listening 页，也可从阅读页和短文页的 Dictée 按钮进）：30 篇阅读和 10 篇短文都能当课堂式听写：整篇常速听一遍 → 逐句以 breath group 慢读、你打字、立刻判分 → 整篇再听一遍并逐句标出错处。最好成绩存在 `S.dictee`。
- **Mine**（第四个 tab）：把日常遇到的法语贴进来存着。每条文本可以逐句朗读、慢读、做 Dictée；点 Explain this text 让 Claude 按课程阅读的格式写讲解（逐段英译、生词、句型、俗语、语法），跑在你自己的 Claude 账号上，第一次会弹权限。文本存在账号下 `data/users/<id>/texts/items/<id>`，每条一个 document，本地也留一份；改正文会清掉旧讲解。
- **My notes**（Mine 每条文本的卡片）：自由文本，贴你自己或任何助手给的讲解（生词、句型、翻译、问题），和文本一起存进账号、进备份。空行分段，`-`、`•`、`1.` 开头的行成列表，`#` 或「Vocabulaire :」这类单独一行成小标题，`**粗体**` 可用，其余照原样显示。想要和课程阅读一样的结构化讲解（分段英译、Vocabulary、Sentence patterns、Idioms、Grammar 五个卡片），用 Explain 卡片里的 Copy prompt，把助手返回的 JSON 贴回 Use this answer。
- **录音**（Mine）：一条文本可以带一个录音文件名（导入文件里的 `audio` 字段，或 Edit 里填）。打开文本时上方出现 Recording 卡片：第一次点 Choose the folder 选中 `audio/` 这个文件夹（`python3 tools/collect-audio.py` 把文本用到的 145 个录音收在这里，按书分四个子目录；文件只在本机浏览器里用，不上传；播放过的文件会缓存进 IndexedDB，下次不用再选）。播放器有 −3 s、0.7× / 0.85× / 1× 变速和 A–B 区间：按 A、B 标出一段，播放到 B 自动停并回到 A，Loop 反复。Dictée from the recording 用真人录音做听写：先整段听，再逐个 turn 写——按 Play 听，在这个 turn 结束处按 B，这一段就被隔离出来反复听，写完 Check 判分（同样分 by ear / spelling）。按 Next 时 A–B 保存到文本的 `marks` 里，下次每个 turn 自动按段播放。Listening 页的 Mine 组里带录音的文本直接进这种听写。浏览器放不了 `.wma`，要先转成 `.mp3`（见下文），同名即可。
- **Numbers**（Listening 页）：程序生成的数字听写，每轮十题，混合数字、年份、时刻、价格、电话号码、日期；答案打数字（17h45、32,60、23/10/2026、06 42 18 73 95 等格式都接受）。
- **Slower / Slow**：Dictation、Listen & pick 里的 Slower 按钮和短文页的 Slow 开关不靠 voice 的 rate 参数——Apple 的 Premium / Enhanced voice 基本不理这个参数，所以以前慢速和常速听不出差别——而是把句子切成呼吸组（标点处，再在连词、关系代词、介词前），每组降速念，组之间停顿；任何 voice 上都明显更慢。

## 进度与复习算法

Leitner 盒子 0–5，间隔 0 / 1 / 3 / 7 / 14 / 30 天。

| 动作 | 效果 |
|---|---|
| Flashcards: Good | 升一盒 |
| Flashcards: Hard | 盒子不变，间隔减半 |
| Fill the gap / Listen & pick 答对 | 升一盒，最高到 3 |
| Rebuild / Dictation / EN → FR 答对 | 升一盒，最高到 5 |
| 任何练习答错、Flashcards: Again | 回到 0，十分钟后再出现 |

首页「words known」统计盒子 ≥ 3 的词。

## 添加词汇

词在 `data/vocab-*.js` 里，每条格式：

```js
["headword", "pos", "english", [["例句", "译文"], ["例句", "译文"], ["例句", "译文"]]]
```

- `pos` 用 `n.m.` / `n.f.` / `v.` / `adj.` / `adv.` / `phrase` / `interj.` 这类缩写，填空题按它挑同词性的干扰项。
- 一个词的多个形式用 ` / ` 分开（`cher / chère`），填空会逐个尝试。
- 进度按 `课id:headword` 存，所以可以调顺序、加词；别改已有 headword 的拼写，否则那个词的进度会断开。
- 改完在浏览器里打开 `test.html`，应该显示 ALL PASSED；展开下面的列表可以看每一句挖的是哪个词。

## 独立于 Claude

app 本身是静态文件，不依赖任何服务。三条和 Claude 的耦合都已经能解开：

- **托管**：`python3 build.py` 把 fragment 格式的 `index.html` 包成完整页面写进 `docs/`，并复制脚本和数据。`docs/index.html` 可以直接双击打开；放到 GitHub Pages（Settings → Pages → Deploy from a branch → main，folder `/docs`）、Cloudflare Pages 或任何静态托管都行。每次改代码后重跑 `build.py` 再提交。
- **数据**：Settings → Backup → Export everything 导出一个 JSON（进度、设置、Mine 里的文本）；Import a file 恢复。文件里只有 `texts` 时按「添加文本」处理，已有的同文本不重复加。
- **Explain**：Mine 里每条文本的 Explain 卡片下有「Without Claude」：Copy prompt 复制讲解 prompt，交给任何助手，把它返回的 JSON 贴回来，Use this answer 存入，效果与 Claude 在页内写的一样。

## 自己的语料

`french/` 目录放学习资料（书、音频），`.gitignore` 排除，永远不进仓库也不进发布的页面。`python3 tools/extract-library.py` 从其中可读的 PDF 抽出法语正文，写成 Mine 的导入文件到 `library/`（同样不进仓库）：Le Petit Nicolas 各章（切成约 700 词一段）、Le Petit Prince 各章（精听党版，只取左栏法语）、TV5Monde 文章、InnerFrench 播客的 transcript。导入方式：Settings → Import a file → 选 `library/*.json`。需要 `pip install pypdf`。

### en Dialogues：扫描书 + 录音

en Dialogues 四本带音频的书（Civilisation A1、Vocabulaire A1、Vocabulaire A2-B1、Phonétique A1）是扫描版，没有文字层，走 OCR：

```
swiftc -O -o /tmp/ocr-pdf tools/ocr-pdf.swift      # Apple Vision 离线 OCR，法语；只需要 Xcode 命令行工具
B="french/French/en Dialogues"
/tmp/ocr-pdf "$B/Civilisation/A0-A1 Civilisation en Dialogues Niveau Débutant.pdf" library/ocr/civ 1-128 2
/tmp/ocr-pdf "$B/Vocabulaire/A0-A1 Vocabulaire en Dialogues Niveau Débutant.pdf" library/ocr/voca1 1-125 1
/tmp/ocr-pdf "$B/Phonétique/A0-A1 Phonétique en Dialogues Niveau Débutant.pdf" library/ocr/phon 1-124 2
CROP=0,0,0.68,1 /tmp/ocr-pdf "$B/Vocabulaire/A2-B1 Vocabulaire en Dialogues Niveau Intermédiaire.pdf" library/ocr/vocb1c 1-64 3
CROP=0,0,0.68,1 /tmp/ocr-pdf "$B/Vocabulaire/A2-B1 Vocabulaire en Dialogues Niveau Intermédiaire.pdf" library/ocr/vocb1d 1-64 2.2
python3 tools/extract-dialogues.py
python3 tools/collect-audio.py                      # 把文本引用的录音收进 audio/<book>/（硬链接，不占第二份空间）
```

`ocr-pdf` 每页写一个 JSON（识别出的每行文字和位置；`PNG=1` 顺便存页面图，`CROP` 只渲染页面的一部分——A2-B1 那本是跨页扫描，只取左页，并且跑两个分辨率合并，补书脊附近掉的词）。`extract-dialogues.py` 按版面找出对话框（大写标题 + 「人名 : 台词」或「– 台词」的行，支持双栏），拼回换行的句子，去掉脚注和图片标签，修 OCR 常见错（脚注记号读成 `'` `!` `?`，句首 J 读成 l），写出四个导入文件，每条带 `audio`（录音文件名）：

| 文件 | 内容 | 条数 | 录音 |
|---|---|---|---|
| en-dialogues-civilisation.json | 每单元两三段小对话合为一条 | 25（第 16 单元扫描缺页） | `N. 标题.mp3` |
| en-dialogues-vocabulaire-a1.json | 每段对话一条 | 49 | `.wma`，要先转 mp3 |
| en-dialogues-vocabulaire-b1.json | 每段对话一条 | 50 | `CC-K 标题.mp3` |
| en-dialogues-phonetique.json | 每课的对话 | 21（第 2 课扫描缺页） | `Leçon N.mp3` |

OCR 不是完美的：偶尔有错字、少一个词，尤其 A2-B1 那本靠近书脊的地方；发现了在 Edit 里改。`.wma` 浏览器不放，装 ffmpeg 转一次（文件名不变，只换后缀，app 按主名匹配）：

```
brew install ffmpeg
cd "french/French/en Dialogues/Vocabulaire/A0-A1 Vocabulaire en Dialogues Niveau Débutant"
for f in *.wma; do ffmpeg -n -i "$f" -codec:a libmp3lame -q:a 4 "${f%.wma}.mp3"; done
```

`audio/` 和 `library/` 一样不进仓库。其余没有文字层也没有录音的书（Grammaire en dialogues、Progressive 系列、丁丁）同样可以 OCR，但现在的抽取脚本只认 en Dialogues 的对话版面。

## 发布

线上版本是 Claude Artifact，更新时 publish `index.html`，并把改过的 JS 作为 files 一起发。**每次改了 JS，都要把 `index.html` 里全部 `<script src="…?v=N">` 的 N 和 `app-core.js` 开头的 `BUILD` 一起加一**，否则浏览器会继续用缓存里的旧脚本；Settings 底部显示当前跑的是哪个 build。

## 自测

`test.html`：数据完整性、900 句的挖空扫描、六种练习、听力页、Mine 和录音听写各走一遍。跑完会把你本地的进度恢复原样，朗读是静音的。

## 添加阅读

每课一篇长文，在 `data/reading-*.js` 里（每级一个文件），格式：

```js
window.FR_READING = window.FR_READING || [];
window.FR_READING.push(
{lesson:"a1-1", title:"标题（法语）", genre:"Scene", intro:"一句英文交代场景（谁、在哪、为什么）",
 text:[["法语段落", "英文翻译"], ...],          // 3–6 段，译文自然、不逐词
 notes:"阅读讲解：2–4 句英文，说文体与语域、该注意什么、文化点",
 vocab:[["mot", "pos", "english", "文中出现该词的短语"], ...],      // 8–12 个生词，不能是本课 10 个 headword
 patterns:[["带 [槽位] 的句型", "怎么用、什么场合", "文中原句"], ...], // 3–4 个
 idioms:[["表达法", "literally: 字面义", "实际含义与用法"], ...],      // 2–4 个，必须真的出现在正文里
 grammar:[["Topic", "3–6 句英文讲解", "文中原句"], ...]               // 2–3 个，例句引自正文
}
);
```

写作规则（test.html 会检查前四条）：

- 每课的 10 个 headword 至少有 6 个自然地出现在正文里（变位、变形都算）。
- 正文长度按级别：A1 90–200 词，A2 150–260，B1 200–350，B2 260–430，C1 320–520。
- `vocab` 里的词、`idioms`、`grammar` 的例句都要能在正文里找到。
- 每课恰好一篇，`lesson` 对应 `data/vocab-*.js` 里的 lesson id。
- 语法范围：A1 présent、impératif、il y a、靠语调的问句；A2 passé composé、imparfait 描写、futur proche、COD/COI、比较级；B1 passé composé/imparfait/plus-que-parfait 叙事、futur simple、conditionnel、il faut que + subjonctif、qui/que/où/dont、简单间接引语；B2 subjonctif 扩展、让步与对立、被动、名词化、间接引语、论证连接词；C1 叙事中的 passé simple、participe présent/gérondif、mise en relief、报刊与文学语域、长复合句。
- 文体轮换：对话场景、邮件、日记、博客、新闻短讯、短篇故事、访谈、评论、书信、随笔；同一级别里不要重复文体。
- 排版与词汇文件一致：直引号 `'`，`? ! : ;` 前留一个普通空格，引语用 `« … »`（内侧带空格），不用 em-dash，不用 NBSP。
- 讲解一律英文（app 的界面与注释语言）；法语片段在讲解里用 `« … »` 包起来。

改完在浏览器里打开 `test.html`，应显示 ALL PASSED。
