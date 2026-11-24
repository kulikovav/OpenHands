"""Build-time self-check for the automation memory prompt patch.

Reads the *installed* governed backend and the installed agent-memory skill.
It composes a run prompt, inspects the conversation start payload, and derives
the skill's idempotency key from the tags that payload carries. A retry of one
run must derive one key, so the memory service stores one entry.

A pure PyPI install has no governed backend (governed dispatch exists only in
the deployment's fork), so the check reports that and exits: there is no
governed prompt to prove.

Failures are explicit, not asserts, because ``python -O`` strips asserts and
would let a broken image print "passed".

Run: python automation-memory-prompt-selfcheck.py [site-packages] [catalog-root]
"""

import asyncio
import importlib.util
import logging
import os
import pathlib
import re
import sys
import uuid

DEFAULT_CATALOG_ROOT = "/opt/agent-canvas/node_modules/@openhands/extensions"
AUTOMATION_ID = "11111111-1111-1111-1111-111111111111"
RUN_ID = "22222222-2222-2222-2222-222222222222"
CONVERSATION_ID = "33333333-3333-3333-3333-333333333333"
TARGET_URL = "https://governed.invalid"
FACT = "Deploys use blue-green switches."
TOKEN_SECRET = "self-check-secret"

os.environ.setdefault("OPENHANDS_SUPPRESS_BANNER", "1")
logging.disable(logging.INFO)


def fail(message: str) -> None:
    raise SystemExit(message)


class StubResponse:
    """One recorded answer; the start call reads only its status and body."""

    def __init__(self, body: dict) -> None:
        self.status_code = 201
        self.text = ""
        self._body = body

    def json(self) -> dict:
        return self._body

    def raise_for_status(self) -> None:
        return None


class RecordingClient:
    """Answers the reads before the start and records the start payload."""

    def __init__(self) -> None:
        self.started: dict | None = None

    async def get(self, url, params=None, headers=None, timeout=None):
        if url.endswith("/api/settings/secrets"):
            return StubResponse({"secrets": []})
        return StubResponse({"capabilities": []})

    async def post(self, url, json=None, headers=None):
        self.started = json
        return StubResponse({"id": json["conversation_id"]})


def load_skill_idempotency(catalog_root: pathlib.Path):
    """The skill's own key derivation, so the contract cannot drift."""
    path = catalog_root / "skills" / "agent-memory" / "scripts" / "idempotency.py"
    if not path.is_file():
        fail(f"the agent-memory skill is missing: {path}")
    spec = importlib.util.spec_from_file_location("agent_memory_idempotency", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check_prompt(module, models) -> None:
    automation_cls, run_cls = models
    automation = automation_cls(
        id=AUTOMATION_ID, prompt="Run the task.", name="check"
    )

    for payload in (None, {"action": "opened"}):
        task = module.build_initial_task(
            automation, run_cls(id=RUN_ID, event_payload=payload)
        )
        for required in ("/recall", "/remember", "outcome summary", "outcome store"):
            if required not in task:
                fail(f"the composed prompt is missing {required!r}")
        if AUTOMATION_ID not in task:
            fail("the composed prompt does not name the automation id")
        if "/v1/kv" in task or re.search(r"\bkv\b", task, re.IGNORECASE):
            fail("the composed prompt points at the automation KV API")
        if task.count("## Shared memory") != 1:
            fail("the composed prompt must carry the memory section exactly once")


def check_start_payload(module, models, tags) -> tuple[dict, str]:
    automation_cls, run_cls = models
    automation_id_tag, run_id_tag = tags
    automation = automation_cls(
        id=AUTOMATION_ID, prompt="Run the task.", name="check"
    )
    run = run_cls(id=RUN_ID, event_payload=None)
    claim = module.ExecutionClaim(
        target_id="target",
        target_url=TARGET_URL,
        conversation_id=CONVERSATION_ID,
        claimed_at="2026-01-01T00:00:00+00:00",
    )
    backend = module.GovernedConversationBackend(run)
    backend.target = module.AutomationTarget(
        id="target",
        name="target",
        url=TARGET_URL,
        api_key="target-key",
        origin=TARGET_URL,
    )
    client = RecordingClient()
    outcome = asyncio.run(backend.start_conversation(client, automation, run, claim))
    if not outcome.confirmed:
        fail(f"the governed start was not confirmed: {outcome.error}")
    payload = client.started or {}
    if payload.get("conversation_id") != CONVERSATION_ID:
        fail("the start payload lost the run's conversation identity")
    recorded = payload.get("tags") or {}
    if recorded.get(automation_id_tag) != AUTOMATION_ID:
        fail(f"the start tags are missing {automation_id_tag}")
    if recorded.get(run_id_tag) != RUN_ID:
        fail(f"the start tags are missing {run_id_tag}")
    return recorded, CONVERSATION_ID


def check_idempotency(tags: dict, conversation_id: str, idempotency) -> None:
    """One run and one fact derive one key, so a retry stores one entry."""
    try:
        from openhands.agent_server.docker_runtime.provisioning import (
            MemoryScope,
            mint_memory_token,
        )
    except ImportError as error:
        fail(f"the installed agent server cannot mint a memory token: {error}")

    def key_for(fact: str) -> str:
        scope = MemoryScope.from_tags(uuid.UUID(conversation_id), tags)
        claims = idempotency.claims_from_token(
            mint_memory_token(TOKEN_SECRET, scope, 300)
        )
        if claims["automation_id"] != AUTOMATION_ID:
            fail("the token lost the automation id from the conversation tags")
        if claims["run_id"] != RUN_ID:
            fail("the token lost the run id from the conversation tags")
        return idempotency.build_key(claims, fact)

    first = key_for(FACT)
    if key_for(FACT) != first:
        fail("a retry of the same run derived a different idempotency key")
    if key_for(FACT + " (different)") == first:
        fail("two different facts derived the same idempotency key")


def main() -> None:
    if len(sys.argv) > 1:
        site_packages = pathlib.Path(sys.argv[1])
    else:
        import openhands.automation as automation

        site_packages = pathlib.Path(automation.__file__).resolve().parents[2]
    catalog_root = pathlib.Path(
        sys.argv[2] if len(sys.argv) > 2 else DEFAULT_CATALOG_ROOT
    )
    governed_path = (
        site_packages / "openhands" / "automation" / "backends" / "governed.py"
    )
    if not governed_path.is_file():
        print("automation memory prompt self-check skipped: no governed backend")
        return

    idempotency = load_skill_idempotency(catalog_root)
    from openhands.automation.backends import governed
    from openhands.automation.models import Automation, AutomationRun
    from openhands.sdk.automation import AUTOMATION_ID_TAG, AUTOMATION_RUN_ID_TAG

    check_prompt(governed, (Automation, AutomationRun))
    tags, conversation_id = check_start_payload(
        governed,
        (Automation, AutomationRun),
        (AUTOMATION_ID_TAG, AUTOMATION_RUN_ID_TAG),
    )
    check_idempotency(tags, conversation_id, idempotency)
    print("automation memory prompt self-check passed")


if __name__ == "__main__":
    main()