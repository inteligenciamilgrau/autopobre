"""The brake backs up at rest (teste/brake-reverse.js) in a real race, on every control.

Keyboard: S held from speed stops the Opala, holds it still a moment, then backs up (gear R on the
HUD) until S is let go. Controller (fake Gamepad API): LT pressed while the car rolls back stops it
first, then backs up. Phone (touch emulation): the pedal pad held at its bottom (brake) backs up
from rest, dosed by how far down the finger is. Câmbio manual keeps the brake a brake. Usage:
  verificar_freio_re.py [port]   (default 8799; INTERLAGOS_URL overrides the whole address)
"""
import json, os, sys
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, wait_race_start, pause_race, GAME_URL

URL = os.environ.get('INTERLAGOS_URL') or (GAME_URL.replace('8799', sys.argv[1]) if len(sys.argv) > 1 else GAME_URL)
FAKE_PAD = """(()=>{
 const pad={connected:false,axes:[0,0,0,0],buttons:Array(17).fill(0)};window.fakePad=pad;
 Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>pad.connected?[{id:'Xbox 360 Controller (XInput STANDARD GAMEPAD)',index:0,mapping:'standard',connected:true,timestamp:performance.now(),
  axes:[...pad.axes],buttons:pad.buttons.map(v=>({pressed:v>.5,touched:v>0,value:v}))}]:[]});
})()"""
# The real car keeps driving; its step only records the command it was given.
RECORD = "()=>{const c=interlagos.car,step=c.step.bind(c);c.step=(input,dt)=>{window.lastInput={...input};return step(input,dt);};return true;}"
FORWARD = "(()=>{const c=interlagos.car;return (c.vx*Math.cos(c.heading)+c.vy*Math.sin(c.heading))*3.6;})()"
SPEED = "Math.hypot(interlagos.car.vx,interlagos.car.vy)*3.6"
report = {'errors': [], 'steps': {}}


def step(name, value=True):
    report['steps'][name] = value
    print(name, json.dumps(value, ensure_ascii=False), flush=True)


def stopped_for(page, seconds):
    """How long the car stays still under the brake before it backs up (s)."""
    return page.evaluate("""(limit)=>new Promise(done=>{const t0=performance.now();const tick=()=>{
     const moving=Math.hypot(interlagos.car.vx,interlagos.car.vy)>.3,t=(performance.now()-t0)/1000;
     if(moving||t>limit)done(t);else requestAnimationFrame(tick);};tick();})""", seconds)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1280, 'height': 720})
    context.add_init_script(FAKE_PAD)
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    open_menu(page, URL)
    enter_track(page)
    wait_race_start(page)
    page.evaluate(RECORD)
    # Keyboard: up to speed, then S held through the stop.
    page.keyboard.down('KeyW')
    wait_js(page, f"{SPEED}>40", timeout=20000)
    page.keyboard.up('KeyW')
    page.keyboard.down('KeyS')
    wait_js(page, "lastInput.brake===1&&lastInput.reverse===0")
    wait_js(page, f"{SPEED}<.5", timeout=15000)
    still = stopped_for(page, 3)
    assert .6 < still < 1.6, f'held still a moment at rest, then backs up: {still}'
    wait_js(page, f"lastInput.reverse===1&&lastInput.brake===0&&{FORWARD}<-5", timeout=10000)
    gear = page.text_content('#gear')
    assert gear == 'R', gear
    step('S stops, waits, backs up', {'still_s': round(still, 2), 'kmh': round(page.evaluate(FORWARD), 1), 'gear': gear})
    page.keyboard.up('KeyS')
    wait_js(page, "lastInput.reverse===0&&lastInput.brake===0")
    step('S let go: no reverse')
    # Controller: LT while still rolling back brakes first, then backs up.
    page.evaluate("fakePad.connected=true;dispatchEvent(new Event('gamepadconnected'));true")
    wait_js(page, f"{FORWARD}<-3")
    page.evaluate("fakePad.buttons[6]=1;true")
    wait_js(page, "lastInput.brake===1&&lastInput.reverse===0")
    wait_js(page, f"{SPEED}<.5", timeout=10000)
    wait_js(page, f"lastInput.reverse===1&&{FORWARD}<-3", timeout=10000)
    step('LT stops, then backs up', round(page.evaluate(FORWARD), 1))
    # LT with RT: a brake, never reverse.
    page.evaluate("fakePad.buttons[7]=1;true")
    wait_js(page, "lastInput.reverse===0&&lastInput.brake===1")
    page.evaluate("fakePad.buttons[6]=0;fakePad.buttons[7]=0;true")
    step('LT with RT stays a brake')
    # Câmbio manual: S only brakes, held as long as you like.
    page.evaluate("fakePad.connected=false;dispatchEvent(new Event('gamepaddisconnected'));true")
    def gearbox(value):
        pause_race(page)
        page.click('#settingsButton')
        page.click('#tab-controls')
        page.select_option('#gearbox', value)
        page.click('#settingsResume')
        wait_js(page, "!interlagos.state.paused")
    gearbox('manual')
    page.keyboard.down('KeyS')
    wait_js(page, f"{SPEED}<.5&&lastInput.gear!==undefined", timeout=15000)
    page.wait_for_timeout(2500)
    assert page.evaluate(f"lastInput.reverse===0&&lastInput.brake===1&&{SPEED}<.5"), 'manual: the brake stays a brake'
    page.keyboard.up('KeyS')
    step('manual gearbox: brake only brakes')
    gearbox('automatico')
    context.close()

    # Phone: the pedal pad held at its bottom.
    context = browser.new_context(viewport={'width': 844, 'height': 390}, has_touch=True, is_mobile=True, device_scale_factor=2)
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    open_menu(page, URL)
    enter_track(page, tap=True)
    wait_race_start(page)
    page.evaluate(RECORD)
    cdp = context.new_cdp_session(page)
    # The pad's own scale (mobile-controls.js setPedals): 22 px margins, bottom 30% brakes.
    pedal = lambda position: page.evaluate("(k)=>{const r=document.querySelector('#touchPedals').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+22+k*(r.height-44)};}", position)

    def back_up(position):
        point = pedal(position)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': point['x'], 'y': point['y'], 'id': 1}]})
        wait_js(page, "interlagos.mobileInfo().brake>0", timeout=5000)
        page.wait_for_timeout(1500)
        result = page.evaluate(f"({{brake:interlagos.mobileInfo().brake,reverse:lastInput.reverse,kmh:{FORWARD}}})")
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        wait_js(page, "lastInput.reverse===0")
        page.keyboard.down('KeyS')  # stop again before the next pull
        wait_js(page, f"{SPEED}<.5", timeout=10000)
        page.keyboard.up('KeyS')
        page.wait_for_timeout(300)
        return result

    full = back_up(1)
    assert full['reverse'] > .9 and full['kmh'] < -2, full
    half = back_up(.92)
    assert .2 < half['reverse'] < .8 and full['kmh'] < half['kmh'] < 0, (half, full)
    step('phone pedal backs up, dosed', {'full': full, 'half': half})
    context.close()
    browser.close()

assert not report['errors'], report['errors']
print('Brake to reverse in the browser passed:', json.dumps(report['steps'], ensure_ascii=False))
