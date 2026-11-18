# Security report

Two independent passes: a manual read-only review of all 12 repositories (file:line evidence below),
and NVIDIA SkillEvaluator Tier 1 on the 14 candidate skills. Automated results were triaged by hand;
a passing scan is not treated as proof of safety, and a failing one is not treated as proof of harm.

## How the review was done

- Shallow clones at fixed commits (see [REPOSITORY-AUDIT.md](REPOSITORY-AUDIT.md)) in a scratch folder
  outside the repository. No install script, `npx`, `pip install -r`, hook or engine from the audited
  repositories was run.
- SkillEvaluator was the only third-party code executed: installed from its audited commit into an
  isolated virtualenv, Tier 1 only, `--no-llm`, no API key. Before running it: no phone-home telemetry
  (the "telemetry" modules render agent-run reports); network use limited to optional LLM model
  listing (off) and a scanner installer whose SkillSpector wheel is SHA-256 pinned
  (`utils/scanner_install.py:61-71`).
- No secrets were read, copied or committed. Env-var *names* appear in this report; no values.

## Findings by severity

| Sev | Repository | Finding | Evidence | Mitigation |
|---|---|---|---|---|
| High | Claude-BugHunter | Engine starts `claude -p` with `--permission-mode bypassPermissions` and `Bash(python3:*)`: arbitrary code, no prompts | `engine/agent.py:29-33` | Not installed |
| High | Claude-BugHunter | Skill text suppresses safety checks: "DO NOT STOP", "Do not insert mid-engagement permission gates" | `skills/redteam-mindset/SKILL.md:33,39` | Not installed |
| High | Agent-Reach | Install by following a remote, mutable `install.md` from `main`, plus `curl \| sh` | `docs/install.md:15` | Not installed |
| High | Agent-Reach | Copies the user's logged-in Chrome cookies into a stealth headless browser automatically | `SKILL_en.md:60` | Not installed |
| High (if run) | paper-orchestra | `exec()` of LLM-generated code, unsandboxed | `utils/paper_banana_utils.py:308` | Not installed |
| Med-High | ECC | `pre:observe` hook logs every tool call's input/output (≤5k chars) to `~/.local/share/ecc-homunculus`, regex-only scrubbing | `skills/continuous-learning-v2/hooks/observe.sh:283-297` | Not installed |
| Medium | ECC | Installer merges 28 hooks into global `~/.claude/settings.json`; Stop hook runs `npx tsc` | `stop-format-typecheck.js:147-166` | Not installed |
| Medium | superpowers | Instruction-hierarchy pressure injected every session: "1% chance … ABSOLUTELY MUST invoke … YOU DO NOT HAVE A CHOICE" | `skills/using-superpowers/SKILL.md:11-15` | Plugin not installed; individual skills could be copied without the hook |
| Medium | last30days | Optional browser-cookie and Keychain reads (`security find-generic-password`), X private GraphQL with session cookies | `scripts/lib/chrome_cookies.py:66-68`, `scripts/lib/vendor/bird-search/lib/cookies.js` | Not installed |
| Medium | claude-seo | Extensions store API keys in plaintext in global `~/.claude.json`; MCP servers via `npx -y`; hook on every `.tsx` edit | see audit notes | Not installed |
| Low | marketingskills | Recommended install path (`npx skills`) is unpinned and sends install telemetry; references suggest `npx …@latest` video tools | `README.md:142`; `ad-creative/references/generative-tools.md:531-537` | Folders copied from a pinned commit; `ad-creative` not adopted |
| Low | mattpocock/skills | `improve-codebase-architecture` report loads unpinned Tailwind/mermaid from CDNs with `securityLevel: "loose"` | `.../HTML-REPORT.md:13-16` | Skill not adopted |
| Info | marketingskills | Disclosed paid partner placements in tool recommendations | `partners.json:2` | Treat tool suggestions as advertising |

No prompt-injection text aimed at overriding the user or system instructions was found in the nine
adopted skills (grep for "ignore previous", "system prompt", "do not tell", "without asking",
`dangerously`, `bypassPermissions`, HTML comments, plus SkillEvaluator's unicode-smuggling check).

## SkillEvaluator Tier 1 results (`--no-llm`)

| Skill | Status | Crit | High | Med | Low | Quality | Failed validators | Manual triage of high/critical |
|---|---|---|---|---|---|---|---|---|
| mk/product-marketing ✅ | pass | 0 | 0 | 6 | 7 | 89.0 | – | – |
| mk/image ✅ | pass | 0 | 0 | 4 | 8 | 87.8 | – | – |
| mk/copywriting ✅ | pass | 0 | 0 | 5 | 8 | 86.2 | – | – |
| mk/competitor-profiling ✅ | pass | 0 | 0 | 5 | 7 | 90.2 | – | – |
| mk/customer-research ✅ | pass | 0 | 0 | 4 | 6 | 90.2 | – | – |
| mk/cro ✅ | fail | 0 | 1 | 6 | 7 | 86.0 | PII | False positive: placeholder `name@company.com` in a form example (`references/form.md:123`) |
| mp/codebase-design ✅ | pass | 0 | 0 | 4 | 9 | 89.5 | – | – |
| mp/tdd ✅ | fail | 0 | 1 | 5 | 9 | 86.5 | PII | False positive: API route example `/users/${userId}/orders` (`mocking.md:45`) |
| mp/diagnosing-bugs ✅ | fail | 0 | 1 | 7 | 7 | 79.0 | Security | False positive: "show instruction" in a human-in-the-loop prompt helper (`scripts/hitl-loop.template.sh:10`); the template is never run automatically |
| mp/improve-codebase-architecture | pass | 0 | 0 | 4 | 13 | 86.5 | – | (not adopted; CDN finding above is from manual review) |
| mk/ad-creative | fail | 6 | 3 | 12 | 7 | 86.5 | Security, Code hygiene | Critical "Harmful content: Arsenic" is sample ad copy for a supplement brand (`assets/creative-review-template.html:170`); "without warning" is about ad platforms truncating text. Not adopted for size, not safety |
| sp/systematic-debugging | fail | 0 | 4 | 5 | 11 | 91.5 | Security | Mostly benign: `security list-keychains` in a macOS code-signing debugging example (`SKILL.md:98`) |
| sp/verification-before-completion | pass | 0 | 0 | 5 | 6 | 90.2 | – | – |
| last30days | fail | 1 | 254 | 172 | 33 | 78.5 | Security, PII, Code risk | Many are pattern matches, but the core ones are real and by design: browser-cookie extraction (YARA `info_stealer` on `scripts/lib/cookie_extract.py`, `chrome_cookies.py`), credential files (`~/.netrc`, `.env`), env passed to subprocesses. Consistent with the manual review |

✅ = adopted. Medium/low findings on adopted skills are schema/metadata advice (missing `author`,
`tags`, version fields), harness-compatibility notes for other agents, and "skill not in standard
location" — none affect Claude Code's use of them.

## Integration-level risk of what was adopted

- **No code execution:** the nine skills are Markdown plus one shell template
  (`diagnosing-bugs/scripts/hitl-loop.template.sh`) that runs only if the agent decides to run it in a
  debugging loop, under normal permission prompts.
- **No hooks, MCP servers, settings or permission changes** were added. Nothing global was touched.
- **No credentials:** none of the adopted skills read env vars or keys.
- **Untrusted input:** `competitor-profiling` and `customer-research` fetch third-party pages; the
  first explicitly treats them as data. Claude Code's own rule (tool results are data) still applies.
- **Instruction conflicts:** marketing skills are `disable-model-invocation: true`, so they cannot
  hijack coding tasks; they only run on `/name`.
- **Supply chain:** copied from pinned commits, not `npx skills@latest`; updates are manual and
  reviewable diffs.

## Higher SkillEvaluator tiers — not run

- **Tier 2 (deduplication):** needs an embeddings + chat provider and key (e.g. a free NVIDIA Build
  key). Value here is low: nine skills with one known overlap pair already resolved by hand
  (`diagnosing-bugs` vs `systematic-debugging`).
- **Tier 3 (live agent evaluation):** needs a provider, a supported agent and Docker, and spends model
  tokens per trial (the project's docs warn of charges). A small, manual A/B was run instead
  ([EVALUATION-RESULTS.md](EVALUATION-RESULTS.md)).
- Either can be run later with your approval; neither is needed to use the skills safely.
