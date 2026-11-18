# Evaluation results

Small, real evaluations only. Sample sizes are stated; nothing here is a benchmark. Where a run went
wrong, it is reported as it happened.

## 1. Engineering: `diagnosing-bugs` A/B on a real bug

**Bug.** While building the new templates, the slot frames of Inventory Mockup / Inventory Cover /
Hotbar Banner drifted off their icons after a *Format* change (the grid re-centres its square cells;
the frames were only scaled). The fix (`resnapSlots`) was removed again on a local branch to make a
realistic task with a user-style bug report.

**Setup.** Two Sonnet subagents, same prompt, same commit; one told to follow
`.claude/skills/diagnosing-bugs/SKILL.md`, the baseline not. Task: root cause, minimal fix, regression
test.

**Run 1 — invalid.** Both agents had the repository's git history and simply restored the removed code
(`git checkout <commit>~1 -- …`, `git apply -R`). Neither diagnosed anything, so the run measures
nothing about the skill. Cause: my setup. Both worktrees were deleted.

**Run 2 — history-free export (n = 1 per arm).**

| | Baseline | With `diagnosing-bugs` |
|---|---|---|
| Root cause stated | Partly right: led with "grid gaps were never scaled" | Right: frames scaled per axis while the grid re-centres square cells |
| Reproduced before fixing | Failing test (4 cases) | Measured slot vs icon coordinates first, then a failing test (3 cases) |
| Fix | Heuristic: re-centres *any* non-image object inside the safe zone, scales gaps and padding (25 lines) | Re-fits the named slot frames and key labels to recomputed cells, also scales gaps (39 lines) |
| My independent alignment tests (14 cases, 3 sizes) | pass | pass |
| Full suite and typecheck | pass | pass |
| **Other templates whose output changes after a Format change** (of 74) | **29** | **16** |
| Followed scope instructions | yes | wrote one backup file outside its folder |
| Tool calls / tokens / wall time | 17 / ~106k / 2.5 min | 13 / ~94k / 1.6 min |

For reference, the fix that shipped (written before the evaluation) changes 0 other templates; it
re-snaps only shapes named `Slot n` / `Selected slot` and labels named `Key n` on grid layouts.

**Reading.** With the skill, the agent measured the symptom before theorising, named the mechanism
precisely and produced a narrower fix with fewer calls. Both arms over-reached by scaling grid gaps,
which silently changes unrelated templates, so neither patch would be merged as is. One pair is an
anecdote, not a measurement; it is consistent with the skill's purpose but proves nothing on its own.

## 2. Marketing: `product-marketing` on this repository

- Ran the skill's *auto-draft from codebase* mode. Output: `.agents/product-marketing.md` v1 (README,
  `docs/features.md` and `package.json` as sources). Every unknown — customer quotes, metrics, business
  goal, direct competitors — is marked **TODO** rather than filled in, as the skill asks for verbatim
  customer language it cannot invent.
- Useful: it forced a clear statement of the one-liner, the anti-persona, objections (Windows-only,
  alpha, unsigned build) and "words to avoid" ("AI-generated"), which the other five marketing skills
  now read.
- Limitation: its template is SaaS-shaped (ICP, CPA/ROAS); those sections were left out as not
  applicable.

## 3. Research and creative workflow: new thumbnail templates

Research used the built-in WebSearch (Last30Days was not installed; see
[SKILL-SELECTION.md](SKILL-SELECTION.md)). Evidence vs assumption:

| Signal | Source | Type |
|---|---|---|
| itch.io covers are 630×500 and appear on the homepage, search and profile; screenshots can replace the cover on the game page | [itch page image guide](https://hedgiespresso.itch.io/itch-page-image-templates), community posts | Documented convention |
| A seller's redesigned thumbnail fixed a pack with near-zero views | [itch.io devlog](https://angelodev.itch.io/capkin-platformer-pack/devlog/1100881/why-my-asset-pack-was-getting-zero-views-and-how-i-fixed-it) | Anecdote (n = 1) |
| Show the assets the way they look in an actual game; keep thumbnails simple with a readable title | itch.io forum feedback threads, [Unreal forum guide](https://forums.unrealengine.com/t/a-guide-to-selling-more/93001) | Community advice |
| Card-size thumbnails should carry little text; show all elements across a series of images | [Unity: key image guidance](https://support.unity.com/hc/en-us/articles/210122403-What-makes-a-great-key-image-and-are-there-any-size-restrictions-) | Marketplace guidance |
| Roblox-adjacent icon packs sell UI/currency/item icons (shop and inventory contexts) | [BuiltByBit listings](https://builtbybit.com/resources/vector-icons-pro-premium-roblox-ui.107720/) | Market observation |
| "Text in thumbnails raises CTR up to 30%"; "readable images double CTR" | Forum citing YouTube data; Meta vendor page | **Unverified claims — not used** |

No buyer-demand numbers (sales, CTR) were found for specific thumbnail styles; engagement anecdotes
were not treated as demand.

**Audit of the 71 existing templates:** strong coverage of covers, walls, stickers, rings, catalogs,
clean product shots and demos. Missing: icons shown **in use** (game UI context), **real pixel sizes**,
and modular **bento** compositions. Several existing templates are deliberate variants of one
composition at different sizes; no new recolour-style duplicates were added.

**Implemented (6):** Inventory Mockup, Inventory Cover, Hotbar Banner, Size Ladder, Bento Showcase,
Bento Square. Every label on them (item name, category, pixel size, format, count) is read from the
files.

**QA performed:**

| Check | Result |
|---|---|
| Automated robustness (all 77 templates × 0/3/40/300 icons × 4 themes; long names) | pass |
| New tests (`tests/inUseTemplates.test.ts`, 14): slot frames under every icon at own size, 1080×1080 and 630×500; tooltip facts from files; size-ladder sizes and labels; title wrapping | pass |
| Rendered contact sheets: own look, none, Fantasy, Light studio, Halloween; 0/3/24/40/300 icons; 32/64/128/512 px sources; very long pack name; reformatted to 1080×1080 and 630×500 | reviewed by eye; 4 defects found and fixed (below) |
| Measured text contrast on renders (project's audit method, ≥ 3:1) | pass, except the Fantasy look's gold count tile (2.2:1 fill, readable thanks to its dark outline — the project's own audit accepts outlined text) |
| In the running app: create each template, change Format + Look + icon size live, export at 1× and 2× | all 6 OK, no console errors |
| Full suite / typecheck / production build / Windows packaging | 576 tests pass; clean; build OK; package OK with LICENSE and THIRD_PARTY_NOTICES in the output |

Defects found by QA and fixed before commit: slot frames invisible on light looks; bento titles
over-wrapping or overflowing their tile with long names; few icons hugging the top of the bento grid;
slot frames drifting after a Format change.

## 4. Resource usage

| Item | Cost |
|---|---|
| Repository audit | 2 parallel subagents, ~454k tokens total, ~19 min wall time |
| SkillEvaluator Tier 1 | 14 skills, no API key, a few minutes CPU; one-off virtualenv outside the repo |
| A/B evaluation | Run 1 (invalid): ~183k tokens; run 2: ~200k tokens (two Sonnet agents) |
| Idle context cost added to every session in this repo | 3 short skill descriptions (~100 words); the 6 marketing skills cost nothing until invoked |

## 5. Limitations and what remains unverified

- One A/B pair is anecdotal; differences may be noise. A Tier 3 SkillEvaluator run or several pairs
  would be needed for a real measure.
- Marketing skills other than `product-marketing` were not exercised end to end (no store page URL or
  competitor list was chosen); their value is unmeasured.
- The new templates were checked with synthetic icons; real packs (odd aspect ratios, heavy padding)
  should be tried before a release.
- Thumbnail research found conventions and anecdotes, not conversion data.
