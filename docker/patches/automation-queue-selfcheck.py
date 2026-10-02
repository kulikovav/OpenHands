"""Build-time self-check for the dispatcher queue patch.

Reads the *installed* dispatcher and config, evaluates the queue helper in
isolation, and asserts its behavior. Standard library only: the image build
runs it with no test framework available.
"""

import ast
import pathlib
import sys

site_packages = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
if site_packages is None:
    import openhands.automation as automation

    site_packages = pathlib.Path(automation.__file__).parent.parent

dispatcher_path = site_packages / "openhands" / "automation" / "dispatcher.py"
config_path = site_packages / "openhands" / "automation" / "config.py"

tree = ast.parse(dispatcher_path.read_text(encoding="utf-8"))
helper = next(
    (
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "dispatch_capacity"
    ),
    None,
)
assert helper is not None, "dispatch_capacity is missing from the dispatcher"

namespace: dict = {}
exec(compile(ast.Module(body=[helper], type_ignores=[]), "<dispatch_capacity>", "exec"), namespace)
capacity = namespace["dispatch_capacity"]

# A ceiling leaves the surplus runs PENDING; 0 keeps the upstream behavior.
assert capacity(0, 3, 10) == 3
assert capacity(2, 3, 10) == 1
assert capacity(3, 3, 10) == 0
assert capacity(9, 3, 10) == 0
assert capacity(0, 0, 10) == 10
assert capacity(5, 0, 10) == 10

config_source = config_path.read_text(encoding="utf-8")
for setting in (
    "dispatcher_max_running_runs",
    "dispatcher_max_dispatch_retries",
):
    assert setting in config_source, f"{setting} is missing from the config"

dispatcher_source = dispatcher_path.read_text(encoding="utf-8")
for marker in (
    "AUTOMATION_DISPATCHER_MAX_RUNNING_RUNS",
    "_requeue_transient_failure",
):
    assert marker in config_source + dispatcher_source, f"{marker} is missing"

print("dispatcher queue self-check passed")