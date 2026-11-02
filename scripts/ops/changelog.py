#!/usr/bin/env python3
"""Regenerates CHANGELOG.md from merged pull request titles.

    python3 scripts/ops/changelog.py          # needs `gh` signed in (or GH_TOKEN)

Every merged PR since April 2026, newest first, grouped by month, with
Dependabot updates counted rather than listed. Everything from the
"## Before April 2026" heading down is kept as written. Run it when cutting a
release (docs/RELEASING.md) and commit the result in a PR.
"""
import calendar
import json
import re
import subprocess
import sys
from collections import OrderedDict
from pathlib import Path

REPO = "MeteSr/homegentic"
SINCE = "2026-04-11"
ROOT = Path(__file__).resolve().parents[2]
PATH = ROOT / "CHANGELOG.md"
KEEP_FROM = "## Before April 2026"
DEPS = re.compile(r"(?i)^(build\(deps|chore\(deps|bump )")

HEADER = """# Changelog

Every merged pull request, newest first. Releases are the `mainnet-YYYYMMDD-HHMMSS` tags the Deploy Mainnet workflow creates; each has a GitHub release with the PRs it shipped and the module hash of every canister (`scripts/ops/release-manifest.sh`). See `docs/RELEASING.md`.

To add an entry: nothing to do. This file is regenerated from merged PR titles when a release is cut (`docs/RELEASING.md`), so write PR titles that say what changed for users.
"""


def merged_prs():
    out = subprocess.run(
        ["gh", "api", "-X", "GET", "search/issues", "--paginate",
         "-f", f"q=repo:{REPO} is:pr is:merged merged:>={SINCE}", "-f", "per_page=100",
         "--jq", ".items[] | [.closed_at[0:10], .number, .title] | @json"],
        check=True, capture_output=True, text=True,
    ).stdout
    rows = [json.loads(line) for line in out.splitlines() if line.strip()]
    return sorted(rows, key=lambda r: (r[0], r[1]), reverse=True)


def main():
    old = PATH.read_text()
    if KEEP_FROM not in old:
        sys.exit(f"{PATH} has no '{KEEP_FROM}' heading; refusing to drop its history")
    months = OrderedDict()
    for date, number, title in merged_prs():
        m = months.setdefault(date[:7], {"prs": [], "deps": 0})
        if DEPS.match(title) and "audit" not in title.lower():
            m["deps"] += 1
        else:
            m["prs"].append(f"- {title} (#{number})")
    parts = [HEADER]
    for key, m in months.items():
        year, month = key.split("-")
        lines = [f"## {calendar.month_name[int(month)]} {year}", "", *m["prs"]]
        if m["deps"]:
            lines.append(f"- {m['deps']} dependency update{'s' if m['deps'] != 1 else ''} (Dependabot)")
        parts.append("\n".join(lines) + "\n")
    parts.append(old[old.index(KEEP_FROM):])
    PATH.write_text("\n".join(parts))
    print(f"Wrote {PATH} ({sum(len(m['prs']) for m in months.values())} PRs)")


if __name__ == "__main__":
    main()
