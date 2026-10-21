"""Build-time self-check for the template dedupe patch.

Extracts the *installed* ``template_matches`` helper through ``ast`` and asserts
its behavior; importing the module would pull in the DB stack. Standard library
only: the image build runs it with no test framework available.
"""

import ast
import pathlib
import re
import sys
from types import SimpleNamespace
from typing import Any

site_packages = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
if site_packages is None:
    import openhands.automation as automation

    site_packages = pathlib.Path(automation.__file__).resolve().parents[2]

automation_dir = site_packages / "openhands" / "automation"
templates_path = automation_dir / "utils" / "templates.py"
templates_source = templates_path.read_text(encoding="utf-8")

tree = ast.parse(templates_source)
helper = next(
    (
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "template_matches"
    ),
    None,
)
assert helper is not None, "template_matches is missing from templates.py"

# Annotations evaluate at def time before Python 3.14, so the exec namespace
# carries the two names the signature uses.
namespace: dict = {"Any": Any, "TemplateProvenance": SimpleNamespace}
exec(
    compile(ast.Module(body=[helper], type_ignores=[]), "<template_matches>", "exec"),
    namespace,
)
matches = namespace["template_matches"]

# One catalog entry, two setups: only a different setup must create a new row.
issue_setup = {"projects": ["acme/one"]}
stored = {
    "template": {
        "id": "gitlab-issue-to-mr",
        "version": "1.2.0",
        "config": issue_setup,
    }
}
assert matches(stored, SimpleNamespace(id="gitlab-issue-to-mr", config=issue_setup))
assert not matches(
    {"template": {"id": "gitlab-issue-to-mr", "config": {"projects": ["acme/two"]}}},
    SimpleNamespace(id="gitlab-issue-to-mr", config=issue_setup),
)
assert not matches(
    {"template": {"id": "gitlab-mr-reviewer", "config": issue_setup}},
    SimpleNamespace(id="gitlab-issue-to-mr", config=issue_setup),
)

# A row without provenance is not an enabled template.
assert not matches(None, SimpleNamespace(id="gitlab-issue-to-mr", config=None))
assert not matches({}, SimpleNamespace(id="gitlab-issue-to-mr", config=None))

# Missing config and an empty one are both the empty setup.
assert matches(
    {"template": {"id": "gitlab-issue-to-mr"}},
    SimpleNamespace(id="gitlab-issue-to-mr", config=None),
)
assert matches(
    {"template": {"id": "gitlab-issue-to-mr", "config": {}}},
    SimpleNamespace(id="gitlab-issue-to-mr", config=None),
)

# Key order is not identity, and a version bump keeps the same automation.
assert matches(
    {"template": {"config": {"projects": ["acme/one"]}, "id": "gitlab-issue-to-mr"}},
    SimpleNamespace(id="gitlab-issue-to-mr", config=issue_setup),
)
assert matches(
    {
        "template": {
            "id": "gitlab-issue-to-mr",
            "version": "9.9.9",
            "config": issue_setup,
        }
    },
    SimpleNamespace(id="gitlab-issue-to-mr", config=issue_setup),
)

# Scope the query-shape checks to the lookup itself, so an unrelated query in
# the same module cannot satisfy or fail them.
lookup = next(
    (
        node
        for node in tree.body
        if isinstance(node, ast.AsyncFunctionDef)
        and node.name == "find_existing_template_automation"
    ),
    None,
)
assert lookup is not None, "find_existing_template_automation is missing"
lookup_source = ast.get_source_segment(templates_source, lookup)
assert lookup_source is not None
assert ".limit(1)" not in lookup_source, "the lookup must inspect every candidate setup"
assert "for automation in result.scalars():" in lookup_source

# The routers need a database to run, so pin the call shape from their syntax.
for router_name in ("router.py", "preset_router.py"):
    router_tree = ast.parse(
        (automation_dir / router_name).read_text(encoding="utf-8")
    )
    calls = [
        node
        for node in ast.walk(router_tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "find_existing_template_automation"
    ]
    assert len(calls) == 2, f"{router_name}: expected 2 lookups, got {len(calls)}"
    for call in calls:
        assert len(call.args) == 3, f"{router_name}:{call.lineno}: bad arity"
        provenance = call.args[2]
        assert isinstance(provenance, ast.Attribute) and provenance.attr == "template", (
            f"{router_name}:{call.lineno}: pass the whole provenance"
        )

# The patch imports this class; a re-pin that renames it must fail here rather
# than at the first create request.
schemas_source = (automation_dir / "schemas.py").read_text(encoding="utf-8")
assert re.search(r"^class TemplateProvenance\b", schemas_source, re.MULTILINE), (
    "TemplateProvenance is missing from schemas.py"
)

print("template dedupe self-check passed")