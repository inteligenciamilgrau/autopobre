"""Touch driving on a phone: controls never stay stuck and the page never zooms, in a real browser.

1. A touch whose release got lost (a stale pointer on the steering pad or the pedals) used to keep
   the pad from answering until the pause: now a new finger takes the pad over, and lifting the
   fingers lets go of any control with no finger left on it.
2. Two thumbs driving (or one beside the pads, on the HUD) could make a pinch that zoomed the page
   and pushed the controls off the screen: in touch mode the viewport forbids zooming and every
   element allows panning only (the pads and the view nothing at all). Chrome's synthetic pinch
   (Input.synthesizePinchGesture) does not zoom even a plain page on this desktop browser, so the
   zoom itself is checked on a real phone; this check covers the settings that forbid it.

Usage, from the repo root, with the local server running (INTERLAGOS_URL for another port):
  python pista_interlagos/scripts/verificar_toque_preso.py
"""
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, GAME_URL
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os
ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
report = {'errors': [], 'checks': {}}


def check(name, value):
    report['checks'][name] = bool(value); print(name, bool(value), flush=True); assert value, name


def phone(browser):
    context = browser.new_context(viewport={'width': 844, 'height': 390}, has_touch=True, is_mobile=True, device_scale_factor=2)
    page = context.new_page(); page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    open_menu(page, URL); enter_track(page, tap=True)
    return context, page, context.new_cdp_session(page)


def centre(page, selector, fx=.5, fy=.5):
    return page.evaluate('([s,fx,fy])=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.left+r.width*fx,y:r.top+r.height*fy};}', [selector, fx, fy])


def touches(cdp, kind, points):
    cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': p['x'], 'y': p['y'], 'id': i} for i, p in points]})


def info(page): return page.evaluate('interlagos.mobileInfo()')


# A pointer whose release never comes: a pointerdown with no finger behind it.
STALE = '''([s,x,y,id])=>document.querySelector(s).dispatchEvent(new PointerEvent('pointerdown',{pointerId:id,pointerType:'touch',isPrimary:false,clientX:x,clientY:y,bubbles:true,cancelable:true}))'''

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    try:
        context, page, cdp = phone(browser)
        page.wait_for_timeout(800)
        check('page_zoom_locked', 'maximum-scale=1' in page.get_attribute('meta[name=viewport]', 'content') and page.evaluate("['html','body','#telemetry','#mapcard'].every(s=>getComputedStyle(document.querySelector(s)).touchAction==='pan-x pan-y')") and page.evaluate("['#touchSteering','#touchPedals','#view'].every(s=>getComputedStyle(document.querySelector(s)).touchAction==='none')"))
        # Steering stuck by a lost release: a new finger on the pad takes it over.
        right, left, top = centre(page, '#touchSteering', .9), centre(page, '#touchSteering', .1), centre(page, '#touchPedals', .5, .1)
        page.evaluate(STALE, ['#touchSteering', right['x'], right['y'], 77])
        check('stale_pointer_holds_steering', info(page)['steering'] > .5)
        touches(cdp, 'touchStart', [(1, left)]); page.wait_for_timeout(100)
        check('new_finger_takes_over_steering', info(page)['steering'] < -.5)
        touches(cdp, 'touchEnd', []); page.wait_for_timeout(100)
        check('steering_released_after_takeover', info(page)['steering'] == 0)
        # Throttle stuck by a lost release: lifting the fingers elsewhere lets it go.
        page.evaluate(STALE, ['#touchPedals', top['x'], top['y'], 78])
        check('stale_pointer_holds_throttle', info(page)['throttle'] > .5)
        view = {'x': 422, 'y': 150}
        touches(cdp, 'touchStart', [(2, view)]); touches(cdp, 'touchEnd', []); page.wait_for_timeout(100)
        check('lifting_fingers_releases_stale_throttle', info(page)['throttle'] == 0)
        # Two thumbs driving; the steering thumb's release is lost (a touchend reports only the
        # throttle thumb still down): the steering lets go, the throttle thumb keeps accelerating.
        touches(cdp, 'touchStart', [(3, right), (4, top)]); page.wait_for_timeout(100)
        check('two_thumbs_drive', info(page)['steering'] > .5 and info(page)['throttle'] > .5)
        page.evaluate('''([x,y])=>{const t=new Touch({identifier:4,target:document.querySelector('#touchPedals'),clientX:x,clientY:y});document.dispatchEvent(new TouchEvent('touchend',{touches:[t],changedTouches:[],bubbles:true}));}''', [top['x'], top['y']])
        check('other_thumb_keeps_throttle', info(page)['steering'] == 0 and info(page)['throttle'] > .5)
        touches(cdp, 'touchEnd', []); page.wait_for_timeout(100)
        check('all_released', info(page)['steering'] == 0 and info(page)['throttle'] == 0)
        # Sliders still drag (the fuel slider at the team's desk).
        check('sliders_keep_dragging', page.evaluate("getComputedStyle(document.querySelector('#volume')).touchAction==='none'"))
        context.close()
        check('no_browser_errors', not report['errors']); report['passed'] = True
    finally:
        report.setdefault('passed', False)
        (ROOT / 'dados/validacao_toque_preso.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(report, ensure_ascii=False, indent=2), flush=True); browser.close()
