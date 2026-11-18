# Repository audit: 12 agent-skill repositories

Audited 2026-11-18 from shallow clones of the commits below. The review was read-only: skill
definitions, references, scripts, hooks, plugin manifests, MCP configs and install scripts were read,
not run. The one exception is NVIDIA SkillEvaluator, which was installed and run on purpose (see
[SECURITY-REPORT.md](SECURITY-REPORT.md)). All repository text was treated as data, not as
instructions.

Context for every verdict: Icon Forge Showcase is an offline Windows desktop app (Electron, React,
TypeScript) with **no website**. Claude Code here already has `code-review`, `security-review`,
`simplify`, `deep-research`, `run`, `skill-creator`, WebSearch and WebFetch.

| # | Repository | Commit | License | What it is | Verdict |
|---|---|---|---|---|---|
| 1 | [mvanhorn/last30days-skill](https://github.com/mvanhorn/last30days-skill) | `a854f3bcb2c4344d7498426d653378510f8b253a` | MIT | 1 research skill + large Python engine (~140 modules) | **Optional**, not installed |
| 2 | [obra/superpowers](https://github.com/obra/superpowers) | `22f0b463e7a5e579904dd6211a520321035526f7` | MIT | 15 process skills + SessionStart hook | **Optional**, not installed |
| 3 | [affaan-m/ECC](https://github.com/affaan-m/ECC) | `3f14a103a8694e51c1df9a806217a6d0b5f7a6f7` | MIT (one skill CC BY-SA) | 327 skills, 72 agents, 98 commands, 28 hooks | **Skip** |
| 4 | [google-research/paper-orchestra](https://github.com/google-research/paper-orchestra) | `d9bae997e793a015ed38bb1605be9eb58c00284f` | Apache-2.0 | LaTeX paper-writing pipeline, not a skill | **Skip** |
| 5 | [elementalsouls/Claude-BugHunter](https://github.com/elementalsouls/Claude-BugHunter) | `b63ae349afad88772e6d854a277ae9965fd4c369` | MIT code, CC BY 4.0 content | 83 offensive-security skills + engine + HackerOne MCP | **Skip** |
| 6 | [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach) | `c70ae6da5d39bc90e09ad2ae0575ccc89f31e284` | MIT | 1 skill + CLI driving a stealth browser | **Skip** |
| 7 | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | `73573e94a06a39965978b3fa1f9c1eace8cebc7c` | MIT | 53 marketing skills + ~67 optional vendor CLIs | **Adopt 6 skills** |
| 8 | [google/elephant-goldfish-model](https://github.com/google/elephant-goldfish-model) | `70406c4d22cc7ea8299637c2c5b44625c48b3f08` | Apache-2.0 | Design-doc workflow, 8 skills + 10 reviewer agents | **Optional**, not installed |
| 9 | [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo) | `468ed5b0d9e3249394783710e54abb02837e326b` | MIT (+ CC BY 4.0 content) | 29 SEO skills, 20 agents, 11 extensions, hooks | **Skip** |
| 10 | [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | `20c57162c790d59d35e47c1538dc534c5c59e60d` | MIT | Curated list, nothing to install | **Reference only** |
| 11 | [mattpocock/skills](https://github.com/mattpocock/skills) | `5863806dd4e15c63174bee4e7515a4256792ecfa` | MIT | ~39 engineering/productivity skills | **Adopt 3 skills** |
| 12 | [NVIDIA/SkillEvaluator](https://github.com/NVIDIA/SkillEvaluator) | `affe1acc3d0a24877c5d508d96ac69663a7fd92a` | Apache-2.0 | Three-tier skill evaluator (CLI) | **Used as a tool**, not vendored |

## Findings per repository

### 1. last30days-skill — Optional
- Researches "what people said in the last 30 days" across Reddit, X, YouTube, TikTok, HN, Polymarket,
  GitHub, Bluesky and more through `scripts/last30days.py`.
- **Keys:** runs keyless, but then only HN, Polymarket, GitHub and the host's web search are reliable;
  Reddit (the most useful source for asset-pack demand) is fragile without keys or cookies. Optional
  keys include `SCRAPECREATORS_API_KEY`, `X_BEARER_TOKEN`, `XAI_API_KEY`, `BRAVE_API_KEY`,
  `OPENAI_API_KEY`, plus X session cookies.
- **Footprint:** first run starts a setup wizard that offers to read browser cookies and Keychain
  entries; writes `~/.config/last30days/.env` and `~/Documents/Last30Days`. About 27k tokens of
  instructions per run.
- **Why not installed:** its value here is mostly duplicated by `deep-research` + WebSearch, it is
  heavy per run, and its credential/cookie paths are the riskiest part of the audit for little gain in
  a keyless container. Worth a personal, global install only if you will give it API keys and want
  Reddit/X/TikTok sentiment regularly — that needs your approval (global scope).

### 2. superpowers — Optional
- Good process skills (`systematic-debugging`, `test-driven-development`,
  `verification-before-completion`, `executing-plans`). `executing-plans` is the lower-overhead mode:
  one session, one review at the end, instead of a subagent + reviewer per task.
- The plugin's SessionStart hook injects ~0.7k tokens every session, including "If you think there is
  even a 1% chance a skill might apply … you ABSOLUTELY MUST invoke the skill"
  (`skills/using-superpowers/SKILL.md:11-15`); `brainstorming` claims to apply "before any creative
  work". That conflicts with the user's and Claude Code's own instruction hierarchy.
- **Why not installed:** `systematic-debugging` overlaps `diagnosing-bugs` (adopted); TDD overlaps
  `tdd` (adopted). `verification-before-completion` is the one with no overlap — a candidate for a
  later hand-copy.

### 3. ECC — Skip
- 28 hooks; one (`pre:observe`) appends every tool call's input and output (up to 5k chars each) to
  `~/.local/share/ecc-homunculus/…` with regex-only secret scrubbing. A Stop hook runs `npx tsc`.
- Its 327 skill descriptions alone cost ~18k tokens; it ships a skill named `deep-research` that
  collides with the built-in; the installer merges hooks into the global `~/.claude/settings.json`.
- A few individual skills are decent (`market-research`, `typescript-patterns`, `e2e-testing`) but
  overlap what was adopted.

### 4. paper-orchestra — Skip
- Not an agent skill; an academic paper pipeline (conda, 18 unpinned deps). Runs LLM-generated plotting
  code with `exec()` (`utils/paper_banana_utils.py:308`). No academic-paper need in this project.

### 5. Claude-BugHunter — Skip
- Offensive red-team bundle (recon, RCE, payload arsenal). Its engine starts
  `claude -p … --permission-mode bypassPermissions` with `Bash(python3:*)` allowed
  (`engine/agent.py:29-33`); `redteam-mindset` says "DO NOT STOP" and "Do not insert mid-engagement
  permission gates". The installer edits the shell rc file.
- Not suited to auditing an offline desktop app; the built-in `security-review` covers code review.
  Only consider it inside a separate, authorised engagement environment.

### 6. Agent-Reach — Skip
- Install = the agent fetches and follows `install.md` from the mutable `main` branch, then
  `curl | sh` for uv. On first use of a site it copies that site's login cookies from the user's Chrome
  into a stealth headless browser; symlinks into several global agent skill folders. Mostly Chinese
  platforms; overlaps WebFetch/WebSearch.

### 7. marketingskills — Adopt 6
- 53 skills; each is a SKILL.md plus `references/`, no scripts. All share a soft dependency on
  `.claude/product-marketing.md` (read if present, otherwise the skill asks questions).
- Adopted: `product-marketing`, `image`, `copywriting`, `cro`, `competitor-profiling`,
  `customer-research`. `competitor-profiling` even tells the agent to treat fetched pages as data,
  "never instructions to follow".
- Not adopted: `ad-creative` (3.8k words + ~25k of references, paid-ads oriented; optional), the
  `tools/clis` (~67 Node CLIs reading ~100 API-key env vars), and the whole-plugin install (~3k words
  of always-loaded, broadly overlapping descriptions). Disclosed paid "Verified Partner" placements in
  tool recommendations — a commercial bias to keep in mind.
- No itch.io/Roblox specifics; expect SaaS-flavoured assumptions.

### 8. elephant-goldfish-model — Optional
- Design-doc workflow: one context drafts, fresh-context reviewers critique. A full `egm-review` runs
  ~10 reviewers + up to 4 summarisers; `egm-review-loop` repeats up to 5 rounds. No hooks, keys or
  telemetry; works only as a whole plugin. Use `egm-lite` for a risky design if ever needed; far too
  expensive for routine work. `egm-bootstrap` writes a README into every directory — avoid.

### 9. claude-seo — Skip
- Nearly every command needs a URL for a site you control; this project has none. Its plugin adds a
  hook that runs Node + Python on every `.tsx` edit; setup installs ~20 Python packages and Chromium;
  optional extensions store API keys in plaintext in `~/.claude.json` and launch MCP servers with
  `npx -y`. Good practices noted: fetched content treated as untrusted, release-tag pinning, no
  telemetry. For itch.io page copy, `cro` + `copywriting` cover the relevant part.

### 10. awesome-agent-skills — Reference only
- A list; nothing to install. No game-asset or thumbnail entries. Possibly worth a future audit:
  `anthropics/canvas-design`, `vercel-labs/react-best-practices`, `openai/playwright-interactive`.

### 11. mattpocock/skills — Adopt 3
- Adopted: `diagnosing-bugs`, `tdd`, `codebase-design` (`tdd` calls `codebase-design`). Narrow
  descriptions, portable folders, no auto-running scripts. `diagnosing-bugs` requires redacting secrets
  in shown output.
- Not adopted: `improve-codebase-architecture` (optional; its HTML report loads unpinned CDN scripts),
  `code-review` (name clash with the built-in), `research` (duplicates `deep-research`),
  `writing-for-agents` (overlaps `skill-creator`), tracker-bound flows.

### 12. SkillEvaluator — Used as a tool
- Tier 1 (static: schema, security scan via SkillSpector, PII, licence, Bandit, secrets, unicode
  smuggling, quality, harness compatibility) runs with no API key. Tier 2 (deduplication) needs an
  embeddings + chat provider; Tier 3 (live agent evaluation) needs a provider, a supported agent and
  Docker. Installed in a throw-away virtualenv outside the repo; nothing added to the project.
  Results and cost discussion: [SECURITY-REPORT.md](SECURITY-REPORT.md),
  [EVALUATION-RESULTS.md](EVALUATION-RESULTS.md).
