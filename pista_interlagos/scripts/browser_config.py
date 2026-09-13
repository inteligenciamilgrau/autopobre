"""Optional browser discovery for local visual checks, with no workstation paths."""
import os
from pathlib import Path
from time import monotonic


def browser_executable():
    configured = os.environ.get('INTERLAGOS_BROWSER')
    if configured:
        return configured
    for variable in ('ProgramFiles(x86)', 'ProgramFiles', 'LOCALAPPDATA'):
        folder = os.environ.get(variable)
        if folder:
            candidate = Path(folder) / 'Microsoft/Edge/Application/msedge.exe'
            if candidate.is_file():
                return str(candidate)
    # None lets Playwright use its installed Chromium.
    return None


def wait_js(page, expression, timeout=120000, arg=None):
    """Poll through DevTools; Playwright's in-page string eval is blocked by CSP."""
    deadline = monotonic() + timeout / 1000
    while monotonic() < deadline:
        result = page.evaluate(expression, arg)
        if result:
            return result
        page.wait_for_timeout(50)
    raise TimeoutError('Browser condition did not become true')
