# House of Rama

**Built on trust.** Agent-built software your whole company can watch, question and sign off.

A repository is rendered as a building: files are bricks, layers are floors, builders are cranes. Every figure on every screen traces to its formula, its inputs, the commits that built it and the person who signed it off. Nothing merges unsigned. An auditor from a different model vendor flies the site and signs its own report.

## How this repo is built

The build is driven by `docs/MASTER-PROMPT.md`, one stage per Claude Code session. `CLAUDE.md` holds the rules every session reads. After the first session the whole interface is one line:

```
Run Stage N of docs/MASTER-PROMPT.md
```

Stage reports land in `docs/reports/`. The weekend prototype this grew from is in `reference/weekend-prototype/` (open `house-of-rama.html`).

## Before Stage 0

1. Clone the two target repositories (read-only): `git clone <ekbill url> reference/ekbill` and `git clone https://github.com/Ergplan/procurementstudio reference/procurementstudio`.
2. `cp .env.example .env` and fill it in. `BUILDER_VENDOR` and `AUDITOR_VENDOR` must differ.
3. `docker compose up -d db`.
4. In the repo: `tmux new -s build`, then `claude`, then `Run Stage 0 of docs/MASTER-PROMPT.md`.

House of Rama is an Aayuda product.
