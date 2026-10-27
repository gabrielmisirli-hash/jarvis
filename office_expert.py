"""The Office expertise JARVIS reaches for: Excel, VBA, Power BI, dashboards.

The knowledge itself is plain Markdown in `skills/office-expert/reference/`,
one file per topic, so it can be read and corrected without touching code —
and so a Claude Code session can load the same folder as a skill.

Every tool result is cut at `server.TOOL_RESULT_CAP` (1500 characters), so a
guide is never handed over whole. It is split on its `## ` headings and the
brain gets ONE section: the one its `focus` words match best, or the
principles when nothing matches. The other section names ride along so the
brain knows what to ask for next.

Pure and synchronous: no network, no subprocess, nothing written.
"""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

GUIDE_DIR = Path(__file__).parent / "skills" / "office-expert" / "reference"

# Canonical topic -> its file. The order is the order JARVIS lists them in.
TOPICS = {
    "excel": "excel.md",
    "vba": "vba.md",
    "power_bi": "power_bi.md",
    "power_query": "power_query.md",
    "dashboards": "dashboards.md",
    "word": "word.md",
    "powerpoint": "powerpoint.md",
    "programacao": "programacao.md",
}

# What the user (and so the brain) actually says, folded the way `_fold`
# folds: lower case, no accents, single spaces.
ALIASES = {
    "planilha": "excel", "planilhas": "excel", "formula": "excel",
    "formulas": "excel", "tabela dinamica": "excel", "pivot": "excel",
    "macro": "vba", "macros": "vba",
    "powerbi": "power_bi", "power bi": "power_bi", "pbi": "power_bi",
    "dax": "power_bi",
    "powerquery": "power_query", "power query": "power_query",
    "pq": "power_query", "m": "power_query",
    "dashboard": "dashboards", "painel": "dashboards", "paineis": "dashboards",
    "relatorio": "dashboards", "relatorios": "dashboards", "kpi": "dashboards",
    "documento": "word", "mala direta": "word",
    "ppt": "powerpoint", "power point": "powerpoint", "apresentacao": "powerpoint",
    "slides": "powerpoint",
    "programacao": "programacao", "programming": "programacao",
    "codigo": "programacao", "python": "programacao", "sql": "programacao",
    "office scripts": "programacao", "power automate": "programacao",
}

# Room left for the header line and the "other sections" footer inside the
# 1500-character cap. Held by tests/test_office_expert.py against every
# section of every guide.
SECTION_BUDGET = 1300

_WORD_RE = re.compile(r"[a-z0-9#]+")
# Words too common in these guides to say anything about which section fits.
_STOPWORDS = {"de", "da", "do", "das", "dos", "a", "o", "as", "os", "e", "em",
              "no", "na", "nos", "nas", "um", "uma", "para", "com", "por",
              "que", "como", "se", "ou", "the", "of", "to", "in", "and"}


def _fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", str(text).lower())
    bare = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join(bare.replace("_", " ").replace("-", " ").split())


def resolve_topic(raw: str) -> str | None:
    """The canonical topic for what the brain passed, or None."""
    folded = _fold(raw)
    if not folded:
        return None
    for topic in TOPICS:
        if folded == _fold(topic):
            return topic
    return ALIASES.get(folded)


def sections(topic: str) -> list[tuple[str, str]]:
    """(heading, body) for each `## ` section of a topic's guide, in order."""
    text = (GUIDE_DIR / TOPICS[topic]).read_text(encoding="utf-8")
    found: list[tuple[str, str]] = []
    for chunk in re.split(r"^## ", text, flags=re.MULTILINE)[1:]:
        heading, _, body = chunk.partition("\n")
        found.append((heading.strip(), body.strip()))
    return found


def _words(text: str) -> set[str]:
    return {w for w in _WORD_RE.findall(_fold(text)) if w not in _STOPWORDS}


def _best(parts: list[tuple[str, str]], focus: str) -> int:
    wanted = _words(focus)
    if not wanted:
        return 0
    best, best_score = 0, 0
    for i, (heading, body) in enumerate(parts):
        score = 3 * len(wanted & _words(heading)) + len(wanted & _words(body))
        if score > best_score:
            best, best_score = i, score
    return best


def lookup(topic: str, focus: str = "") -> str:
    """One section of a topic's guide, sized to survive the tool-result cap.

    `focus` only chooses the section; it is never written into the reply.
    """
    parts = sections(topic)
    if not parts:
        return "That guide is empty."
    i = _best(parts, focus)
    heading, body = parts[i]
    others = [h for j, (h, _) in enumerate(parts) if j != i]
    reply = f"Guia {topic} — {heading}:\n{body}"
    if others:
        reply += "\n\nOutras seções: " + "; ".join(others) + "."
    return reply
