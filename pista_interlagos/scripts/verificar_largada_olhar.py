"""The controller at the start and looking around, in a real race (fake Gamepad API in the page).

A (Space) pressed to skip the opening used to pull the handbrake too, and the car sat at the green
light: the start now always finds it down. The right stick turns the view, and let go it swings
back to the front at once, with the car stopped (the mouse's return waits 3 s and needs speed), in
the chase camera and in the cockpit. Usage:
  verificar_largada_olhar.py [port]   (default 8799; INTERLAGOS_URL overrides the whole address)
"""
import json, os, sys, time
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, wait_race_start, GAME_URL

URL = os.environ.get('INTERLAGOS_URL') or (GAME_URL.replace('8799', sys.argv[1]) if len(sys.argv) > 1 else GAME_URL)
FAKE_PAD = """(()=>{
 const pad={connected:false,axes:[0,0,0,0],buttons:Array(17).fill(0)};window.fakePad=pad;
 Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>pad.connected?[{id:'Xbox 360 Controller (XInput STANDARD GAMEPAD)',index:0,mapping:'standard',connected:true,timestamp:performance.now(),
  axes:[...pad.axes],buttons:pad.buttons.map(v=>({pressed:v>.5,touched:v>0,value:v}))}]:[]});
})()"""
RECORD = "()=>{const c=interlagos.car,step=c.step.bind(c);c.step=(input,dt)=>{window.lastInput={...input};return step(input,dt);};return true;}"
# Degrees between where the camera looks and where the car points (world y up; physics y = -world z).
ANGLE = """(()=>{const d=interlagos.cameraSnapshot().direction,h=interlagos.car.heading,fx=Math.cos(h),fz=-Math.sin(h),n=Math.hypot(d[0],d[2]);
 return Math.acos(Math.max(-1,Math.min(1,(d[0]*fx+d[2]*fz)/n)))*180/Math.PI;})()"""
SPEED = "Math.hypot(interlagos.car.vx,interlagos.car.vy)*3.6"
HANDBRAKE = "interlagos.mobileInfo().pressed.includes('Space')"
report = {'errors': [], 'steps': {}}


def step(name, value=True):
    report['steps'][name] = value
    print(name, json.dumps(value, ensure_ascii=False), flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1280, 'height': 720})
    context.add_init_script(FAKE_PAD)
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    pad = lambda js: page.evaluate(f"()=>{{{js};return true;}}")
    open_menu(page, URL + '?intro=1')
    pad("fakePad.connected=true;dispatchEvent(new Event('gamepadconnected'))")
    enter_track(page)
    # The opening plays; A skips it, which also toggled the handbrake latch.
    wait_js(page, "interlagos.introInfo().active&&interlagos.introInfo().time>.6", timeout=30000)
    pad("fakePad.buttons[0]=1")
    wait_js(page, "!interlagos.introInfo().active", timeout=5000)
    page.wait_for_timeout(100)
    pad("fakePad.buttons[0]=0")
    pulled = page.evaluate(HANDBRAKE)
    step('A skipped the opening; handbrake pulled by it', pulled)
    # And once more in the 3-2-1, the way a player waiting for the start taps it.
    wait_js(page, "!document.querySelector('#raceCountdown').hidden", timeout=10000)
    if not page.evaluate(HANDBRAKE):
        pad("fakePad.buttons[0]=1")
        wait_js(page, HANDBRAKE, timeout=3000)
        pad("fakePad.buttons[0]=0")
    assert page.evaluate(HANDBRAKE), 'the handbrake should be pulled before the start'
    page.evaluate(RECORD)
    wait_race_start(page)
    wait_js(page, f"!{HANDBRAKE}&&window.lastInput&&lastInput.handbrake===0", timeout=3000)
    step('the start lets the handbrake down')
    # Right stick, chase camera, car stopped: look right, let go, back to the front.
    page.wait_for_timeout(500)
    ahead = page.evaluate(ANGLE)
    pad("fakePad.axes[2]=1")
    page.wait_for_timeout(700)
    turned = page.evaluate(ANGLE)
    assert turned > ahead + 40, (ahead, turned)
    pad("fakePad.axes[2]=0")
    t0 = time.monotonic()
    wait_js(page, f"{ANGLE}<{ahead + 8}", timeout=3000)
    back = time.monotonic() - t0
    assert page.evaluate(f"{SPEED}<1"), 'the car stood still'
    step('chase: stick let go, the view comes back (stopped)', {'ahead': round(ahead, 1), 'turned': round(turned, 1), 'back_s': round(back, 2)})
    # Cockpit: the head turns with the stick and comes back to the front.
    for _ in range(8):
        if page.evaluate("interlagos.state.mode==='cockpit'"):
            break
        mode = page.evaluate("interlagos.state.mode")
        pad("fakePad.buttons[5]=1")
        wait_js(page, f"interlagos.state.mode!=={mode!r}")
        pad("fakePad.buttons[5]=0")
        page.wait_for_timeout(100)
    assert page.evaluate("interlagos.state.mode==='cockpit'")
    pad("fakePad.axes[2]=-1")
    page.wait_for_timeout(600)
    yaw = page.evaluate("interlagos.viewControls().yaw")
    assert abs(yaw) > .5, yaw
    pad("fakePad.axes[2]=0")
    t0 = time.monotonic()
    wait_js(page, "Math.abs(interlagos.viewControls().yaw)<.03", timeout=3000)
    back = time.monotonic() - t0
    step('cockpit: stick let go, the head turns back', {'yaw': round(yaw, 2), 'back_s': round(back, 2)})
    # Ready to go: RT pulls away.
    pad("fakePad.buttons[7]=1")
    wait_js(page, f"{SPEED}>20", timeout=8000)
    pad("fakePad.buttons[7]=0")
    step('RT pulls away', round(page.evaluate(SPEED), 1))
    browser.close()

assert not report['errors'], report['errors']
print('Controller start and look passed:', json.dumps(report['steps'], ensure_ascii=False))
