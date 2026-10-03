"""Number keys set the wheel in a real race and leave it there (a test steering).

1 / 2 turn a lot / a little to the left, 3 centres, 4 / 5 a little / a lot to the right; the wheel
stays put after the key is let go. A or D still steer as before and centre the number wheel; the
controller's D-pad (synthetic 1 and 3) never turns it; a pause centres it. Usage:
  verificar_volante_numeros.py [port]   (default 8799; INTERLAGOS_URL overrides the whole address)
"""
import json, os, sys
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, wait_race_start, GAME_URL

URL = os.environ.get('INTERLAGOS_URL') or (GAME_URL.replace('8799', sys.argv[1]) if len(sys.argv) > 1 else GAME_URL)
report = {'errors': [], 'steps': {}}


def step(name, value=True):
    report['steps'][name] = value
    print(name, json.dumps(value), flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    open_menu(page, URL)
    enter_track(page)
    wait_race_start(page)
    # The real car keeps driving; its step only records the command it was given.
    page.evaluate("()=>{const c=interlagos.car,step=c.step.bind(c);c.step=(input,dt)=>{window.lastInput={...input};return step(input,dt);};}")
    command = "lastInput.left-lastInput.right"
    page.keyboard.down('KeyW')

    def wheel(key, expected):
        page.keyboard.press(key)
        page.wait_for_timeout(400)  # well past the key: the wheel must stay where it was put
        got = page.evaluate(f"({{command:{command},steer:interlagos.car.steerInput}})")
        assert abs(got['command'] - expected) < 1e-9, (key, got)
        assert abs(got['steer'] - expected) < .05, (key, got)
        step(f'key {key}', got)

    wheel('Digit2', .4)
    wheel('Digit1', 1)
    wheel('Digit3', 0)
    wheel('Digit4', -.4)
    wheel('Digit5', -1)
    wheel('Numpad2', .4)
    # A takes over while held, and lets go to a centred wheel.
    page.keyboard.down('KeyA')
    wait_js(page, f"{command}===1")
    page.keyboard.up('KeyA')
    wait_js(page, f"{command}===0")
    step('A centres the number wheel')
    # The controller's D-pad sends synthetic 1 / 3: no wheel.
    page.evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{code:'Digit1',key:'1',bubbles:true}));document.dispatchEvent(new KeyboardEvent('keyup',{code:'Digit1',key:'1',bubbles:true}));true")
    page.wait_for_timeout(300)
    assert page.evaluate(command) == 0, page.evaluate(command)
    step('D-pad leaves the wheel alone')
    # A pause lets go of everything, the number wheel too.
    page.keyboard.press('Digit4')
    wait_js(page, f"{command}<0")
    page.keyboard.press('KeyP')
    page.wait_for_timeout(200)
    page.keyboard.press('KeyP')
    page.wait_for_timeout(400)
    assert page.evaluate(command) == 0, page.evaluate(command)
    step('pause centres it')
    page.keyboard.up('KeyW')
    browser.close()

assert not report['errors'], report['errors']
print('OK')
