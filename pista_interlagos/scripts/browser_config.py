"""Optional browser discovery for local visual checks, with no workstation paths."""
import os
from pathlib import Path
from time import monotonic

GAME_URL = 'http://127.0.0.1:8799/pista_interlagos/teste/'


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


def browser_args():
    """Hardware WebGL by default; INTERLAGOS_SOFTWARE_GL=1 forces SwiftShader on machines without a GPU.

    The landscape renders at about 1 fps in SwiftShader, so software runs need patience."""
    args = ['--enable-webgl', '--ignore-gpu-blocklist']
    if os.environ.get('INTERLAGOS_SOFTWARE_GL'):
        args += ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    return args


def wait_js(page, expression, timeout=120000, arg=None):
    """Poll through DevTools; Playwright's in-page string eval is blocked by CSP."""
    deadline = monotonic() + timeout / 1000
    while monotonic() < deadline:
        result = page.evaluate(expression, arg)
        if result:
            return result
        page.wait_for_timeout(50)
    raise TimeoutError('Browser condition did not become true')


def open_menu(page, url=GAME_URL, timeout=120000):
    """Opening screen ready. Circuits, cars and the renderer load only after #start."""
    page.goto(url, wait_until='networkidle', timeout=timeout)
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled", timeout=timeout)


def race_options(page, immersive=None, camera=None, livery=None, tap=False):
    """Change race settings from the opening menu or a paused race, then close the dialog.

    #settingsClose keeps the current session; #settingsBack would end it."""
    press = page.tap if tap else page.click
    if not page.evaluate("document.querySelector('#settings').open"):
        press('#settingsButton' if page.is_visible('#settingsButton') else '#touchMenu' if page.is_visible('#touchMenu') else '#menuButton')
    press('#tab-race')
    if immersive is not None:
        page.locator('#immersiveMode').set_checked(immersive)
    if camera:
        page.select_option('#camera', camera)
    if livery:
        page.select_option('#livery', livery)
        wait_js(page, f"!window.interlagos?.ready||interlagos.state.livery==={livery!r}")
    press('#settingsClose')


def enter_track(page, pilot='Piloto teste', timeout=120000, tap=False):
    """Start or resume a session. The first entry needs a pilot name."""
    if pilot and page.is_visible('#pilotName') and not page.input_value('#pilotName'):
        page.fill('#pilotName', pilot)
    (page.tap if tap else page.click)('#start')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused', timeout=timeout)


def pause_race(page, tap=False):
    """Open the pause menu with the keyboard or the touch toolbar."""
    if tap:
        page.tap('#touchMenu')
        page.tap('#settingsClose')
    else:
        page.keyboard.press('KeyP')
    wait_js(page, 'interlagos.state.paused')


def wait_race_start(page, timeout=30000):
    """The free race opens with 3-2-1-VAI!; the car stays frozen until it ends."""
    try:
        wait_js(page, "!document.querySelector('#raceCountdown').hidden", timeout=1500)
    except TimeoutError:
        pass  # Immersive and recognition sessions have no free-race countdown.
    wait_js(page, "document.querySelector('#raceCountdown').hidden", timeout=timeout)
