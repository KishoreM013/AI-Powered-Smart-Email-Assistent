"""
Guards against model prompts silently losing their f-prefix.

This is a repeated failure in this codebase, not a one-off. Four separate
prompts had lost the `f`, and the effect was invisible: the call succeeded,
returned a well-formed JSON object, and the model had quietly invented the
people, keywords and dates it "found", because it was actually shown a
template containing literal `{subject}`, `{body}` and `{sender}` and no email
at all.

So a test that only checks the response is useless here. These tests check the
prompt that is sent.
"""

import ast
import pathlib
import re

import pytest

APP = pathlib.Path(__file__).resolve().parents[1] / "app"

# A placeholder is a bare name, optionally subscripted: {subject}, {body},
# {history[i]}. Anything else is JSON schema or CSS-ish text, not a slot.
PLACEHOLDER = re.compile(r"(?<!\{)\{([A-Za-z_]\w*(?:\[[^\]]*\])?)\}(?!\})")

# Local names that only look like slots. These files use str.format or
# %-substitution on purpose, and adding an f-prefix there would break them.
# Keys are paths relative to the app/ directory.
FORMAT_TEMPLATES = {"services/tamil_strings.py"}


def _string_assignments(path: pathlib.Path):
    """Yield (line_no, name, prefix, quote, body) for every string assignment."""
    src = path.read_text(encoding="utf-8")
    tree = ast.parse(src)
    lines = src.split("\n")
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Assign, ast.AnnAssign)):
            continue
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        name = next((t.id for t in targets if isinstance(t, ast.Name)), None)
        value = node.value
        if not name or not isinstance(value, ast.Constant) or not isinstance(value.value, str):
            continue
        prefix = ""
        if isinstance(value, ast.JoinedStr):
            prefix = "f"          # already an f-string, nothing to check
        yield node.lineno, name, prefix, value.value, lines


def _models_called():
    """Functions that hand a prompt to a model, with their parameter names."""
    found = {}
    for path in sorted(APP.rglob("*.py")):
        src = path.read_text(encoding="utf-8")
        if "generate_content" not in src:
            continue
        for node in ast.walk(ast.parse(src)):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            params = {a.arg for a in node.args.args} | {a.arg for a in node.args.kwonlyargs}
            if "prompt" in params:
                found.setdefault(node.name, (str(path), params))
    return found


def _prompt_vars():
    """Variables that are passed to a model call, by function."""
    out = {}
    for path in sorted(APP.rglob("*.py")):
        src = path.read_text(encoding="utf-8")
        for node in ast.walk(ast.parse(src)):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for sub in ast.walk(node):
                if (isinstance(sub, ast.Call)
                        and isinstance(sub.func, ast.Attribute)
                        and sub.func.attr == "generate_content"
                        and sub.args
                        and isinstance(sub.args[0], ast.Name)):
                    out.setdefault(node.name, set()).add(sub.args[0].id)
    return out


def test_there_are_prompts_to_check():
    """If this fails, the scan went blind and every test below is vacuous."""
    assert len(_prompt_vars()) >= 3, "expected several functions to call a model"


class TestPromptsInterpolate:
    @pytest.mark.parametrize("rel", sorted(
        str(p.relative_to(APP)) for p in APP.rglob("*.py")))
    def test_no_prompt_slot_is_left_unsubstituted(self, rel):
        """A {name} in a non-f prompt means the model sees the template."""
        path = APP / rel
        if rel in FORMAT_TEMPLATES:
            pytest.skip(f"{rel} uses str.format on purpose")
        offenders = []
        for lineno, name, prefix, body, _lines in _string_assignments(path):
            if prefix:
                continue
            slots = PLACEHOLDER.findall(body)
            if slots:
                offenders.append(f"{rel}:{lineno} {name} -> {sorted(set(slots))[:5]}")
        assert not offenders, (
            "these prompts are missing an f-prefix, so the model receives "
            "literal placeholders and invents the content:\n  "
            + "\n  ".join(offenders)
        )


class TestPromptsReachTheModel:
    """Each prompt must actually carry the email it was given."""

    @pytest.mark.parametrize("func,var", sorted(
        (fn, var) for fn, vars_ in _prompt_vars().items() for var in vars_))
    def test_slot_names_resolve_to_a_function_parameter(self, func, var):
        """Every {name} in a prompt must be something the function can supply.

        A slot that is not a local, a parameter or an import means the prompt
        asks for a value that does not exist here -- which either raises or,
        worse, resolves to a module-level constant that is never what the
        caller meant.
        """
        found = _models_called().get(func)
        if not found:
            pytest.skip(f"{func} calls a model but takes no prompt variable")
        path, params = found
        source = pathlib.Path(path).read_text(encoding="utf-8")

        # Names bound anywhere in the module are fair game: parameters,
        # assignments, comprehension targets, imports, for-loop variables.
        bound = set(params)
        for node in ast.walk(ast.parse(source)):
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
                bound.add(node.id)
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                bound.add(node.name)
            elif isinstance(node, (ast.Import, ast.ImportFrom)):
                for a in node.names:
                    bound.add(a.asname or a.name.split(".")[0])
        bound |= set(re.findall(r"^([A-Z_][A-Z0-9_]*)\s*=", source, re.M))

        src_lines = source.split("\n")
        missing = []
        for lineno, name, prefix, body, _ in _string_assignments(pathlib.Path(path)):
            if not prefix or name != var:
                continue
            for slot in PLACEHOLDER.findall(body):
                root = slot.split("[")[0]
                if root not in bound:
                    missing.append(f"{pathlib.Path(path).name}:{lineno} -> {slot}")
        assert not missing, (
            "prompt slots with nothing to fill them: " + ", ".join(sorted(set(missing)))
            + f"  (available: {sorted(bound)[:12]})"
        )
