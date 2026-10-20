# reference/ — read-only inputs

Nothing here is imported at runtime. Copy with the origin noted in a comment.

- `weekend-prototype/` — the House of Rama prototype built on 17 Oct 2026 over the Procurement Studio repo (Ergplan/procurementstudio @ fac615d). `house-of-rama.html` is the working single page (open it in a browser). `extract.py` is the graph extractor Stage 1 ports to TypeScript; `graph.json` is its output and the source of the golden numbers in MASTER-PROMPT §7.1. `discovery.js`, `traces.js`, `audit.js`, `english.js` are the reconstructed discovery session, the hand-written figure trails, the scripted audit and the English glossary — the behaviour Stages 2–5 generate instead of hand-writing. `shots/` are the real Procurement Studio screens captured from its built app.
- `ekbill-ease-of-use-2026-10-18.html` — the click-every-button walkthrough of EkBill at commit e2082a4: 2,076 controls, 6 roles, 14 tasks. Its data block (`const DATA`) feeds Stage 3's `.rama/screens.json` for EkBill.
- `ekbill/` — clone the EkBill repository here before Stage 1 (`git clone <ekbill url> reference/ekbill`). Read-only.
- `procurementstudio/` — `git clone https://github.com/Ergplan/procurementstudio reference/procurementstudio`. Read-only.
