# Integration guide

Everything below is project-scoped and lives in this repository. Nothing was installed globally, no
plugin marketplace was added, and no hooks, MCP servers, permissions or settings were changed.

## What was added

| Path | What |
|---|---|
| `.claude/skills/<name>/` | 9 skills (sources, commits, licences: `.claude/skills/THIRD_PARTY.md`) |
| `.claude/skills/THIRD_PARTY.md` | Attribution and MIT licence texts |
| `.claude/product-marketing.md` | Marketing context read by the marketing skills (v1 draft; TODOs need your answers) |
| `.gitignore` | `.claude/` → `.claude/*` + `!.claude/skills/`: personal Claude settings stay untracked, shared skills are tracked |
| `docs/agent-skills/` | These reports |

The app is unaffected: `scripts/package.mjs` packages only `dist/`, `electron/` and `package.json`.

## Dependencies

None. The skills are Markdown; no npm, pip or system packages were added. SkillEvaluator was used from
a throw-away virtualenv outside the repository and is not a project dependency.

## How to invoke

Claude Code loads project skills from `.claude/skills/` when a session starts in this repository.

| Capability | How |
|---|---|
| Debug a hard problem | Describe the bug; `diagnosing-bugs` triggers on "debug/diagnose/broken/failing/slow", or ask for it by name |
| Test-first change | "Use tdd to …" or `/tdd` |
| Module/interface design | `/codebase-design` (also pulled in by `tdd`) |
| Update marketing context | `/product-marketing` (edits `.claude/product-marketing.md`) |
| Cover / thumbnail / promo image direction | `/image` |
| Store-page or README copy | `/copywriting` |
| Store-page conversion review | `/cro` with the page URL or text |
| Competitor profiles | `/competitor-profiling <names or URLs>` |
| Buyer language from forums/reviews | `/customer-research` |

Marketing skills are manual-only (`disable-model-invocation: true`). To let Claude pick one
automatically, delete that line from its `SKILL.md`.

## Re-running the security check

```bash
uv venv -p 3.13 /tmp/se-venv
```

```bash
VIRTUAL_ENV=/tmp/se-venv uv pip install "git+https://github.com/NVIDIA/SkillEvaluator@affe1acc3d0a24877c5d508d96ac69663a7fd92a"
```

```bash
/tmp/se-venv/bin/skillevaluator tier1 .claude/skills/tdd --no-llm -r json -o /tmp/se-reports/tdd
```

Expect the PII/security false positives listed in [SECURITY-REPORT.md](SECURITY-REPORT.md), plus a
schema warning because `.claude/skills/` is not the tool's "standard location".

## Updating a skill

Copy the folder again from a newer, reviewed commit, diff it, re-apply the documented changes (drop
`evals/` and `agents/openai.yaml`; keep `disable-model-invocation: true` on marketing skills), and
update the commit in `.claude/skills/THIRD_PARTY.md`. Avoid `npx skills@latest` (unpinned, sends
install telemetry).

## Rollback

Each change is its own commit on `chore/agent-skills-optimization`, so `git revert <sha>` undoes any one
of them. By hand:

| Change | Undo |
|---|---|
| All agent skills | `git rm -r .claude/skills` and restore `.claude/` in `.gitignore` |
| One skill | `git rm -r .claude/skills/<name>` and remove its row from `THIRD_PARTY.md` |
| Marketing context | `git rm .claude/product-marketing.md` |
| Reports | `git rm -r docs/agent-skills` |
| New templates | revert the "Add six in-use templates" commit |
| Root reorganisation | revert the "Move CHANGELOG, RELEASING and build_exe.bat" commit (restores paths and links) |

Nothing outside the repository needs rolling back. The scratch clones, virtualenv and reports used for
the audit live in the session's temporary scratch folder only.

## Pending your approval (not done)

- **GitHub About description and topics** — these are repository settings, not files, so they are not
  on any branch: changing them is immediate and public. No tool in this session can edit them; see the
  final summary for the exact values and the one-line `gh` command.
- **Any global install** (e.g. last30days with your API keys, or superpowers as a plugin).
- **SkillEvaluator Tier 2/3** (needs a provider key; Tier 3 also Docker; spends tokens).
