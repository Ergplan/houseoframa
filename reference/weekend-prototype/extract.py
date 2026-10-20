"""Extract House of Rama build graph from a git repo. Every number comes from git or the files."""
import json, os, re, subprocess, sys

REPO = sys.argv[1]
OUT = sys.argv[2]

def git(*a):
    return subprocess.run(["git", "-C", REPO, *a], capture_output=True, text=True, check=True).stdout

files = git("ls-files").split()

# Layers (floors), bottom -> top
def layer(p):
    if p in ("package.json", "package-lock.json", "tsconfig.json", "next.config.mjs", "vercel.json",
             ".env.example", ".gitignore", "start.command", "proxy.ts") or p.startswith("lib/server/"):
        return "foundation"
    if p in ("lib/data.ts", "lib/history.ts") or p.startswith("public/"):
        return "data"
    if p.startswith("lib/"):
        return "logic"
    if p.startswith("app/api/"):
        return "api"
    if p.startswith("components/"):
        return "interface"
    return "shell"  # app/layout, page, globals.css, README

LAYERS = [
    ("foundation", "Foundation — config, env, deploy"),
    ("data", "Data — vendors, BoQs, benchmarks"),
    ("logic", "Logic — normalisation, 3D, focus, state"),
    ("api", "API — server routes to OpenAI"),
    ("interface", "Interface — React components"),
    ("shell", "Shell & docs — layout, styles, README"),
]

PURPOSE = {
    ".env.example": "Template of the environment variables: OPENAI_API_KEY plus optional password and model overrides.",
    ".gitignore": "Keeps node_modules, .next and .env.local out of git.",
    "README.md": "What the Studio does, how to run it, how to deploy on Vercel, how the voice advisor works.",
    "app/api/health/route.ts": "GET /api/health — reports whether text, web search and voice are configured (never the key).",
    "app/api/llm/route.ts": "POST /api/llm — streams text answers from OpenAI with web search; up to 300 s on Vercel.",
    "app/api/realtime/session/route.ts": "Mints a short-lived Realtime key so the browser can talk to OpenAI over WebRTC.",
    "app/globals.css": "All styling: dark studio theme, isometric site, dock, flash highlights.",
    "app/layout.tsx": "Root HTML layout and metadata.",
    "app/page.tsx": "Home route — renders <Studio/>.",
    "components/AiPanel.tsx": "Typed Q&A panel: sends the asset's context to /api/llm and renders the answer.",
    "components/AssetView.tsx": "One equipment package: BoQ comparison table, normalised totals, tabs for walkthrough, AI and vendor history.",
    "components/Markdown.tsx": "Tiny markdown renderer for AI answers.",
    "components/MasterModal.tsx": "Edit plant assumptions: fuel price, GCV, hours, load, tariff, years.",
    "components/RealTalk.tsx": "AI Proc Advisory — voice session over WebRTC, function calls that move the screen.",
    "components/Studio.tsx": "Top-level screen: isometric site plan, package picker, portfolio totals.",
    "components/VendorHistory.tsx": "Vendor track record: past projects, review scores, trust band.",
    "components/Walkthrough.tsx": "3D wireframe walkthrough UI; every BoQ line is a clickable part.",
    "lib/ai.ts": "Client helper to call /api/llm and turn errors into plain English.",
    "lib/calc.ts": "The formulas: scope-gap fill, capacity normalisation, lifecycle cost, rankings, award context.",
    "lib/data.ts": "The dataset: 6 packages, 18 vendor offers, BoQ rows, benchmarks, intel, parts, tech fit.",
    "lib/focus.ts": "Matches spoken/typed text to assets, rows and figures and flashes them on screen.",
    "lib/history.ts": "Vendor project history and review data, track score and band.",
    "lib/iso.ts": "Draws the factory as an isometric SVG site plan.",
    "lib/server/config.ts": "Server-only config: finds the OpenAI key by several names, model defaults, host detection.",
    "lib/store.tsx": "React context: master assumptions, selected asset, health status, reviews.",
    "lib/walkEngine.ts": "three.js engine: builds each machine from parts, orbit and walk cameras, guided tour order.",
    "next.config.mjs": "Next.js configuration.",
    "package-lock.json": "Locked dependency tree.",
    "package.json": "Project manifest: next 16, react 19, three 0.186.",
    "proxy.ts": "Optional HTTP Basic password gate (STUDIO_PASSWORD) in front of every route.",
    "public/boiler-ref.jpg": "Reference photo of the biomass boiler.",
    "start.command": "Mac double-click launcher: installs, creates .env.local, opens the browser.",
    "tsconfig.json": "TypeScript configuration.",
    "vercel.json": "Vercel deployment settings.",
}

def is_text(p):
    return not re.search(r"\.(jpg|png|ico|jpeg|gif)$", p)

ENV_RE = re.compile(r"process\.env\.([A-Z0-9_]+)|process\.env\[n\]")
IMPORT_RE = re.compile(r"""from\s+['"]((?:@/|\./|\.\./)[^'"]+)['"]""")

def resolve(src, spec):
    if spec.startswith("@/"):
        base = spec[2:]
    else:
        base = os.path.normpath(os.path.join(os.path.dirname(src), spec))
    for cand in (base, base + ".ts", base + ".tsx", base + "/index.ts", base + "/index.tsx"):
        if cand in files:
            return cand
    return None

nodes = []
edges = []
for p in files:
    full = os.path.join(REPO, p)
    text = open(full, encoding="utf-8", errors="replace").read() if is_text(p) else ""
    lines = text.count("\n") + (1 if text and not text.endswith("\n") else 0) if text else 0
    envs = sorted(set(m for m in ENV_RE.findall(text) if m))
    if "KEY_NAMES" in text and p.endswith("config.ts"):
        envs = sorted(set(envs) | {"OPENAI_API_KEY", "OPENAI_API_KEY1", "OPENAI_KEY", "OPENAI_SECRET_KEY"})
    exports = len(re.findall(r"^export\s", text, re.M))
    for spec in IMPORT_RE.findall(text):
        tgt = resolve(p, spec)
        if tgt and tgt != p:
            edges.append([p, tgt])
    nodes.append({
        "path": p, "layer": layer(p), "lines": lines, "env": envs, "exports": exports,
        "purpose": PURPOSE.get(p, ""), "binary": not is_text(p),
        "test": bool(re.search(r"(\.test\.|\.spec\.|__tests__/)", p)),
    })

# dedupe edges
seen = set(); E = []
for a, b in edges:
    if (a, b) not in seen:
        seen.add((a, b)); E.append([a, b])

# commits oldest -> newest with per-file stats
raw = git("log", "--reverse", "--format=@@%H|%h|%aI|%an|%s", "--numstat")
commits = []; cur = None
for line in raw.splitlines():
    if line.startswith("@@"):
        H, h, date, an, s = line[2:].split("|", 4)
        cur = {"sha": H, "short": h, "date": date, "author": an, "subject": s, "changes": []}
        commits.append(cur)
    elif line.strip() and cur is not None:
        a, d, p = line.split("\t")
        cur["changes"].append({"path": p, "add": None if a == "-" else int(a), "del": None if d == "-" else int(d)})
status = git("log", "--reverse", "--format=@@%h", "--name-status")
st = {}; cur = None
for line in status.splitlines():
    if line.startswith("@@"): cur = line[2:]
    elif line.strip():
        parts = line.split("\t"); st[(cur, parts[-1])] = parts[0][0]
for c in commits:
    for ch in c["changes"]:
        ch["kind"] = st.get((c["short"], ch["path"]), "M")

branches = [b.strip().replace("origin/", "") for b in git("branch", "-r").splitlines() if "->" not in b]
authors = sorted(set(c["author"] for c in commits))
deps = json.load(open(os.path.join(REPO, "package.json")))

graph = {
    "project": "Procurement Studio",
    "repo": "Ergplan/procurementstudio",
    "extracted": "2026-10-17",
    "layers": [{"id": i, "label": l} for i, l in LAYERS],
    "nodes": nodes, "edges": E, "commits": commits, "branches": branches, "authors": authors,
    "deps": deps.get("dependencies", {}),
    "facts": {
        "files": len(nodes), "text_lines": sum(n["lines"] for n in nodes),
        "tests": sum(1 for n in nodes if n["test"]), "commits": len(commits),
        "branches": len(branches), "authors": len(authors),
        "env_vars": sorted(set(v for n in nodes for v in n["env"])),
        "imports": len(E),
        "first_commit": commits[0]["date"], "last_commit": commits[-1]["date"],
    },
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(graph, open(OUT, "w"), indent=1)
print(json.dumps(graph["facts"], indent=1))
print(len(E), "edges;", [ (n["path"], n["env"]) for n in nodes if n["env"]])
