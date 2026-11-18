# Third-party agent skills

The skills in this folder are copied from two MIT-licensed repositories. They are developer tooling
for Claude Code sessions in this repository; they are not part of the app and are never packaged
(`scripts/package.mjs` ships only `dist/`, `electron/` and `package.json`).

| Skills | Source | Commit | License |
|---|---|---|---|
| `diagnosing-bugs`, `tdd`, `codebase-design` | https://github.com/mattpocock/skills | `5863806dd4e15c63174bee4e7515a4256792ecfa` | MIT, © 2026 Matt Pocock |
| `product-marketing`, `image`, `copywriting`, `cro`, `competitor-profiling`, `customer-research` | https://github.com/coreyhaines31/marketingskills | `73573e94a06a39965978b3fa1f9c1eace8cebc7c` | MIT, © 2025 Corey Haines |

**Changes from the originals:** each skill's `evals/` folder and `agents/openai.yaml` (fixtures and
another harness's config) were left out. The six marketing skills have `disable-model-invocation: true`
added to their frontmatter, so they run only when invoked by name (`/image`, `/copywriting`…) and never
trigger on their own during coding work. Nothing else was edited.

Why these and not others, and how they were checked: `docs/agent-skills/`.

## License texts

### mattpocock/skills

```
MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### coreyhaines31/marketingskills

```
MIT License

Copyright (c) 2025 Corey Haines

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
