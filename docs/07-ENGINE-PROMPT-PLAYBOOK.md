# 07 — Engine Prompt Playbook

> Source of truth for the Step 6 engine prompt. Extracted verbatim from Gold's proven hand-built artifacts in `reference/exam-prep/` (gitignored). Every pattern below is something that **survived a real exam**, not a generic spec.

---

## 1. Strategic priors

Gold's sheets have one consistent stance: **the sheet is a weapon to deploy mid-exam, not study material to read later**. Every artifact is built around an exam-day workflow ("First 60 seconds — eye the color key strip... Question comes in — identify the topic, then scan for that color band" — `SESSION-LOG.md`). The information density is brutal because the sheet has to win against a 90-minute clock, not against a reader's patience. Discarded entirely: generic prose, prose-only explanations, decorative recap, "intro" paragraphs, anything that doesn't either (a) answer a likely question or (b) help locate one.

The voice is **opinionated, prescriptive, and trap-aware**. Gold doesn't write "consider checking..."; he writes "Read NOT and EXCEPT twice. They flip the answer" (`master-cheatsheet.md`). When two options are close, the sheet tells you which one to pick and why: "When in doubt, mark fewer, not more — a wrong tick usually costs more than a missed one." Confidence is graded in plain English — "★ EXAM-VERIFIED", "frequent exam Q", "often FALSE / trap" — not in numbers.

The most distinctive prior is **anchoring to a verified prior exam**. The `SESSION-LOG.md` describes reading "all 51 pages" of the actual prior final and rebuilding the sheet around the patterns it reused. Section `0.3 ★★★ VERIFIED FINAL EXAM Q PATTERNS` is "the 'if you only read one thing' section" (`SESSION-LOG.md`). The engine must replicate this loop: pull from past papers / sample quizzes whenever they exist in the pack, mark those items with `★ EXAM-VERIFIED`, and put them at the top.

---

## 2. Formula-treatment patterns

Gold explicitly said he "perfected the formulas." Here's the catalog.

### 2.1 Single-formula inline (when the formula is one line)

Used inline inside prose with backticks:
> "`reduceByKey` does a **local combiner per partition before the shuffle**" (`05-spark-rdd/cheatsheet.md`)
> "`PE(pos, 2i) = sin(pos / 10000^{2i/d})`, `PE(pos, 2i+1) = cos(pos / 10000^{2i/d})`" (`11-attention/flashcards.md`, Q21)

### 2.2 Grouped `<pre>` block for formula clusters

When 3+ related formulas belong together, they go in one fenced block with comments:
```
accuracy  = (TP + TN) / (TP + FP + TN + FN)
precision = TP / (TP + FP)         ← of what you said yes, how many right?
recall    = TP / (TP + FN)         ← of all the trues, how many caught?
F1        = 2·P·R / (P + R)
```
(from `professor-notes.md`, §3). The `← arrow-gloss` is a recurring tactic — each formula gets a plain-English right-side comment.

### 2.3 Worked-example callout with numeric breakdown

Headlined with `★ EXAM-VERIFIED Worked X (Final Q3)` — for example:
> "★ EXAM-VERIFIED Worked Confusion Matrix (Final Q3) — **The trap:** when the matrix is given with **predicted = ROWS, actual = COLUMNS**, you have to flip your mental model... TP=100, FP=200 (rest of predicted+ row), FN=200 (rest of actual+ column), TN=9500." Then a 4-row metric table with `Formula → Computation → Answer`. (`Big_Data_Exam/CLUTCH.md` §1.6).

Second example, from `CLUTCH.md` §1.5:
> "★ EXAM-VERIFIED Worked FPM Example (the supermarket question reused 2× on the final)" — lists 5 transactions, single-item supports as `Bread = 4/5`, then pair/triple counts, then a confidence table with `Rule | Computation | Answer` rows like `{Cola} → {Diapers} | supp(C,D)/supp(C) = 2/2 | **1.0 ✓**`.

Third example, Cassandra stale read (`CLUTCH.md` §8.6):
> "RF=3. W=ONE (1) + R=ONE (1) = 2 ≤ 3 → **STALE READ POSSIBLE**. W=QUORUM (2) + R=QUORUM (2) = 4 > 3 → **STALE READ IMPOSSIBLE**."

Pattern: **state setup → plug in numbers → show arithmetic → mark answer with ✓ or call out the trap option**.

### 2.4 Inline `(NOT X)` debunking

The most-used trap pattern. Always lives inside the same sentence as the right answer:
- "Accuracy=96% ✓ (NOT 43.48%)" (`CLUTCH.md` §0.3)
- "Resource manager in Hadoop? → **YARN**" with neighbors "NOT replication, NOT checkpoints" (§9.1.1)
- "**3 service daemons:** Impala daemon, Statestore daemon, Catalog daemon. **NOT 'Process daemon'**" (§0.3)
- "For data warehousing and ETL on Big Data, which technology? → ★ **Hive** (NOT Native MapReduce, NOT MongoDB, NOT Java)" (§4.9)
- "Adopting NoSQL — what do you give up? → **Joins ✓**, **ACID ✓**, **ability to keep entire data on one server ✓**. **NOT speed** (NoSQL is generally faster)."

### 2.5 `★ Final Q3:` exam-verified labeling

Used as a section header AND inline cue:
- `### ★ EXAM-VERIFIED Worked Confusion Matrix (Final Q3)`
- `## 8.6 STALE READ PROBLEM ★ (frequent exam Q)`
- `### ★ 8.10.1 Cassandra columns / keys truths (★ EXAM-VERIFIED)`
- `### ★ 8.11.1 CQL Errors (★ EXAM-VERIFIED — "which queries result in an error?")`

Three flavors of star:
| Marker | Meaning |
|---|---|
| `★` | Exam-verified or known high-yield |
| `★★★` | The most-likely-to-show pattern; "read this twice" |
| `(★ EXAM-VERIFIED)` parenthetical | Tag on an existing section that survived contact with a real final |

### 2.6 Row-label vocab (`vars`/`use`/`trap`/`Q`)

These exact labels DO appear, but irregularly. More common in proven work are domain-specific labels per row:
- `Mnemonic:` (`master-cheatsheet.md`: "**C**omplete = whole. **A**ppend = new only. **U**pdate = changed only.")
- `Trap:` (`master-cheatsheet.md` per-topic cards: "**Trap:** **Logistic Regression = classification**, not regression.")
- `Key fact:` and `Key code pattern:` (`master-cheatsheet.md` 14-topic cards — every topic has these three rows)
- `Drill discipline:` (`CLUTCH.md` §1.5: "when faced with a market-basket question, write the support of every individual item first, then count the pair/triple by linear scan")

**Recommendation for SheetContent:** keep our `vars/use/trap/Q` row labels but allow renderer to substitute these domain-tested labels when the engine emits them.

---

## 3. Question phrasing (the prof's voice)

The engine generates anticipated Qs. The proven format is dense Q/A — never long-form. From `11-nosql-cap/practice.md`:

| # | Q (verbatim) | A (verbatim) |
|---|---|---|
| Q1 | "Which of the following is **NOT** a reason NoSQL has become a popular solution for some organizations?" with options A-D | "**Answer: B** — NoSQL **gives up** strict consistency. It does not improve consistency." |
| Q4 | "For a Big Data system, which CAP property is essentially **mandatory**?" | "**Answer: C** — partitions will happen at scale; P is non-negotiable." |
| Q16 | "Which Cassandra consistency level provides the **best balance** between consistency and availability?" | "**Answer: C** — QUORUM." |
| Q21 (select-all) | "Select all properties / abilities you **lose** when moving from RDBMS to NoSQL." (7 options) | "**Answer: A, B, C, D, E** — F and G are things you GAIN, not lose." |
| Q34 (fill-in) | "Quorum math fill-in. Replication factor N=3. Write CL = ____ and Read CL = ____ guarantees no stale reads..." | "**Answer: QUORUM, QUORUM; rule R + W > N (2 + 2 = 4 > 3)**." |

From `CLUTCH.md` §8.13 — short-answer drill format:
- `"Default partitioner?" → **Murmur3Partitioner**`
- `"Stale read condition?" → W + R ≤ RF`
- `"P2P provides better availability than master/slave?" → **Yes** (no SPoF). Consistency? **Not necessarily** (eventual).`

### "Trap: X" suffix pattern

Appears as both a section label and an inline modifier:
- "**Trap:** **Combiner must be associative AND commutative** (e.g., sum yes, average no)." (`master-cheatsheet.md` topic 04)
- "**Trap:** RDD has **no Catalyst optimizer**, DataFrame does." (topic 06)
- "**Trap:** Always assemble features into a single **Vector column** before fit." (topic 07)
- "**Trap:** File sinks support ONLY append mode." (topic 09)
- "**Trap:** Schema declares **column families ONLY**; qualifiers are dynamic per row. Cell = **(rowkey, family:qualifier, timestamp)** — 3 keys." (topic 13)

### Question kinds the prof uses

From `exam-format.md`, the proven taxonomy:
| Kind | Notes |
|---|---|
| MCQ | "Watch for **not** or **except** — they flip the answer." |
| Select-all-that-are-true | "Partial credit but a wrong selection often costs more than a missed selection." |
| Code completion | "Read a code snippet, fill in missing lines" |
| "Which code does X" | "Given 4 code snippets, pick the one that does the task" |
| Concept / short answer | "Memorize the canonical definitions" |
| Code-classification | E.g., Q31 in `practice.md`: classify each DB as CP/AP/CA |

(NLP packs add: code-completion blanks, oral 5-stage walkthroughs with follow-ups — see `03-tagging/oral-drill.md`. Different course modality, but same Q/A density.)

---

## 4. Named-trap patterns ("X is FALSE because Y")

The engine should emit traps as compact `claim → verdict → reason` triplets. Verbatim examples (all from proven work):

1. "**Trick (NOT a reason — flagged in review):** 'Improved ability to keep data **consistent**' ✗ — NoSQL **gives up** strict consistency." (`11-nosql-cap/cheatsheet.md`)
2. "**FALSE-statement trap:** 'Hive data must be copied into /hive/warehouse' → **FALSE** (EXTERNAL tables can live anywhere)." (`CLUTCH.md` §0.3)
3. "'Impala provides order-of-magnitude better fault tolerance than native Hadoop' → **FALSE**. Impala trades some fault tolerance for speed." (`CLUTCH.md` §4.8.1)
4. "All rows must have the same number of columns → **FALSE** (sparse)." (`CLUTCH.md` §8.10.1)
5. "Clustering key column should be unique in the entire dataset → **FALSE** — only unique within a partition." (§8.10.1)
6. "It is a good idea to partition on the primary key of the dataset → **Often FALSE / trap** — this confuses partition key with PK." (§8.10.1)
7. "**4th V is Veracity** — NOT Validity, NOT Visualization, NOT Value." (`master-cheatsheet.md` topic 01)
8. "**Logistic Regression = classification**, not regression." (topic 02)
9. "**Secondary NameNode is NOT a hot backup** — only does periodic checkpointing of fsimage+edits." (topic 03)
10. "**Combiner must be associative AND commutative** (e.g., sum yes, average no). Intermediate map output → **local disk, not HDFS**." (topic 04)
11. "**`reduceByKey` (transformation, lazy) vs `reduce` (action, eager)**." (topic 05)
12. "**File sinks support ONLY append mode.**" (topic 09)
13. "**Managed table DROP deletes data files. External table DROP only deletes metadata.**" (topic 10)
14. "**HMaster does NOT serve reads/writes** — RegionServers do." (topic 13)
15. "**Composite partition key uses double parentheses** `((a,b))`." (topic 14)

Shape: **bold the false claim → arrow or em-dash → state truth → optionally cite where it bites**.

---

## 5. Trust-layer practice

Proven artifacts use confidence markers and citations as inline language, not as a separate column.

### ★ usage in context
- `★` on a heading = "this section came up on a real exam or was prof-flagged"
- `★` inline before an item = "this specific bullet is exam-verified"
- `★★★` = "if you only read one thing"
- `✓` after an answer = "this is the correct option" (used inside option lists to mark the right one)
- `✗` after a statement = "this is the false option / trap"

### Confidence wording in prose
From `SESSION-LOG.md`: "**Specific patterns to recognize cold from the verified-final list**" then a 10-item list. The phrase "cold" = highest confidence, must-memorize.

From `professor-notes.md`: "**Items flagged 'exam Q' came directly from prof saying it would be on the exam.**"

From `CLUTCH.md` §0.3: section banner reads "**VERIFIED FINAL EXAM Q PATTERNS** (from actual prior final). Read this twice. These are the exact patterns the prof reuses. **Heavy hitters first.**"

Topic-weight wording (`SESSION-LOG.md`): "Heaviest topics in the prior final: **Hive (~6–8 Q), Cassandra (~5–6 Q), Recommender/FPM/ML (~4–5 Q)...**" — counts come from observed frequency.

### Source citations used inline
- "(Review PDF, exact)" — when a Q is lifted verbatim from a prof handout (`11-nosql-cap/practice.md` Q1, Q21)
- "(Review PDF style)" — when paraphrased from the same source (Q23, Q30)
- "(from your handwritten/typed class notes (review1 + class1-8))" — provenance header on `professor-notes.md`
- "**lab answer: a, b, c works; e, f not** (class8)" — quotes the student's own notes back at them, with file ref

### Implication for the engine
Trust markers should be **rendered inline alongside content**, not in a separate sidebar. Our SheetContent already has confidence + sources fields; the engine should populate them AND the renderer should surface a `★` glyph + a parenthetical citation when confidence ≥ verified, modeled exactly on the proven inline patterns.

---

## 6. Universal Rules / meta-cognitive tactics

Lifted verbatim from the proven `headerbar` and `★ Universal Rules` blocks. Every sheet has them at the top, page-spanning. These belong in a `universalRules: string[]` field in SheetContent (Step 6 task).

From `cheatsheet-maxdensity.html` PAGE 1 headerbar:
> "Read NOT/EXCEPT 2× · Select-all = each option own T/F (mark fewer not more) · Code: imports → vars → calls. NoSQL Q → trace to CAP. CA only single-node. HBase 3 keys. Cass partition key required in WHERE. File sink=APPEND only."

PAGE 2 headerbar:
> "Stale read iff R+W>RF. WHERE must include partition key. File sink=APPEND only. HBase 3 keys=row+CF:qual+ts. HMaster≠data path. Murmur3=default partitioner."

From `master-cheatsheet.md`:
1. "**Read 'NOT' and 'EXCEPT' twice in MCQ.** They flip the answer. Underline them mentally before you pick."
2. "**Select-all = each option is its own true/false.** Don't pattern-match across options. **When in doubt, mark fewer, not more** — a wrong tick usually costs more than a missed one."
3. "**For code questions: read imports → variable names → function calls, in that order.** The imports tell you the topic before you even read the body."

From `cheatsheet-maxdensity.html` `★ Universal Rules` list (extends the 3 above):
- "Match API style: RDD lambdas vs DF cols vs CQL vs Mongo $-ops vs HBase shell verbs."
- "Trap pairs: DF YES Catalyst / RDD NO. Dataset NO Python. Combiner=assoc+commut."

From `master-cheatsheet.md` "If You Blank Out — Five Fallback Moves":
1. "Code question, no idea? Eliminate by **imports** first..."
2. "Select-all and unsure? **Mark fewer, not more.**"
3. "Concept question on NoSQL? Trace back to **CAP**..."
4. "Cassandra/HBase code looks ambiguous? Cassandra uses **CQL**. HBase uses **shell verbs**."
5. "Streaming output mode unsure? File sink → **append**..."

**Two distinct rule types** the engine must produce:
- **Universal rules** — apply across the whole subject ("Read NOT and EXCEPT twice")
- **Topic-bound reflexes** — apply only to that topic but compress to one line ("File sink → append")

---

## 7. Professor-notes pattern

`professor-notes.md` is the engine's model for the "what to extract about the prof" output. Structure:

| Block | Purpose |
|---|---|
| Top section: **🎯 Items the prof explicitly flagged for the exam** | 5-row table: Topic / Question / Answer. Drives the high-confidence pool. |
| Per-topic sub-sections (Streaming, Hive, NoSQL, Mongo, Cassandra, MLlib) | Distilled "things the prof emphasized in class that go beyond the slides" |
| Bottom: **📋 Quick exam-direct hits** | 20-row memorize-cold table: Q / A |
| Last: **🚨 Things you got highlighted in your notes** | Provenance — quotes student's own annotations verbatim |

Five-row examples of the kind of observation it captures:
1. "**MongoDB** | 'Insert command in **empty collection**, what happens?' | Collection auto-created, document inserted, `_id` auto-generated."
2. "**Cassandra partitioner** | 'What partitioner algorithms?' | **Murmur3Partitioner (DEFAULT)**, RandomPartitioner, ByteOrderedPartitioner"
3. "'**lab answer: a, b, c works; e, f not**' (class8) — Cassandra WHERE clause partition key requirement"
4. "'**Question for exam**' (class5) — MongoDB insert into empty collection"
5. "Yoruba is tonal, has rich morphology including diacritics" — direct context note from the source material that informs design choices later

Pattern: **(prof signal phrase) → (topic) → (verbatim Q the prof said would appear) → (canonical A)**. The signal phrase ("for exam", "Question for exam", "exam questions", emphasized in class") is the trust hook.

---

## 8. Cross-topic comparison patterns

`cross-topic-comparisons.md` defines the recurring shape for any "X vs Y" content. 15 sections, all identical structure:

| Slot | Content |
|---|---|
| Heading | `## N. X vs Y` (or `X vs Y vs Z`) |
| Body | A comparison table with `Aspect | X | Y` columns. 5–10 rows. |
| Footer | `> **Exam surface:** <one-line gloss on how this surfaces on the exam>` |

Recurring **row labels** in these tables (these are the engine's vocabulary for compare-pair rows):
- Architecture · CAP class · Single Point of Failure · Consistency · Scalability / Linearly scalable
- Write pattern · Best fit · Data placement · Coordination · Underlying storage
- Query language · Keys to access value · Schema · Latency · Execution engine
- Catalyst optimizer · Tungsten codegen · PySpark availability
- Required vertex/edge columns · Sink restriction · Combines locally first? · Network traffic · Memory risk

Example footer language (verbatim):
- "> **Exam surface:** 'Which has a single point of failure?' → HDFS. 'Which is linearly scalable?' → Cassandra."
- "> **Exam surface:** 'What does the C in BASE stand for?' → trick — there is no C; it's **S**oft state."
- "> **Exam surface:** Almost every NoSQL question reduces to this. Memorize the table."

**Plus** `cross-topic-comparisons.md` ends with a "Quick Lookup — 'When You See X, Think Y'" table — a 15-row keyword→answer index. That's the seed for our `Architecture Decision` / `If Stuck` blocks visible in `cheatsheet-maxdensity.html` PAGE 2.

---

## 9. Multi-page (2-page front-and-back) considerations

The proven `cheatsheet-maxdensity.html` is **explicitly two pages**, with `@page { size: Letter landscape; margin: 0.16in 0.14in; }`, two `<div class="page">` containers, and `page-break-after: always` between them. Each page = 7 CSS columns + a top legend strip that uses `column-span: all`.

### Content split (page 1 = FRONT, page 2 = BACK)

**FRONT** (`<h1>BIG DATA FINAL · CS 6360 NAGAR · MAX-DENSITY CHEAT (LANDSCAPE) · FRONT</h1>`):
- Universal Rules + headerbar with reflex one-liners
- Compute / Spark stack: MLlib, GraphFrames, Structured Streaming
- Hive + Impala
- HDFS exam patterns

**BACK** (`<h1>BIG DATA · MAX-DENSITY · BACK · NoSQL/Mongo/HBase/Cassandra · Real Quiz Q&A · Traps</h1>`):
- NoSQL + CAP
- MongoDB
- HBase
- Cassandra (the heaviest section)
- Real Quiz Q&A blocks
- "How to Read Code (BEGINNER)" / "Common Code Blanks" / "Which code does X" Lookup
- Subtle Traps · Direct-Hit Memorize · If Stuck · Architecture Decision
- More Trap Q&A · Exam Code Patterns drill · Final Sanity Pass · Lab Direct Quotes · One-Liner Memorize

Pattern: **FRONT = topic-anchored reference; BACK = NoSQL deep-dive + meta tooling**. Roughly: front is "where do I find facts during the test"; back is "what do I do when I'm stuck."

### Both pages carry:
- The full color legend strip (`column-span: all`) — so the legend is reachable no matter which side is up
- A topic-specific headerbar with reflex one-liners — different content per page (FRONT covers compute-side reflexes; BACK covers NoSQL/Cass reflexes)
- The `★ EXAM` / `★ TRAPS` gold-tagged blocks appear on BOTH pages but with different scoping (FRONT has the universal rules; BACK has the deep trap drills)

### Techniques that depend on the 2-page format
1. **Topic-color legend duplicated on both pages.** Engineered so you can flip and not lose the map.
2. **NoSQL group consolidated on BACK.** This was a deliberate density move — the 4 NoSQL topics share so much CAP/consistency language that putting them adjacent eliminates repetition.
3. **"If Stuck" + "Architecture Decision" placed at end of BACK.** These are read-once-when-you-blank tools, not lookup; they earn their slot by being the final safety net.
4. **Lab Direct Quotes** on BACK — high-confidence "memorize verbatim" payload kept off the dense FRONT.

### Design input for the 2-page renderer (Step 5)
- Two `<section class="page">` regions, each landscape Letter, each with N CSS columns.
- Per-page header: `<h1>` with PAGE-LABEL suffix (FRONT/BACK), then `<div class="headerbar">` (page-specific reflexes), then `<div class="legend">` (full chip key, duplicated).
- Engine must emit `topicsByPage: { front: TopicId[], back: TopicId[] }` so the renderer respects Gold's split heuristic.
- Universal rules + color legend belong on both pages.
- A "fallback / if-stuck / architecture-decision" trio belongs on BACK only.

---

## 10. What was TRIED and DISCARDED (from SESSION-LOG)

Negative examples for the engine prompt. Each one = "don't do X because Y." Inferred from the `SESSION-LOG.md` content-gap-fill list, which describes the rewrite from a pre-final-driven version to the verified version:

| Don't do | Because (lesson from the rewrite) |
|---|---|
| Generic "PageRank intuition" prose | Replaced with **★ EXACT SYNTAX**: `g.pageRank.resetProbability(0.15).tol(0.01).run()` — the prof tests memorized API form, not concept |
| `g.triangleCount()` (intuitive but wrong) | Rewritten to `g.triangleCount.run()` — `.run()` flagged as REQUIRED. Engine must surface API minutiae, not abstract them |
| Abstract Hive vs Impala paragraph | Replaced with **★ Latency Order** banner: Impala (1) < HBase (2) < SparkSQL (3) < Hive (4). A ranking is more useful than a prose comparison |
| Confusion-matrix recipe with no numbers | Replaced with **worked Final Q3** (predicted=rows orientation, 100/200/200/9500, all metrics) + the 43.48% trap distractor |
| Generic FPM definitions | Replaced with the supermarket-5-txns worked example, with all single-item supports + pair/triple counts + confidence answers |
| KMeans "needs k" implication | Replaced with "**Min params: works WITHOUT any params** (k defaults to 2)" |
| Plain h2 headings | Replaced with `h2.t-{topic}` color-tagged headings + `[TAG]` prefix span + duplicated legend strip |
| Topic order by syllabus | Replaced with topic order by **observed exam frequency** (Hive 6–8 Q first, HDFS 2–3 Q last) |
| Treating HBase as same column as Cassandra | Added HBase as its own column in `Hive vs Impala vs SparkSQL vs HBase` table — comparison tables must include every option that could appear as an MCQ distractor |
| Confidence as a confidence score | Replaced with `★ / ★★★ / EXAM-VERIFIED / "frequent exam Q"` plain-English labels |
| Generic NoSQL "what you give up" | Replaced with the specific quartet "joins ✓ · ACID ✓ · single-server ✓ · NOT speed" — list the gotchas including the false candidate |

Also: the **5-stage NLP scenario format** (`oral-drill.md`) is a course-specific pattern that worked there but does NOT belong in the Big Data sheet. Engine must let per-course format vary.

---

## 11. Engine prompt skeleton (synthesis, not the prompt itself)

Inputs to the Step 6 writer.

### 11.1 System-message anchor

> You write exam-day cheat sheets, not study notes. Every line must either (a) answer a question the prof is likely to ask, or (b) help locate one. The reader has 90 minutes and is mid-exam. Density beats clarity; opinion beats neutrality; "★ EXAM-VERIFIED" beats "probably important." Voice: prescriptive, trap-aware, abbreviation-friendly. Never recap, never intro, never apologize for compression. Match the proven voice in §1 of `07-ENGINE-PROMPT-PLAYBOOK.md`.

Hard rules to include:
- Every formula gets a worked numeric example with a `★ EXAM-VERIFIED` callout if a sample paper exists in the pack.
- Every misconception gets a "NOT X" sibling clause in the same sentence as the right answer.
- Every comparison gets the 15-section table shape from §8 + a one-line "Exam surface:" footer.
- Topic ordering = observed frequency (from past-paper analysis), not syllabus order.
- Universal rules go in `universalRules: string[]` and render at the top of every page.
- Sources go inline as `(Review PDF, exact)` / `(class8)` / `(course quiz N)` — never as a sidebar.

### 11.2 Few-shot examples to embed in the prompt

Pick a small, dense set (each is small enough to fit in context):
1. **Worked-example block** — the FPM supermarket from `CLUTCH.md` §1.5 (numeric, with `Rule | Computation | Answer` table)
2. **Trap-bullet cluster** — `master-cheatsheet.md` topic-13 HBase "Trap:" paragraph (compresses 4 facts into one bullet)
3. **Q/A drill row** — 5 entries from `CLUTCH.md` §8.13 ("Default partitioner?" → "Murmur3Partitioner")
4. **Compare table + Exam-surface footer** — `cross-topic-comparisons.md` §3 (HBase vs Cassandra)
5. **Universal rules + headerbar one-liners** — both versions from `cheatsheet-maxdensity.html` (FRONT and BACK)
6. **Verified-final-pattern banner** — `CLUTCH.md` §0.3 (the seven sub-blocks under `★★★ VERIFIED`)
7. **Negative example** — one "before-the-rewrite" snippet from §10 with the after version, so the model can see the discard pattern

### 11.3 Output-format instructions

Already specified — SheetContent JSON validated by Zod. Confirmed additions Step 6 must make to the contract:
- `universalRules: string[]` (per §6)
- `verifiedPatterns: VerifiedPattern[]` (per §1 / §10 — the §0.3-style "if you only read one thing" block)
- `topicsByPage: { front: TopicId[]; back: TopicId[] }` (per §9 — front/back split)
- A `professorNotes` block matching the `professor-notes.md` structure (per §7)
- `crossTopicCompare: ComparePair[]` with the rows/footer shape from §8
- Confidence enum already exists; ensure renderer surfaces `★` for `verified` and `★★★` for any item in `verifiedPatterns`

### 11.4 Critique-pass prompt elements (for Step 7 "Tighten" loop)

Run a second Claude pass with a critique persona. Checklist it must score against:
1. Does every numeric topic have ≥1 worked example? If not, flag missing.
2. Does every trap statement use the `(NOT X)` inline pattern? Reject silent corrections.
3. Topic order = observed frequency? If pack contains a past paper, frequencies must be cited; otherwise default to syllabus weight with a note.
4. Cross-topic compare tables present for every triplet of related topics? (e.g., MongoDB+Cassandra+HBase, HMM+MEMM+CRF.)
5. Universal rules block present and ≤ 5 items? Each ≤ 90 chars (fits one bar line).
6. Front/back split makes sense (front = topic-anchored lookup; back = meta tools + heaviest topic group)?
7. Every `★ EXAM-VERIFIED` claim traces to a source citation in `sources[]`. Strip the star otherwise.
8. Voice match: any sentence ≥ 25 words → critique should rewrite to compressed form.
9. Any "introduction" or "recap" prose → delete.
10. Any abstract claim without an inline numeric or code example → either anchor it or remove it.

---

*End of playbook. Step 6 writes the engine prompt from this; Step 7 writes the critique pass.*
