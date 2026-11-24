"""Build-time self-check: the conversation image carries the agent-memory skill.

A governed conversation runs in a sandbox built from this image, and the outer
persistence tree is not visible there. The skill must arrive inside the
extensions package the image copies, so a package pin that lacks it fails the
build instead of leaving the sandbox without memory.

Run: python memory-skill-selfcheck.py [catalog-root]
"""

import os
import sys
from pathlib import Path

DEFAULT_ROOT = "/opt/agent-canvas/node_modules/@openhands/extensions"
REQUIRED = (
    "skills/agent-memory/SKILL.md",
    "skills/agent-memory/README.md",
    "skills/agent-memory/scripts/memory.py",
    "skills/agent-memory/scripts/idempotency.py",
    "skills/agent-memory/references/api.md",
)


def main() -> None:
    root = Path(
        sys.argv[1]
        if len(sys.argv) > 1
        else os.environ.get("EXTENSIONS_PATH") or DEFAULT_ROOT
    )
    assert root.is_dir(), f"the extensions catalog is missing: {root}"

    missing = [relative for relative in REQUIRED if not (root / relative).is_file()]
    assert not missing, "the conversation image is missing the agent-memory skill: " + (
        ", ".join(missing)
    )

    skill = (root / "skills" / "agent-memory" / "SKILL.md").read_text(encoding="utf-8")
    for trigger in ("/remember", "/recall"):
        assert trigger in skill, f"agent-memory does not advertise {trigger}"

    print("memory skill self-check passed")


if __name__ == "__main__":
    main()