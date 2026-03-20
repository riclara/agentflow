# agentflow Blog Post — Outline & Production Plan v2

## Changelog vs v1

Las siguientes secciones se actualizaron para reflejar los cambios implementados:

### Cambios implementados desde v1
1. **Feature Directories** — `docs/plan.md` y `docs/review.md` ahora van en `docs/features/<slug>/`. Cada feature queda aislada. Esto afecta la seccion 2d (Files as Protocol), seccion 4c (day-to-day usage), y todos los diagramas.
2. **Plan Approval Gate (Phase 1b)** — El pipeline ahora pausa despues de generar el plan y pide aprobacion al usuario antes de implementar. Afecta seccion 2c (pipeline), seccion 4c (usage), y es material para una nueva leccion en seccion 5.
3. **Version Check** — El CLI ahora consulta npm al ejecutarse y avisa si hay version nueva. Material para seccion 4d (customization/management).

### Secciones que NO cambian
- Hook (no referencia tecnica)
- Section 1a (cost problem)
- Section 1b (context pollution)
- Section 3 (tool comparison — el formato de archivos no cambio)
- Social media snippets
- SEO targets
- Cross-posting strategy

---

## Meta

* Title EN: "Stop Paying Your Architect to Lay Bricks: How I Built a Multi-Agent Pipeline for AI Coding Tools"
* Title ES: "Deja de Pagarle al Arquitecto por Poner Ladrillos: Como Construi un Pipeline Multi-Agente para Herramientas de Codigo AI"
* Subtitle: A reusable workflow that makes Claude Code, Codex, and OpenCode work like a real dev team — with the right model for each job.
* Target length: 3,200–4,200 words (16-19 min read)
* Audience: Developers using AI coding tools who want to optimize cost, quality, and automation
* Tone: Practical, opinionated, first-person. Not academic — more "here's what I built and why"
* Publish to: Personal blog (canonical), cross-post to Dev.to and Medium

---

## Structure

### Hook (2-3 paragraphs)

Open with the cost absurdity:

> You're running Claude Opus at $15/M input tokens to write boilerplate CRUD endpoints. That's like hiring a senior architect to lay bricks.

Then the real problem: it's not just cost — it's quality degradation. When one agent plans, codes, tests, and documents in a single context window, quality drops as context grows. By the time it writes tests, it's forgotten half the requirements.

Close the hook: "I built a system that fixes both problems. It works across 5 different AI coding tools, and it's a single CLI command to set up."

Production notes:
* No diagram here, just strong writing
* Keep under 150 words

---

### Section 1: The Problem — Why Single-Agent Workflows Break Down

EN heading: "The $200 Mistake You're Making Every Day"
ES heading: "El Error de $200 Que Cometes Todos los Dias"

#### 1a. The Cost Problem

* Most developers use the same model for everything
* Planning requires intelligence (expensive model), implementation requires speed (cheap model), docs require neither (cheapest)
* Quick cost comparison table:

| Task | Opus cost | Sonnet cost | Haiku cost |
|------|-----------|-------------|------------|
| Plan a feature (2K tokens out) | $0.03 | $0.006 | $0.001 |
| Implement 5 files (10K tokens out) | $0.15 | $0.03 | $0.005 |
| Write tests (5K tokens out) | $0.075 | $0.015 | $0.0025 |
| Write docs (3K tokens out) | $0.045 | $0.009 | $0.0015 |
| **Total** | **$0.30** | $0.06 | — |
| **Mixed** (Opus plan + Sonnet code + Haiku docs) | **$0.08** | — | — |

"Same quality where it matters. 73% cheaper."

NOTE: Calculate real numbers before publishing. These are illustrative.

#### 1b. The Context Pollution Problem

* A single agent accumulating plan + code + review + tests in one context window loses coherence
* By phase 4, the agent has 50K+ tokens of context and starts forgetting requirements from phase 1
* Quote the research: each subagent gets a fresh context window, preserving quality per phase

#### 1c. The Configuration Tax

* "I use Claude Code, Codex, Cowork, and OpenCode across different projects. Every time I start a new project, I spend 30 minutes setting up agent configs from scratch."
* Each tool has a different format: YAML frontmatter, TOML files, JSON configs, markdown instructions
* This is the problem agentflow solves

Production notes:
* Cost comparison table (use real API pricing, calculate before publishing)
* Optional: screenshot of a bloated single-agent context vs clean subagent context
* Length: ~600 words

---

### Section 2: The Architecture — Orchestrator-Worker with Feedback Loop

EN heading: "The Pattern: Think Like a Team, Not Like a Solo Dev"
ES heading: "El Patron: Piensa Como un Equipo, No Como un Dev Solo"

#### 2a. The Analogy

A software team doesn't have one person do everything:
* The architect designs (doesn't code)
* The developer implements (doesn't review their own work)
* QA tests (doesn't fix bugs they find)
* The tech writer documents (doesn't touch the code)

Your AI workflow should work the same way.

#### 2b. The 4 Agents

| Agent | Think of them as... | Model | Key constraint |
|-------|-------------------|-------|----------------|
| Planner | Senior architect | Opus (expensive) | Read-only, never writes code |
| Implementer | Mid developer | Sonnet (balanced) | Follows the plan exactly |
| Tester | QA engineer | Sonnet (balanced) | Never fixes bugs, only reports |
| Documenter | Tech writer | Haiku (cheap) | Never touches code or tests |

#### 2c. The 6-Phase Pipeline (ACTUALIZADO)

> **Cambio vs v1:** Ahora son 6 fases, no 5. Phase 1b (Plan Approval) es nueva.

Walk through the flow with a diagram:

```
Phase 1:  Plan          -> Planner analyzes, writes docs/features/<slug>/plan.md
Phase 1b: Plan Approval -> User reviews plan, approves/requests changes/cancels
Phase 2:  Implement     -> Implementer reads plan, writes code
Phase 3:  Review        -> Planner reviews code, writes docs/features/<slug>/review.md
                           └─ If NEEDS_CHANGES -> back to Phase 2 (max 3x)
Phase 4:  Test          -> Tester writes + runs tests
                           └─ If tests fail -> back to Phase 3
Phase 5:  Document      -> Documenter writes README + docs
                           └─ Only runs after tests pass
```

**Punto clave sobre Phase 1b:** El pipeline ya no corre ciego. Despues de que el planner genera el plan, el orquestador pausa y muestra al usuario:
- Numero de tareas
- Archivos a crear/modificar
- Decisiones arquitectonicas clave

El usuario puede:
- **Aprobar** -> continua a implementacion
- **Pedir cambios** -> el planner regenera el plan con el feedback
- **Cancelar** -> el pipeline se detiene

Esto le da al usuario un checkpoint critico antes de gastar tokens en implementacion. En la practica, esto previene el escenario de "el agente implemento algo completamente diferente a lo que yo queria".

#### 2d. Files as Protocol (ACTUALIZADO)

> **Cambio vs v1:** Las rutas ahora son `docs/features/<slug>/` en vez de `docs/`.

Explain the communication mechanism:
* Agents don't share context — they share files
* `docs/features/<slug>/plan.md` is the contract between planner and implementer
* `docs/features/<slug>/review.md` is the feedback channel
* This works identically across all tools because every tool can read/write files
* **Nuevo:** Each feature gets its own directory. Running the pipeline twice doesn't overwrite the previous feature's artifacts.

```
docs/features/
├── add-user-auth/
│   ├── plan.md
│   └── review.md
├── add-caching/
│   ├── plan.md
│   └── review.md
└── offline-sync/
    ├── plan.md
    └── review.md
```

**Punto clave:** Esto resuelve un problema real — si corres el pipeline para "Add auth" y luego para "Add caching", los archivos de la primera feature se preservan. Puedes volver a consultarlos, compararlos, o reiniciar el review loop de una feature anterior.

#### 2e. The Skill as Orchestrator

Explain the key insight: subagents can't spawn other subagents. The Skill file (SKILL.md) contains all the pipeline logic — sequencing, loop control, approval gates, decisions. The agents are dumb executors.

This is like a CI/CD pipeline: the pipeline definition controls the flow, each step just does its job.

Production notes:
* MAIN DIAGRAM: The full 6-phase pipeline with feedback loops and approval gate (generate SVG)
  * **Actualizar:** Debe mostrar Phase 1b como un rombo de decision (approve/change/cancel)
  * **Actualizar:** Las rutas en el diagrama deben mostrar `docs/features/<slug>/`
* Secondary diagram: Feature directory structure showing multiple features isolated
* Code snippet: Show what SKILL.md looks like (the pipeline definition) — **incluir el bloque Setup y Phase 1b**
* Length: ~800 words

---

### Section 3: How It Works Across 5 Tools

EN heading: "One Architecture, Five Tools"
ES heading: "Una Arquitectura, Cinco Herramientas"

> Sin cambios en esta seccion. El formato de archivos por herramienta no cambio.

| Tool | Automatic | Manual | Agent format |
|------|-----------|--------|-------------|
| Claude Code | /agentflow | @agent-planner | .md (YAML) |
| Cowork | /agentflow | same | .md (YAML) |
| Codex CLI | $agentflow | "Spawn planner..." | .toml |
| Codex App | $agentflow | same | .toml |
| OpenCode | — | @planner | .md (YAML) |

Production notes:
* Cheat sheet table (ready to screenshot or embed)
* Optional: side-by-side screenshots of the same pipeline running in Claude Code vs Codex
* Length: ~400 words

---

### Section 4: Introducing agentflow

EN heading: "agentflow: One Command to Set It All Up"
ES heading: "agentflow: Un Comando para Configurar Todo"

#### 4a. What it is

A Node.js CLI that generates all the config files for your chosen tools. One command, and your project is ready for multi-agent development.

```bash
npm install -g agentflow
cd my-project
agentflow init
```

#### 4b. The init experience

Show the interactive flow:

```
? Which tools? ◉ Claude Code + Cowork  ◉ Codex CLI + App
? Language? TypeScript
? Framework? Express
? Test runner? npx vitest run
? Planner model? opus
? Implementer model? sonnet
? Tester model? sonnet
? Documenter model? haiku

  CREATE  .claude/skills/agentflow/SKILL.md
  CREATE  .claude/agents/planner.md
  CREATE  .claude/agents/implementer.md
  CREATE  .claude/agents/tester.md
  CREATE  .claude/agents/documenter.md
  CREATE  .codex/agents/planner.toml
  CREATE  .codex/agents/implementer.toml
  CREATE  .codex/agents/tester.toml
  CREATE  .codex/agents/documenter.toml
  CREATE  .agents/skills/agentflow/SKILL.md
  ✅ Done! Run: /agentflow <your feature>
```

#### 4c. Day-to-day usage (ACTUALIZADO)

> **Cambio vs v1:** Mostrar Phase 1b en accion y las rutas por feature.

Real example:

```
/agentflow Add offline content caching with LRU eviction at 500MB
```

Then describe what happens automatically:

1. **Setup** — The orchestrator creates `docs/features/add-offline-content-caching/`
2. **Planner** (Opus) analyzes your codebase, writes a plan to `docs/features/add-offline-content-caching/plan.md`
3. **Plan Approval** — The pipeline pauses and shows you the plan summary. You review tasks, files, and architecture decisions. You approve, request changes, or cancel.
4. **Implementer** (Sonnet) writes the code following the approved plan
5. **Planner** (Opus) reviews, sends back for fixes if needed
6. **Tester** (Sonnet) writes and runs tests
7. **Documenter** (Haiku) updates the README

"You type one line. The pipeline plans, asks for your OK, then five specialized agents do the work. And if you run another feature tomorrow, yesterday's plan is still there."

#### 4d. Customization and management (ACTUALIZADO)

> **Nuevo:** Incluir version check.

Show that everything is configurable:

```bash
agentflow config set models.tester haiku       # cheaper tests
agentflow config set workflow.maxIterations 5   # more review cycles
agentflow update                                # apply changes
```

**Nuevo:** The CLI checks for updates automatically:

```
$ agentflow status
📊 agentflow v1.0.0
...
ℹ agentflow v1.1.0 disponible (actual: v1.0.0)
  Ejecuta: npm update -g agentflow && agentflow update
```

No need to manually check for new versions. The CLI queries the npm registry on every run (non-blocking, 3-second timeout, silent on failure) and tells you when there's an update. The `agentflow update` command then regenerates all managed files with the latest templates while preserving your customizations.

Production notes:
* Terminal recording (asciinema or GIF) of agentflow init
* Terminal recording of /agentflow running a real feature — **debe mostrar el checkpoint de Plan Approval**
* Code blocks showing the init output and config commands
* **Nuevo:** Mostrar el aviso de version check
* Length: ~600 words

#### 4e. Three iterations of real feedback (NEW)

EN heading: "What Happened When Someone Actually Used It"
ES heading: "Que Paso Cuando Alguien Realmente Lo Uso"

> A user tested agentflow across 4 pipeline versions on real features. This is the progression.

**v1: The first real test**

The first run was on a medium feature — 8 files, backend + frontend + tests + docs. The division of responsibilities held up: the planner analyzed the actual codebase (didn't invent structure), the implementer followed the plan faithfully, and the review loop approved on the first pass (9/10).

Each agent got a clean context window. The implementer didn't carry the planner's exploration noise. The tester didn't need to know what was discussed during planning — it just read the plan. The user's summary: "The biggest value isn't speed — it's consistency. Plan, implement, review, test, document. Always in that order, never skipping steps."

But the pipeline wasn't fully autonomous. The planner couldn't write its own files (read-only by design), so the user had to manually save plan.md. There was no visibility into what each agent did — a black box between phases. And the tester created an extra test file not in the plan. Good judgment, but uncoordinated.

**v2: Activity log + test coordination**

We added an activity log (what agent did what, when) and a `## Test Files` section in the plan (the planner specifies which test files to create, the tester follows that list).

Results: the activity log proved useful immediately — when the pipeline hit a rate limit and paused, it was easy to see exactly where to resume. The test file mapping made the tester predictable: 29 tests in v2 vs 16 in v1, all explicitly mapped to acceptance criteria. No more improvised files.

The review loop proved it wasn't just ceremony. In the second feature, it found two real bugs — a broken fixture and a schema refinement — that would have caused test failures. The loop earned its keep.

**v3: Task ownership separation**

The remaining friction: the implementer didn't know which tasks belonged to the tester. The plan listed test tasks, but the implementer saw them as unassigned work and left them alone — which was correct, but the reviewer then flagged "missing tests" as an issue, wasting a review iteration.

Fix: split the plan into `## Implementation Tasks` (implementer-owned) and `## Test Tasks` (tester-owned). The reviewer was instructed not to flag test tasks as missing before testing starts. Result: approval on the first review iteration, zero false positives.

**The one thing that never changed — until it did:**

Across all three versions, the same friction persisted: the planner couldn't write files. In every single run, the user had to manually transcribe plan.md and review.md. The pipeline was "autonomous" except for the part where a human had to copy-paste.

Then we shipped the fix (surgical write permissions — see Lesson 8), and the user tested it immediately. The planner explored the codebase, created the directory, and wrote plan.md directly. Six tool calls, zero manual intervention. The most persistent bottleneck in the pipeline — gone.

The user's reaction was simple: "The main recurring problem is solved. The pipeline should flow without that manual friction now."

Four versions. The same user. Each iteration fixed the most painful thing from the last run. That's the kind of feedback loop you want.

Production notes:
* This progression story is the strongest evidence for the blog's thesis — the pipeline improves itself based on real usage
* The numbers tell the story: 16 tests → 29 tests, review iterations wasted → zero false positives, manual transcription → zero intervention
* The arc from "broken" to "fixed" across 4 versions is a satisfying narrative — readers root for it
* The user's consistency quote from v1 is the most shareable line in the post
* ~500 words

---

### Section 5: What I Learned Building This (ACTUALIZADO)

EN heading: "Lessons from the Trenches"
ES heading: "Lecciones desde las Trincheras"

> **Cambio:** Se agregan 5 lecciones nuevas basadas en la experiencia de implementacion y feedback de 3 iteraciones de usuario.

#### Leccion 1: The Skill is the brain, not the agents

I initially made each agent smart with handoff instructions. Then I discovered subagents can't spawn other subagents. Moving all logic to the Skill was actually better — single place to maintain, easier to debug.

#### Leccion 2: Files beat shared memory

I considered in-memory state, structured outputs, etc. Plain markdown files won because: they're inspectable, they work across all tools, and they survive crashes.

**Ahora con feature isolation:** When I first shipped this, all features wrote to the same `docs/plan.md`. The second pipeline run overwrote the first feature's plan. Obvious in retrospect. Now each feature gets its own directory (`docs/features/<slug>/`), and you keep a history of every feature the pipeline has built.

#### Leccion 3: Separate testing from documentation

My first version had one agent do both. But when tests failed, docs never got written. Worse: the tester was spending tokens on docs when it should focus on finding bugs.

#### Leccion 4: The cheapest model for docs is fine

Documentation is the lowest-cognition task. Haiku writes perfectly good READMEs. Save your expensive tokens for planning and review.

#### Leccion 5: Don't implement without user approval (NUEVA)

My first pipeline ran from plan to done without stopping. It felt magical — until the planner misunderstood the requirement and the implementer burned 50K tokens building the wrong thing. Adding a plan approval checkpoint (Phase 1b) was the single highest-value change I made. The pipeline pauses, shows you what it's about to do, and asks "proceed?". If the plan is wrong, you fix it before spending a single token on implementation. This is the same principle as code review — catching problems early is exponentially cheaper.

#### Leccion 6: Version management matters for generated configs (NUEVA)

When I update the prompts (better wording, new pipeline phases, bug fixes), users with existing projects need those updates too. The CLI tracks which files it manages and what version they're on. `agentflow update` regenerates everything from the latest templates while preserving user customizations (model choices, content outside markers). And the automatic version check means users don't have to guess — the CLI tells them when there's a new version.

#### Lesson 7: Consistency beats speed (NEW)

I expected the first user feedback to be about speed. It wasn't. The user said the biggest value was *consistency* — the pipeline always runs the same phases in the same order. No skipping tests because you're tired. No forgetting docs because the feature "seems simple."

This maps to what we know about human teams: the value of a process isn't that it's fast — it's that it's reliable. None of this happens reliably in a single-agent conversation where you're manually deciding "ok now test this."

Build pipelines for consistency first. Speed follows.

#### Lesson 8: Read-only agents need surgical exceptions (NEW)

The planner was designed as read-only — it should never write implementation code. But it *also* needed to write plan.md and review.md. My first design was too blunt: read-only means read-only.

This wasn't a theoretical problem — it was the most persistent friction across three pipeline versions. In every single run, the user had to manually transcribe the planner's output into files. The pipeline was "autonomous" except for the part where a human had to copy-paste.

The fix: give the planner write access, but constrain it by prompt to only write to `docs/features/`. It can create its own artifacts but can't touch source code. When the user tested the fix, the planner explored the codebase, created the directory, and wrote plan.md in six tool calls — zero manual intervention. Three versions of friction, resolved in one prompt change.

The lesson: agent permissions should be as narrow as possible, but never so narrow that they break the pipeline's autonomy. Surgical exceptions > blanket restrictions.

#### Lesson 9: The review loop earns its keep — when it catches real bugs (NEW)

In the first test, the review loop approved on the first pass (9/10). Nice, but you could argue it was unnecessary overhead. Then on the second feature, it found two real bugs: a broken test fixture and a schema that needed refinement. Those would have caused test failures and wasted a full test-fix cycle.

The review loop isn't about catching every bug — it's about catching bugs *before* they propagate downstream. A bug caught in review costs one review iteration. The same bug caught in testing costs a review iteration *plus* a test iteration *plus* an implementation fix. The earlier you catch it, the cheaper it is.

But the review loop can also generate noise. In v2, the reviewer flagged "missing tests" that were actually owned by the tester — a false positive that wasted an iteration. The fix was clear ownership: separate `## Implementation Tasks` from `## Test Tasks` in the plan, and tell the reviewer to ignore test tasks before Phase 4. After that: zero false positives.

The lesson: review loops are worth it, but only if the reviewer knows what's in scope.

Production notes:
* No diagrams needed, just good writing
* Lessons 5-9 are based on real implementation experience and user feedback — strong material for shareable quotes
* Lesson 9 is particularly strong because it tells a "skeptic → convert" story with concrete numbers
* These become shareable quotes / tweet snippets
* Length: ~900 words (expanded from ~400 due to 5 new lessons)

---

### Closing + CTA

Short closing: "AI coding tools are powerful, but they're even more powerful when they work as a team — with a human checkpoint before the expensive work begins."

Call to action:
* Link to GitHub repo
* "Star the repo if this was useful"
* "Try it on your next project: `npm install -g agentflow && agentflow init`"
* Invite contributions: "The prompts are the most important part. If you find better wording, open a PR."

Production notes:
* GitHub repo card embed (Dev.to supports this natively)
* Length: ~150 words

---

## Production Checklist

### Assets to create before publishing

* [ ] Main pipeline diagram — **ACTUALIZAR: 6 fases, rombo de decision en Phase 1b, rutas con `docs/features/<slug>/`** (SVG, both light and dark mode)
* [ ] Cost comparison table with real API pricing numbers
* [ ] Terminal recording: agentflow init (GIF or asciinema)
* [ ] Terminal recording: /agentflow running a real feature — **DEBE mostrar Plan Approval checkpoint**
* [ ] Feature directory tree screenshot (`docs/features/` with multiple features)
* [ ] Cheat sheet image for social sharing
* [ ] Open Graph image (1200x630) for link previews
* [ ] Get permission from user to quote their feedback (anonymized or attributed)
* [ ] GitHub repo must be public before publishing

### Cross-posting strategy

1. Publish on personal blog first (canonical URL)
2. Cross-post to Dev.to with canonical link (same day)
3. Cross-post to Medium with canonical link (next day)
4. LinkedIn post with key diagram + link (same day as blog)
5. Twitter/X thread with the "before vs after" hook (same day)

### SEO targets

* Primary: "multi-agent AI coding workflow"
* Secondary: "Claude Code subagents", "Codex custom agents", "AI coding pipeline"
* Long tail: "how to use different models for different AI agents"

### Spanish version notes

* Translate after English version is final
* Adapt code examples (keep in English, comments in Spanish)
* Publish on same platforms with "[ES]" tag
* Link between both versions at the top

---

## Social Media Snippets (ACTUALIZADO)

### Twitter/X thread hook

"I was spending $0.30 per feature with Claude Opus. Now I spend $0.08 for the same quality.

The trick: stop using one model for everything.

Here's the 6-phase pipeline I built (with a human checkpoint before implementation) 🧵"

### LinkedIn post

"Most developers use one AI model for everything — planning, coding, testing, documenting.

That's like paying a senior architect to lay bricks.

I built agentflow: a pipeline where 4 specialized AI agents handle different phases, each on the right model for the job.

Opus plans. You approve. Sonnet codes. Haiku documents.

Same quality. 73% cheaper. And you review the plan before a single line of code is written.

Works across Claude Code, Codex, and OpenCode.

[link to post]"

### Twitter/X — user feedback quote (NEW)

"I asked the first user what they valued most about the multi-agent pipeline.

Their answer surprised me. It wasn't speed.

'The biggest value isn't speed — it's consistency. Plan, implement, review, test, document. Always in that order, never skipping steps.'

That's the real ROI of structured AI workflows."

### Twitter/X — iteration story (NEW)

"4 versions, same user, same pipeline.

v1: 16 tests. Tester improvised. Manual copy-paste to save plans.
v2: 29 tests. Review loop caught 2 real bugs. Still copy-pasting.
v3: Zero false positives. Task ownership clean. Still copy-pasting.
v4: Planner writes its own files. Zero manual intervention.

Each version fixed the most painful thing from the last run."

### Twitter/X — review loop story (NEW)

"In the first test, the review loop felt like overhead — it approved on the first pass.

In the second test, it caught 2 real bugs that would have cascaded through testing.

In the third test, we eliminated false positives by separating task ownership.

The review loop earns its keep. You just have to give it time."

### Dev.to tags

ai, productivity, tooling, workflow, claudecode

---

## Resumen de cambios v1 -> v3

| Seccion | Que cambio | Por que |
|---------|-----------|---------|
| 2c Pipeline | 5 fases -> 6 fases (Phase 1b: Plan Approval) | El usuario aprueba el plan antes de implementar |
| 2d Files as Protocol | `docs/plan.md` -> `docs/features/<slug>/plan.md` | Features aisladas, no se sobrescriben entre si |
| 4c Day-to-day usage | Muestra el checkpoint de aprobacion y rutas por feature | Refleja el flujo real actual |
| 4d Customization | Agrega version check automatico | El CLI avisa cuando hay nueva version |
| 5 Lessons | +2 lecciones nuevas (approval gate, version management) | Experiencia real de implementacion |
| Diagrams | Actualizar pipeline diagram con Phase 1b y rutas nuevas | Consistencia con el codigo |
| Social snippets | "6-phase" en vez de "5-phase", mencion del human checkpoint | Diferenciador vs otros pipelines |
| Production checklist | +1 asset (feature directory tree screenshot) | Nueva feature visible |
| 4e User feedback | Expandida: progresion v1→v2→v3 con datos concretos | Cuenta la historia de mejora iterativa con numeros reales |
| 5 Lessons | +3 lecciones (consistency, surgical permissions, review loop) | Basadas en feedback de 3 iteraciones de usuario |
| Social snippets | +3 tweets (quote usuario, iteration story, review loop) | Hooks mas fuertes con evidencia real |
