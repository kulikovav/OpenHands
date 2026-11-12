"""Build-time self-check for the case-insensitive provider token patch.

Reads the *installed* SDK workspace sources and asserts:

1. ``RemoteWorkspace._get_secret_value`` tries the requested spelling and then
   the all-lower and all-upper spellings before giving up.
2. The clone path still derives the requested name from the provider through
   ``PROVIDER_TOKEN_NAMES`` / ``get_token_name``, so the case variants are the
   bridge and not a replacement.

Run: python agent-server-token-case-selfcheck.py <site-packages>
"""

import ast
import pathlib
import sys


def _find_function(tree: ast.Module, name: str) -> ast.FunctionDef | None:
    return next(
        (
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.FunctionDef) and node.name == name
        ),
        None,
    )


def main() -> None:
    site_packages = pathlib.Path(sys.argv[1])

    base_path = (
        site_packages / "openhands" / "sdk" / "workspace" / "remote" / "base.py"
    )
    base_tree = ast.parse(base_path.read_text(encoding="utf-8"))
    get_secret = _find_function(base_tree, "_get_secret_value")
    assert get_secret is not None, "_get_secret_value is missing"
    source = ast.get_source_segment(
        base_path.read_text(encoding="utf-8"), get_secret
    )
    assert source is not None, "_get_secret_value has no readable source"
    for marker in (
        "candidate_names = [name]",
        "name.lower()",
        "name.upper()",
        "for candidate in candidate_names:",
        'if e.response.status_code == 404:',
        "continue",
        "return None",
    ):
        assert marker in source, f"case-insensitive token fetch is missing {marker!r}"
    # The loop must return the first hit and keep trying only on 404: an
    # unexpected response status must fail the fetch, not mask a bad store.
    assert source.index("for candidate in candidate_names:") < source.index(
        "return resp.text"
    ), "the candidate loop must wrap the fetch"

    repo_path = site_packages / "openhands" / "sdk" / "workspace" / "repo.py"
    repo_tree = ast.parse(repo_path.read_text(encoding="utf-8"))
    assert _find_function(repo_tree, "get_token_name") is not None, (
        "RepoSource.get_token_name is missing: the fetch name is no longer "
        "derived from the provider and the case variants would be dead code"
    )
    repo_source = repo_path.read_text(encoding="utf-8")
    assert 'GitProvider.GITLAB: "gitlab_token"' in repo_source, (
        "PROVIDER_TOKEN_NAMES no longer spells the provider token lowercase"
    )

    print("agent-server token case self-check passed")


if __name__ == "__main__":
    main()