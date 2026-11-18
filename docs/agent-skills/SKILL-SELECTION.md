# Skill selection

Rule used: adopt only what has a clear use in this repository, does not duplicate a Claude Code
built-in, is MIT/Apache-licensed, runs no code on its own, and costs little context when idle.
Classification: **Adopt** (installed), **Optional** (useful in specific cases; not installed),
**Skip**.

## Adopted (9 skills, project scope: `.claude/skills/`)

| Skill | From | Use here | Why this one | Idle cost |
|---|---|---|---|---|
| `diagnosing-bugs` | mattpocock/skills | Hard bugs: canvas rendering, layout, Electron IPC, export | A disciplined reproduce → hypothesise → instrument loop; nothing built-in does this. Chosen over superpowers `systematic-debugging` (overlap; that one comes with "MUST" language) | ~30 words (description) |
| `tdd` | mattpocock/skills | Test-first fixes in a codebase with 576 vitest tests | Short, practical; calls `codebase-design` | ~25 words |
| `codebase-design` | mattpocock/skills | Interface/seam decisions (renderer vs state, layout registry) | Required by `tdd`; useful vocabulary on its own | ~45 words |
| `product-marketing` | marketingskills | Keeps `.claude/product-marketing.md`, which the other five read | Foundation; avoids re-explaining the product each time | 0 (manual only) |
| `image` | marketingskills | Cover/thumbnail and promo-image direction | Closest match to the thumbnail use case | 0 |
| `copywriting` | marketingskills | itch.io/README page copy, template wording | Good "AI tells" list; diagnoses before rewriting | 0 |
| `cro` | marketingskills | Store-page conversion review | Requested; works on any page you share (e.g. an itch.io listing) | 0 |
| `competitor-profiling` | marketingskills | Dated profiles of rival tools and template packs | Keeps observed facts apart from inference; treats fetched pages as data | 0 |
| `customer-research` | marketingskills | Mining forum threads and reviews for buyer language | Separates evidence from conclusions | 0 |

"0" = `disable-model-invocation: true`; they never load unless invoked with `/name`.

## Optional (not installed)

| Candidate | When it is worth it | Why not now |
|---|---|---|
| last30days | Regular Reddit/X/TikTok sentiment research with your own API keys | Keyless output adds little over `deep-research`; heavy (~27k tokens per run); cookie/credential paths; global install needs approval |
| superpowers `verification-before-completion`, `executing-plans` | If you want a stricter "prove it before you say done" habit | Could be copied alone later; the plugin itself injects forcing language every session |
| marketingskills `ad-creative` | Running paid ads | 3.8k words + ~25k of references; no ad campaigns today |
| mattpocock `improve-codebase-architecture` | A repo-wide architecture review | Report loads unpinned CDN scripts; `codebase-design` covers day-to-day use |
| elephant-goldfish-model (`egm-lite`) | A large, risky design doc | Full review = ~10 reviewer agents per round |
| SkillEvaluator Tier 2/3 | Before publishing your own skills | Needs a provider key (and Docker for Tier 3); costs tokens |

## Skipped

| Candidate | Reason |
|---|---|
| ECC (plugin) | 28 hooks incl. full tool-I/O logging; ~18k tokens of descriptions; global settings merge; name clash with `deep-research` |
| Claude-BugHunter | Offensive tooling with `bypassPermissions` engine; not fit for an offline desktop app; built-in `security-review` covers code review |
| Agent-Reach | Remote-instruction install, Chrome cookie reuse, stealth browser, global symlinks; overlaps WebFetch/WebSearch |
| paper-orchestra | No academic-paper need; `exec()` of generated code |
| claude-seo | No website to audit; heavy Python/Chromium setup and an edit hook; plaintext key storage in extensions |
| marketingskills `tools/clis` and the other 46 skills | B2B/SaaS-specific, or vendor-API CLIs needing ~100 keys |
| mattpocock `code-review`, `research`, `writing-for-agents` | Duplicate built-ins (`code-review`, `deep-research`, `skill-creator`) |
| awesome-agent-skills | A list, not an installable |

## Deviations from the original brief

- **Last30Days and Claude SEO were named as initial candidates but were not installed.** Reasons above;
  research for the template work used the built-in WebSearch instead and is cited in
  [EVALUATION-RESULTS.md](EVALUATION-RESULTS.md).
- **Skills are copied, not installed as plugins.** Copying pinned folders keeps scope to this
  repository, avoids hooks and global writes, and makes every update a reviewable diff.
- **Marketing skills were made manual-only** (one added frontmatter line) so they cannot trigger
  during engineering work in this repository.
