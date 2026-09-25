"""Recon lap (volta de reconhecimento) as a demonstration, in a real browser.

The "piloto automático" notice is a small badge in the bottom bar (no banner on top), losing the
window focus does not pause the lap (it may be running on a projector while someone does something
else), W takes the wheel (a touch on the pedals on a phone), and once driving the focus loss pauses
as before.

Usage, from the repo root, with the local server running (INTERLAGOS_URL for another port):
  python pista_interlagos/scripts/verificar_reconhecimento_foco.py
"""
from browser_config import browser_executable, browser_args, wait_js, open_menu, GAME_URL
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os
ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
report = {'errors': [], 'checks': {}}


def check(name, value):
    report['checks'][name] = bool(value); print(name, bool(value), flush=True); assert value, name


def start_tour(page, tap=False):
    press = page.tap if tap else page.click
    open_menu(page, URL)
    if not page.input_value('#pilotName'): page.fill('#pilotName', 'Demo')
    press('#settingsButton'); press('#tab-tour'); press('#tour')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused&&interlagos.state.automatic')
    page.wait_for_timeout(1500)


def state(page): return page.evaluate('interlagos.state')


def blur(page): page.evaluate("window.dispatchEvent(new Event('blur'))"); page.wait_for_timeout(1200)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    try:
        context = browser.new_context(viewport={'width': 1280, 'height': 800}); page = context.new_page(); page.set_default_timeout(120000)
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        start_tour(page)
        badge = page.evaluate("(()=>{const b=document.querySelector('#tourBadge'),r=b.getBoundingClientRect();return {text:b.textContent,visible:!b.hidden&&r.height>0,height:r.height,bottom:innerHeight-r.bottom,inBar:!!b.closest('#cameraTools')}})()")
        check('no_banner_on_top', page.evaluate("document.querySelector('#status').classList.contains('hidden')||!document.querySelector('#status').textContent"))
        check('small_badge_in_bottom_bar', badge['visible'] and badge['inBar'] and badge['height'] < 32 and badge['bottom'] < 200 and badge['text'] == 'Piloto automático · W assume')
        page.screenshot(path=str(ROOT / 'renders' / 'reconhecimento_selo.png'))
        clock = page.evaluate('interlagos.car.clock'); blur(page)
        check('focus_loss_keeps_recon_running', not state(page)['paused'] and state(page)['automatic'] and page.evaluate('interlagos.car.clock') > clock + .5)
        page.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); page.wait_for_timeout(300)
        check('visibility_event_keeps_recon_running', not state(page)['paused'])
        page.keyboard.press('KeyW'); page.wait_for_timeout(300)
        check('w_takes_the_wheel', not state(page)['automatic'] and page.evaluate("document.querySelector('#tourBadge').hidden"))
        blur(page)
        check('driving_pauses_on_focus_loss', state(page)['paused'])
        context.close()
        # Phone: the badge sits in the touch toolbar and the pedals take the wheel.
        context = browser.new_context(viewport={'width': 844, 'height': 390}, has_touch=True, is_mobile=True, device_scale_factor=2); page = context.new_page(); page.set_default_timeout(120000)
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        start_tour(page, tap=True)
        check('touch_badge_in_toolbar', page.is_visible('.touch-toolbar #touchTourBadge') and not page.is_visible('#status'))
        page.screenshot(path=str(ROOT / 'renders' / 'reconhecimento_selo_celular.png'))
        cdp = context.new_cdp_session(page)
        top = page.evaluate("(()=>{const r=document.querySelector('#touchPedals').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height*.1}})()")
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': top['x'], 'y': top['y'], 'id': 1}]}); page.wait_for_timeout(300)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        check('pedals_take_the_wheel', not state(page)['automatic'] and not page.is_visible('#touchTourBadge'))
        context.close()
        check('no_browser_errors', not report['errors']); report['passed'] = True
    finally:
        report.setdefault('passed', False)
        print(json.dumps(report, ensure_ascii=False, indent=2), flush=True); browser.close()
