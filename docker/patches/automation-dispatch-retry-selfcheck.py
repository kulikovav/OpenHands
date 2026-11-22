"""Build-time self-check for the dispatcher retry patch.

Reads the *installed* dispatcher and config and asserts the retry behavior is
present. Standard library only: the image build runs it with no test framework
available.
"""

import ast
import pathlib
import sys

site_packages = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
if site_packages is None:
    import openhands.automation as automation

    site_packages = pathlib.Path(automation.__file__).resolve().parents[2]

dispatcher_path = site_packages / "openhands" / "automation" / "dispatcher.py"
config_path = site_packages / "openhands" / "automation" / "config.py"

dispatcher_source = dispatcher_path.read_text(encoding="utf-8")
config_source = config_path.read_text(encoding="utf-8")

for setting in (
    "dispatcher_max_dispatch_retries",
    "AUTOMATION_DISPATCHER_MAX_DISPATCH_RETRIES",
):
    assert setting in config_source, f"{setting} is missing from the config"

# The deployment sizes the queue through AUTOMATION_MAX_CONCURRENT_RUNS, an
# upstream setting, so a bump that drops it must fail the build.
assert "max_concurrent_runs" in config_source, "max_concurrent_runs is missing"

assert "_requeue_transient_failure" in dispatcher_source, "the requeue is missing"

tree = ast.parse(dispatcher_source)
fail_helper = next(
    (
        node
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name == "_fail"
    ),
    None,
)
assert fail_helper is not None, "_fail is missing from the dispatcher"
fail_source = ast.get_source_segment(dispatcher_source, fail_helper) or ""
assert '"transient"' in fail_source, "_fail must requeue only transient failures"
assert "retryable" in fail_source, "_fail must gate the requeue on retryable"

# A failure to get the execution context is the dispatch-phase failure the
# retry exists for; the entrypoint start is deliberately not retryable.
assert "Failed to get execution context" in dispatcher_source
execution_context_fail = dispatcher_source.split('await _fail(\n            "Failed to get execution context"', 1)
assert len(execution_context_fail) == 2, "the execution context failure must go through _fail"
assert "retryable=True" in execution_context_fail[1][:200], (
    "the execution context failure must be retryable"
)

print("dispatcher retry self-check passed")