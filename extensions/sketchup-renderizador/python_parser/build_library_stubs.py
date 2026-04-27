"""Build SKP library stubs from Training/ DWGs.

Scans:
  - Training/All/Todo_Mob.dwg  (2D catalog: pairs Planta+Alzado for W×D×H)
  - Training/cad*.dwg          (project files: harvests INSERTs by bbox)

Produces:
  - <out_dir>/<Family>/<safe_name>_WxDxHmm.skp   (copies --template if given,
                                                  else writes empty .skp.todo
                                                  marker so user can swap in
                                                  a template by hand)
  - <out_dir>/manifest.csv     (name, W, D, H, family, source, suggested_path)

Naming dedup: same base_name + same WxDxH = single stub. Different dims of
same name keep separate stubs (different drawer sizes etc).

Usage:
  python build_library_stubs.py --out ../library_stubs [--template path/to/empty.skp]
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

import ezdxf
from ezdxf.addons import odafc

from parser.dxf_reader import _ensure_oda_discovered, _blocks_bbox

PLANTA_RE = re.compile(r"\s+planta(\s+att)?\s*$", re.IGNORECASE)
ALZADO_RE = re.compile(r"\s+alzado(\s+att)?\s*$", re.IGNORECASE)

ANON_PREFIXES = ("*", "$AUDIT", "A$C")
MIN_MM = 50
MAX_MM = 6000

# Order matters: most specific keyword first, generic last.
# Substring match against (name + " " + layer_hint).lower(). First hit wins.
FAMILY_KEYWORDS = [
    # Specific product families
    ("mostrador",   "Mostradores"),
    ("calaixera",   "Calaixeras"),
    ("cajonera",    "Calaixeras"),
    ("buc ",        "Calaixeras"),
    ("buc info",    "Calaixeras"),
    ("cajetín",     "Cartelas"),
    ("cajetin",     "Cartelas"),
    ("carátula",    "Cartelas"),
    ("caratula",    "Cartelas"),
    ("cartela",     "Cartelas"),
    ("catela",      "Cartelas"),
    ("escaparate",  "Escaparates"),
    ("escaparat",   "Escaparates"),
    ("vitrina",     "Vitrinas"),
    ("expos",       "Expositores"),
    ("góndola",     "Gondolas"),
    ("gondola",     "Gondolas"),
    ("gónola",      "Gondolas"),
    ("visio",       "Modulos"),  # Visio = módulo (con o sin poste).
                                 # canonical_name mapea SDT/Sólo poste/Visio
                                 # Poste/Progresivo → "visio solo poste 800/990".
                                 # "Góndola Visio…" hits "góndola" arriba.
    ("rack",        "Racks"),
    ("perchero",    "Percheros"),
    ("penjador",    "Percheros"),
    ("colgador",    "Percheros"),
    ("percha",      "Percheros"),
    ("poste",       "Postes"),
    ("cruceta",     "Modulos"),
    ("lite",        "Modulos"),
    ("dado",        "Modulos"),
    ("qubo",        "Modulos"),   # canonical: kubo→qubo
    ("kubic",       "Modulos"),   # canonical: cubik→kubic
    ("modul",       "Modulos"),
    ("módul",       "Modulos"),
    ("forro",       "Forros"),
    ("tapa",        "Forros"),
    ("pasacable",   "Forros"),
    ("pasa-cable",  "Forros"),
    ("prestatge",   "Estanterias"),
    ("prestages",   "Estanterias"),
    ("estanter",    "Estanterias"),
    ("estant",      "Estanterias"),
    ("trasera",     "Trasera"),
    ("hombre",      "Maniquies"),
    ("mujer",       "Maniquies"),
    ("maniqui",     "Maniquies"),
    ("maniquí",     "Maniquies"),
    ("imac",        "Tecnologia"),
    ("monitor",     "Tecnologia"),
    ("pantalla",    "Tecnologia"),
    ("teclat",      "Tecnologia"),
    ("teclado",     "Tecnologia"),
    ("ratoli",      "Tecnologia"),
    ("ordenador",   "Tecnologia"),
    ("báscula",     "Basculas"),
    ("bàscula",     "Basculas"),
    ("bascula",     "Basculas"),
    ("est.almacen", "Estanterias"),
    ("almacen",     "Estanterias"),
    ("almacén",     "Estanterias"),
    ("most ",       "Mostradores"),
    ("most.",       "Mostradores"),
    ("most boble",  "Mostradores"),
    ("camilla",     "Camillas"),
    ("lavabo",      "Sanitaris"),
    ("inodoro",     "Sanitaris"),
    ("ducha",       "Sanitaris"),
    ("sanit",       "Sanitaris"),
    ("robot",       "Robots"),
    ("salida_robot","Robots"),
    ("flecha",      "Senalizacion"),
    ("graella",     "Senalizacion"),
    ("totem",       "Senalizacion"),
    ("tótem",       "Senalizacion"),
    ("costado",     "Costados"),
    ("ferreteria",  "Ferreteria"),
    ("ferretería",  "Ferreteria"),
    ("caixat",      "Caixatis"),
    ("caja",        "Cajas"),
    # Generic furniture
    ("puerta",      "Portes"),
    ("porta",       "Portes"),
    ("ventana",     "Finestres"),
    ("finestra",    "Finestres"),
    ("silla",       "Sillas"),
    ("cadira",      "Sillas"),
    ("butaqueta",   "Butaquetas"),
    ("butaca",      "Butaquetas"),
    ("sofa",        "Sofas"),
    ("sofá",        "Sofas"),
    ("mesa",        "Mesas"),
    ("taula",       "Mesas"),
    ("peana",       "Peanas"),
    ("lampara",     "Iluminacion"),
    ("lámpara",     "Iluminacion"),
    ("luminaria",   "Iluminacion"),
    ("mueble",      "Muebles"),
    ("mobil",       "Muebles"),
]


def family_for(name: str, layer_hint: str = "") -> str:
    text = canonical_name(name + " " + layer_hint)
    for kw, fam in FAMILY_KEYWORDS:
        if kw in text:
            return fam
    return "Sin_clasificar"


# Product line / system keywords, scanned within name. First match wins.
# Subfolder under family. Empty result → "Generico" subfolder.
PRODUCT_LINE_KEYWORDS = [
    ("visio",        "Visio"),
    ("qubo",         "Qubo"),    # canonical_name maps kubo→qubo
    ("kubic",        "Kubic"),   # canonical_name maps cubik→kubic
    ("dado",         "Dado"),
    ("caixat",       "Caixati"),
    ("curve",        "Curve"),
    ("kobalt",       "Kobalt"),
    ("progresiv",    "Progresivo"),
    ("poste visto",  "PosteVisto"),
    ("rubik",        "Rubik"),
    ("marble",       "Marble"),
    ("lite",         "Lite"),
    ("dinàmic",      "Dinamic"),
    ("dinamic",      "Dinamic"),
    ("dinámic",      "Dinamic"),
    ("icas",         "Icas"),
    ("sdt",          "SDT"),
    ("tx2",          "TX2"),
    ("marc l",       "MarcL"),
    ("marc u",       "MarcU"),
    ("go kubo",      "Go"),
    ("góndola",      "Gondola"),
    ("gondola",      "Gondola"),
    ("prestatge",    "Prestatge"),
    ("mostrador",    "Mostrador"),
    ("expositor",    "Expositor"),
    ("vitrina",      "Vitrina"),
    ("rack",         "Rack"),
    ("cabezal",      "Cabezal"),
    ("cabecera",     "Cabecera"),
    ("isla",         "Isla"),
    ("totem",        "Totem"),
    ("tótem",        "Totem"),
    ("slat",         "Slatwall"),
    ("panel",        "Panel"),
    ("barra",        "Barra"),
    ("perchero",     "Perchero"),
    ("penjador",     "Perchero"),
    ("colgador",     "Colgador"),
]


def product_line_for(name: str) -> str:
    text = canonical_name(name)
    for kw, line in PRODUCT_LINE_KEYWORDS:
        if kw in text:
            return line
    return "Generico"


def is_anonymous(name: str) -> bool:
    return any(name.startswith(p) for p in ANON_PREFIXES)


def safe_filename(name: str) -> str:
    name = re.sub(r"[\\/:*?\"<>|]", "_", name).strip()
    name = re.sub(r"\s+", " ", name)
    return name[:100] or "unnamed"


def slugify(name: str) -> str:
    """ASCII lowercase snake_case slug. Stable across renames so the importer
    can resolve an alias to the same file regardless of original spelling."""
    n = canonical_name(name)
    n = unicodedata.normalize("NFKD", n).encode("ascii", "ignore").decode("ascii")
    n = re.sub(r"[^a-z0-9]+", "_", n.lower()).strip("_")
    return n[:80] or "unnamed"


def base_name(name: str) -> str:
    n = PLANTA_RE.sub("", name)
    n = ALZADO_RE.sub("", n)
    return n.strip()


def has_planta(name: str) -> bool:
    return PLANTA_RE.search(name) is not None


def has_alzado(name: str) -> bool:
    return ALZADO_RE.search(name) is not None


def load_doc(path: Path):
    if path.suffix.lower() == ".dwg":
        return odafc.readfile(str(path))
    return ezdxf.readfile(str(path))


def harvest_todo_mob(path: Path) -> list[dict]:
    """Pair Planta+Alzado per base_name; emit one entry per piece."""
    doc = load_doc(path)
    bboxes = _blocks_bbox(doc)
    planta_bb: dict[str, tuple] = {}
    alzado_bb: dict[str, tuple] = {}
    standalone: dict[str, tuple] = {}

    for name, bb in bboxes.items():
        if is_anonymous(name):
            continue
        base = base_name(name)
        if has_planta(name):
            planta_bb[base] = bb
        elif has_alzado(name):
            alzado_bb[base] = bb
        else:
            standalone[base] = bb

    out: list[dict] = []
    bases = set(planta_bb) | set(alzado_bb) | set(standalone)
    for base in sorted(bases):
        p = planta_bb.get(base)
        a = alzado_bb.get(base)
        s = standalone.get(base)
        if p and a:
            w = max(abs(p[0]), abs(a[0]))
            d = abs(p[1])
            h = abs(a[1])
        elif p:
            w = abs(p[0]); d = abs(p[1]); h = 0
        elif a:
            w = abs(a[0]); d = 0; h = abs(a[1])
        else:
            w = abs(s[0]); d = abs(s[1]); h = abs(s[2])
        if w < MIN_MM and d < MIN_MM and h < MIN_MM:
            continue
        if w > MAX_MM or d > MAX_MM or h > MAX_MM:
            continue
        out.append({
            "name": base,
            "W": int(round(w)),
            "D": int(round(d)),
            "H": int(round(h)),
            "source": path.name,
            "completeness": "PD" + ("H" if h else "") if (p or a) else "STD",
        })
    return out


def harvest_project_dwg(path: Path) -> list[dict]:
    """Project DWG: emit one entry per named block definition with sensible
    bbox. Includes both inserted and defined-but-unused blocks (catalog
    library entries embedded in the project file)."""
    doc = load_doc(path)
    bboxes = _blocks_bbox(doc)
    msp = doc.modelspace()
    used = set()
    for e in msp:
        if e.dxftype() == "INSERT":
            used.add(e.dxf.name)

    out: list[dict] = []
    for name, bb in bboxes.items():
        if is_anonymous(name):
            continue
        w, d, h = abs(bb[0]), abs(bb[1]), abs(bb[2])
        if w < MIN_MM and d < MIN_MM:
            continue
        if w > MAX_MM or d > MAX_MM or (h and h > MAX_MM):
            continue
        out.append({
            "name": name,
            "W": int(round(w)),
            "D": int(round(d)),
            "H": int(round(h)) if h else 0,
            "source": path.name,
            "completeness": "INS" if name in used else "DEF",
        })
    return out


# Spelling variants the studio uses interchangeably. Normalise to a canonical
# token so dedup + product-line classification treat them as one piece.
# Order: longer/more-specific patterns first.
NAME_VARIANTS = [
    # Visio sub-lines — each preserves its sub-line so they don't collapse
    # together. Order: most-specific first. Greedy `.*` consumes trailing
    # descriptors so e.g. all spellings of "Planta sólo poste 30x30 990 ...
    # de vidre" map to the exact same canonical "visio solo poste 990".

    # Sólo poste 30x30 (the bare post variant) + SDT angle racks (curved
    # corner variants of the same bare post). Greedy `.*` swallows trailing
    # descriptors ("prestatge de vidre", "6 prestatges vidre", etc.) so the
    # canonical key is exactly "visio solo poste {size}".
    (re.compile(r".*\bh\s*3000\s*990\s*sdt\s*sz.*", re.IGNORECASE),
     "visio solo poste 990"),
    (re.compile(r".*\b(planta|alzado)\s+s[óo]lo\s+poste\s+(?:30x30\s+)?(\d+|especial).*", re.IGNORECASE),
     lambda m: f"visio solo poste {m.group(2)}"),
    (re.compile(r".*\bvisio\s+poste\s+visto\s+ancho\s+(\d+).*", re.IGNORECASE),
     lambda m: f"visio poste visto {m.group(1)}"),
    (re.compile(r".*\bvisio\s+progresivo\s+ancho\s+(\d+).*", re.IGNORECASE),
     lambda m: f"visio progresivo {m.group(1)}"),
    (re.compile(r".*\bg[óo]ndola\s+visio\s+(\d)\s+m[óo]dulos?\s+a\s+(\d)\s+caras?\s+ancho\s+(\d+).*", re.IGNORECASE),
     lambda m: f"gondola visio {m.group(1)}mod {m.group(2)}cara {m.group(3)}"),
    (re.compile(r"\bcubik\b", re.IGNORECASE),  "kubic"),
    (re.compile(r"\bk[uú]bic\b", re.IGNORECASE), "kubic"),
    (re.compile(r"\bk[uú]bo\b", re.IGNORECASE),  "qubo"),
    (re.compile(r"\bq[uú]bo\b", re.IGNORECASE),  "qubo"),
    (re.compile(r"\bgóndola\b", re.IGNORECASE),  "gondola"),
    (re.compile(r"\bg[óo]nola\b", re.IGNORECASE), "gondola"),
    (re.compile(r"\bcaixat[íi]\b", re.IGNORECASE), "caixati"),
    (re.compile(r"\bcalaix\w*\b", re.IGNORECASE), "calaixera"),
    (re.compile(r"\bdin[àáa]mic[ao]?\b", re.IGNORECASE), "dinamic"),
    (re.compile(r"\bb[àa]scula\b", re.IGNORECASE), "bascula"),
    (re.compile(r"\bprestat?ges?\b", re.IGNORECASE), "prestatge"),
    (re.compile(r"\bicas\b", re.IGNORECASE), "icas"),
]


def canonical_name(name: str) -> str:
    """Lowercase + spelling-normalised form for dedup keying. `repl` may be
    a string (literal substitution) or a callable (regex match → string)."""
    n = name.lower()
    for rx, repl in NAME_VARIANTS:
        if callable(repl):
            n = rx.sub(repl, n)
        else:
            n = rx.sub(repl, n)
    n = re.sub(r"\s+", " ", n).strip()
    return n


def dedupe(entries: list[dict]) -> list[dict]:
    """Key = (canonical_name, W, D, H). First-wins."""
    seen: dict[tuple, dict] = {}
    for e in entries:
        key = (canonical_name(e["name"]), e["W"], e["D"], e["H"])
        if key not in seen:
            seen[key] = e
    return list(seen.values())


_TIMESTAMP_RE = re.compile(r"^(pm)?\d{8,}\s*\d*$", re.IGNORECASE)
_GIBBERISH_RE = re.compile(r"^[a-z]{4,}\d*$|^[A-Z0-9]{6,}$", re.IGNORECASE)


def _name_quality(name: str) -> int:
    """Higher = better. Used to pick winner per dupe group."""
    n = name.strip()
    if _TIMESTAMP_RE.match(n):
        return 0
    if _GIBBERISH_RE.match(n) and not any(c.isspace() for c in n):
        return 1
    if " " in n or "_" in n:
        return 4   # multi-word descriptive
    return 2


_COMPLETENESS_RANK = {"PD": 4, "INS": 3, "STD": 2, "DEF": 1}


def collapse_by_footprint(entries: list[dict]) -> tuple[list[dict], list[tuple]]:
    """Collapse entries with identical sorted footprint + H bucket (±100mm).
    Pick winner by (completeness rank, name quality, name length desc).
    Returns (kept, dropped_pairs) where dropped_pairs = [(winner_name, dropped)]."""
    # Two-stage collapse:
    # 1. canonical_name + footprint bucket (±50mm) — merges naming variants
    #    of the same piece (SDT angles, Visio Poste / Sólo Poste synonyms).
    # 2. exact sorted-footprint + H bucket — merges pieces with different
    #    names but identical dims (timestamp PM IDs vs human names).
    # Stage 1 keys by canonical_name only — same canonical = same piece
    # regardless of dim bucket. Alzado (3324mm tall) collapses into Planta of
    # the same piece; SDT angle variants (different curve depth) collapse into
    # the bare poste 990. Width/height variants are kept distinct because
    # canonical encodes the size (e.g. "visio solo poste 990" vs "...800").
    by_canon: dict[str, list[dict]] = defaultdict(list)
    for e in entries:
        by_canon[canonical_name(e["name"])].append(e)

    stage1: list[dict] = []
    stage1_dropped: list[tuple] = []
    for members in by_canon.values():
        if len(members) == 1:
            stage1.append(members[0]); continue
        ranked = sorted(members, key=lambda e: (
            -1 if "planta" in e["name"].lower() else 0,
             1 if "alzado" in e["name"].lower() else 0,
            -_name_quality(e["name"]),
            -_COMPLETENESS_RANK.get(e["completeness"], 0),
            -len(e["name"]),
        ))
        # Merge H from any alzado into the planta winner so the kept stub
        # carries both footprint (planta) and height (alzado).
        winner = ranked[0]
        if winner["H"] == 0:
            for m in ranked[1:]:
                if m["H"] > 0:
                    winner = {**winner, "H": m["H"]}
                    break
        stage1.append(winner)
        for d in ranked[1:]:
            stage1_dropped.append((winner["name"], d))

    groups: dict[tuple, list[dict]] = defaultdict(list)
    for e in stage1:
        wd = tuple(sorted((e["W"], e["D"])))
        h_bucket = (e["H"] // 100) * 100
        groups[(wd[0], wd[1], h_bucket)].append(e)

    kept: list[dict] = []
    dropped: list[tuple] = list(stage1_dropped)
    for members in groups.values():
        if len(members) == 1:
            kept.append(members[0]); continue
        # Split into descriptive (multi-word) vs noisy (timestamp PM IDs,
        # gibberish). Keep ALL descriptive entries — same footprint with
        # different descriptive names = distinct pieces (Visio Poste Visto vs
        # Visio Progresivo). Collapse all noisy ones into the best descriptive
        # winner if present, otherwise into one noisy winner.
        descriptive = [e for e in members if _name_quality(e["name"]) >= 2]
        noisy       = [e for e in members if _name_quality(e["name"]) < 2]
        if descriptive:
            kept.extend(descriptive)
            best_desc = sorted(descriptive, key=lambda e: (
                -_COMPLETENESS_RANK.get(e["completeness"], 0),
                -len(e["name"]),
            ))[0]
            for n in noisy:
                dropped.append((best_desc["name"], n))
        else:
            ranked = sorted(noisy, key=lambda e: (
                -_COMPLETENESS_RANK.get(e["completeness"], 0),
                -len(e["name"]),
            ))
            kept.append(ranked[0])
            for n in ranked[1:]:
                dropped.append((ranked[0]["name"], n))
    return kept, dropped


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--training", type=Path, default=Path("../Training"))
    ap.add_argument("--out", type=Path, required=True,
                    help="output folder for stubs + manifest")
    ap.add_argument("--template", type=Path, default=None,
                    help="optional .skp template file to duplicate per stub. "
                         "If omitted, writes empty .skp.todo placeholders.")
    ap.add_argument("--clean", action="store_true",
                    help="delete --out before writing (DESTRUCTIVE — wipes "
                         "all modeled .skp files)")
    ap.add_argument("--add-only", action="store_true",
                    help="only write stubs that don't already exist; never "
                         "overwrite modeled files. Always rewrites manifest "
                         "and aliases.json.")
    args = ap.parse_args()

    if not args.training.is_dir():
        print(f"error: training folder missing: {args.training}", file=sys.stderr)
        return 2

    _ensure_oda_discovered(ezdxf, odafc)

    if args.out.exists() and args.clean:
        shutil.rmtree(args.out)
    args.out.mkdir(parents=True, exist_ok=True)

    all_entries: list[dict] = []
    todo_mob = args.training / "All" / "Todo_Mob.dwg"
    if todo_mob.is_file():
        print(f"[scan] {todo_mob.name}")
        all_entries.extend(harvest_todo_mob(todo_mob))

    for dwg in sorted(args.training.glob("*.dwg")):
        print(f"[scan] {dwg.name}")
        try:
            all_entries.extend(harvest_project_dwg(dwg))
        except Exception as exc:
            print(f"  skip ({exc})")

    print(f"[total raw entries] {len(all_entries)}")
    deduped = dedupe(all_entries)
    print(f"[unique by name+dims] {len(deduped)}")
    deduped, dropped = collapse_by_footprint(deduped)
    print(f"[after footprint collapse] {len(deduped)} kept, {len(dropped)} dropped")

    template_bytes = None
    if args.template:
        if not args.template.is_file():
            print(f"error: template not found: {args.template}", file=sys.stderr)
            return 2
        template_bytes = args.template.read_bytes()
        print(f"[template] {args.template.name} ({len(template_bytes)} bytes)")

    manifest_path = args.out / "manifest.csv"
    aliases_path = args.out / "aliases.json"
    aliases: dict[str, str] = {}
    canon_to_path: dict[str, Path] = {}
    with manifest_path.open("w", newline="", encoding="utf-8") as fp:
        w = csv.writer(fp)
        w.writerow(["canonical_slug", "display_name", "W_mm", "D_mm", "H_mm",
                    "family", "product_line", "source", "completeness", "path"])
        per_family: dict[str, int] = defaultdict(int)
        per_line: dict[tuple[str, str], int] = defaultdict(int)
        for e in sorted(deduped, key=lambda x: (x["name"].lower(), x["W"], x["D"])):
            fam = family_for(e["name"])
            line = product_line_for(e["name"])
            stub_dir = args.out / fam / line
            stub_dir.mkdir(parents=True, exist_ok=True)
            slug = slugify(e["name"])
            dims = f"{e['W']}x{e['D']}x{e['H']}mm"
            fname = f"{slug}_{dims}"
            ext = ".skp" if template_bytes else ".skp.todo"
            stub = stub_dir / f"{fname}{ext}"
            counter = 1
            while stub.exists() and canon_to_path.get(slug) != stub:
                stub = stub_dir / f"{fname}__{counter}{ext}"
                counter += 1
            if args.add_only and stub.exists():
                pass  # leave modeled file untouched
            elif template_bytes:
                stub.write_bytes(template_bytes)
            else:
                stub.write_text(
                    f"PLACEHOLDER\nname: {e['name']}\nW_mm: {e['W']}\n"
                    f"D_mm: {e['D']}\nH_mm: {e['H']}\nsource: {e['source']}\n"
                    f"completeness: {e['completeness']}\n",
                    encoding="utf-8",
                )
            canon_to_path[slug] = stub
            per_family[fam] += 1
            per_line[(fam, line)] += 1
            w.writerow([slug, e["name"], e["W"], e["D"], e["H"], fam, line,
                        e["source"], e["completeness"], str(stub.relative_to(args.out))])

    # Build aliases.json: every original block name (across all DWGs, including
    # dropped duplicates) → relative path of the canonical stub. Importer reads
    # this to resolve any DWG block_name to the right .skp regardless of spelling.
    #
    # Strategy:
    #   1. Map every kept entry's slug → its stub path.
    #   2. Map every dropped entry's name → its winner's path (the
    #      collapse/dedup chain winner). This recovers aliases for names
    #      that lost their stub during footprint collapse.
    name_to_path: dict[str, Path] = {}
    # Forward chain: dropped name → winner name → ... → kept entry
    drop_chain: dict[str, str] = {dropped_e["name"]: winner_name
                                   for winner_name, dropped_e in dropped}
    # Resolve each name in all_entries to its final winner via chain walk.
    def resolve(name: str, seen: set[str] | None = None) -> str:
        seen = seen or set()
        if name in seen:
            return name
        seen.add(name)
        nxt = drop_chain.get(name)
        return resolve(nxt, seen) if nxt else name
    for e in all_entries:
        winner_name = resolve(e["name"])
        winner_slug = slugify(winner_name)
        path = canon_to_path.get(winner_slug)
        if not path:
            # Fall back to entry's own slug in case winner isn't a kept slug.
            path = canon_to_path.get(slugify(e["name"]))
        if not path:
            continue
        name_to_path.setdefault(e["name"], path)
    for original, path in sorted(name_to_path.items()):
        aliases[original] = str(path.relative_to(args.out))
    aliases_path.write_text(json.dumps(aliases, indent=2, ensure_ascii=False),
                            encoding="utf-8")
    print(f"[aliases] {len(aliases)} original names → {aliases_path}")

    # Dropped report: every stub auto-removed by collapse_by_footprint, with
    # the winner's name. Lets the user audit the collapse and recover any
    # false-positive merge by hand.
    dropped_path = args.out / "dropped.csv"
    with dropped_path.open("w", newline="", encoding="utf-8") as fp:
        dw = csv.writer(fp)
        dw.writerow(["winner_name", "dropped_name",
                     "W_mm", "D_mm", "H_mm",
                     "family", "product_line", "source", "completeness"])
        for winner_name, e in dropped:
            dw.writerow([winner_name, e["name"], e["W"], e["D"], e["H"],
                         family_for(e["name"]), product_line_for(e["name"]),
                         e["source"], e["completeness"]])
        print(f"[dropped] {len(dropped)} entries → {dropped_path}")

    print(f"[manifest] {manifest_path}")
    print("[per family / line]")
    for fam, n in sorted(per_family.items(), key=lambda x: -x[1]):
        print(f"  {fam:25s} {n:5d}")
        lines = sorted(
            ((ln, c) for (f, ln), c in per_line.items() if f == fam),
            key=lambda x: -x[1],
        )
        for ln, c in lines:
            print(f"    {ln:23s} {c:5d}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
