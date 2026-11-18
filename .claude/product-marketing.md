# Product Marketing Context

**Document version:** v1
**Last updated:** 2026-11-18

> Auto-drafted by the `product-marketing` skill from the README, `docs/` and `package.json`. Lines
> marked **TODO** are unknown and need the maintainer's answer; nothing here is a measured result.
> Read by the other marketing skills in `.claude/skills/` (`/image`, `/copywriting`, `/cro`,
> `/competitor-profiling`, `/customer-research`).

## Product Overview
**One-liner:** Offline desktop app that turns a folder of game icons into store-ready marketplace images.
**What it does:** Import transparent PNG/WebP icons; it builds itch.io covers, wide thumbnails, social
posts, banners, free-demo covers, catalogs and game UI mockups from 77 templates and 35 layouts, then
exports them at 1×–4×. Everything is editable and nothing leaves the computer.
**Product category:** Marketplace-graphics tool for game asset creators (sits between a design tool and a template pack).
**Product type:** Windows desktop app (Electron), offline, no account.
**Business model:** Free, MIT-licensed, distributed as a portable ZIP on GitHub Releases. **TODO:** is a paid edition, donation or bundle planned?

## Target Audience
**Target companies:** Solo artists and small studios selling icon / item / UI packs (itch.io, also Gumroad, Unity Asset Store, Roblox-adjacent stores).
**Decision-makers:** The artist themself.
**Primary use case:** Making the cover, thumbnails and preview images for a new or updated pack.
**Jobs to be done:**
- Show buyers what is in the pack, at a size they can judge, without hand-arranging hundreds of icons.
- Produce every image a store page needs (cover, screenshots, catalog, social, demo) in one consistent look.
- Redo all of it quickly when the pack grows.
**Use cases:**
- New pack launch; free-demo listing next to a paid pack; catalog sheet of every icon; social posts for an update.

## Personas
| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Icon/pixel artist selling on itch.io | Sales, looking professional | Hates layout work; Photoshop templates break when icon count changes | Store images in minutes that adapt to any pack size |
| Small studio shipping several packs | Consistency across listings | Every pack needs the same 6–10 images | Saved templates, themes and batch export |
| Roblox / UI-kit creator | Showing icons in a game context | Generic mockups don't look like a game | Inventory, hotbar and size-ladder mockups |

## Problems & Pain Points
**Core problem:** Good icon packs sell poorly with weak covers; making strong covers by hand is slow and has to be redone for every pack and update.
**Why alternatives fall short:**
- Design tools (Photoshop, Figma, Canva): manual placement of every icon; nothing understands transparent padding or icon counts.
- Downloadable cover templates (e.g. itch page image template packs): fixed slots, one size, no catalog.
- AI thumbnail makers: online, subscription, and they redraw or misrepresent the actual assets.
**What it costs them:** Hours per pack; covers that under-sell the work.
**Emotional tension:** "My art is good but my store page looks amateur."

## Competitive Landscape
**Direct:** none confirmed — **TODO:** run `/competitor-profiling` for dedicated asset-pack cover tools.
**Secondary:** Itch page image template packs and RPG Maker box-art templates — fixed layouts, manual fill.
**Indirect:** Photoshop / Figma / Canva; AI thumbnail generators (online, paid, not asset-faithful); hiring a freelancer (Fiverr thumbnail gigs).

## Differentiation
**Key differentiators:**
- Lays out by each icon's *visible* pixels, so mixed sizes and padding still look even.
- Templates fill themselves from the pack and adapt from 3 to hundreds of icons.
- Facts on the images (count, sizes, formats, names) are read from the files, never invented.
- Offline and private: no account, no uploads, no telemetry.
**How we do it differently:** A purpose-built layout engine plus templates, instead of a general canvas.
**Why that's better:** Minutes instead of hours, and redoing it after an update is one click.
**Why customers choose us:** **TODO** (no customer evidence yet).

## Objections
| Objection | Response |
|-----------|----------|
| "Windows only?" | Yes, for now; it is the only tested platform. |
| "Alpha software — will I lose work?" | Autosave plus `.showcase` backups; projects stay in a local folder. |
| "Unsigned exe / SmartScreen warning" | Expected for unsigned builds; download only from the GitHub Releases page. |
| "Will it look generic?" | 59 themes, own-colour themes, full editor underneath. |

**Anti-persona:** People who need print layouts, 3D renders, or a web-based team tool.

## Switching Dynamics
**Push:** Rebuilding covers by hand for every pack/update.
**Pull:** A whole store set from one folder, offline.
**Habit:** Existing Photoshop/Figma template files.
**Anxiety:** Alpha status, unsigned build, learning a new tool.

## Customer Language
**How they describe the problem:** **TODO** — collect verbatim quotes (itch.io forum threads on asset-pack covers, reviews) with `/customer-research`.
**How they describe us:** **TODO**
**Words to use:** store-ready, cover, thumbnail, catalog, pack, game-ready, offline.
**Words to avoid:** "AI-generated" (it isn't), claims of sales uplift without data.
**Glossary:**
| Term | Meaning |
|------|---------|
| Store set | Hero, cover, catalog and category pages built together |
| Look / theme | Background plus title, subtitle and badge style |

## Brand Voice
| Attribute | Means | Doesn't mean | Example line |
|-----------|-------|--------------|--------------|
| Plain | Short, concrete sentences | Jargon or hype | "Drop in your PNGs and get store images." |
| Honest | Real facts, alpha status stated | Overpromising | "Usable day to day, but expect rough edges." |
| Craft-respecting | Your icons stay exactly as drawn | Redrawing or "enhancing" art | "Rendered fresh from your original files." |

**Tone by context:**
- Support: calm, step-by-step.
- Launch: concrete feature list with images.
- Errors: what happened and what to do next.
- Sales: n/a (free).
- Social: show a before/after of a real pack.
**Terms we own:** store set, visible-pixel layout.
**Never use (and why):** "AI" for features that aren't AI (misleading).

## Proof Points
**Metrics:** None measured. **TODO**
**Customers:** **TODO**
**Testimonials:** none yet.
**Value themes:**
| Theme | Proof |
|-------|-------|
| Fast | 77 templates, one-click store set (feature, not a measured time) |
| Faithful | Layout by visible pixels; facts read from files |
| Private | Offline, no telemetry (README) |

## Goals
**Business goal:** **TODO** (adoption? reputation? future paid product?)
**Conversion action:** Download the release ZIP / star the repository.
**Current metrics:** **TODO**

## Learnings
*Decisions and tested lessons. Newest first. Keep it to about 20 active entries.*
| Date | Learning | Evidence | Applies to | Status |
|------|----------|----------|------------|--------|
| 2026-11-18 | Buyers want to see assets in use, not only on a plain grid | Community advice in itch.io/Unreal forum threads, anecdotal, not tested | Templates, store copy | watch |

## Changelog
*Newest first. One line per revision: what changed and why.*
- v1 (2026-11-18) — Initial context, auto-drafted from the repository; open questions marked TODO.
