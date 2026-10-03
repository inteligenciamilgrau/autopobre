"""A racing wheel in a real race, with a fake Gamepad API in the page (a G29 as Chrome shows it).

The Controles tab finds the wheel, the guided setup learns it (a quarter turn right, pedals that read
0 until touched and rest at 1, the clutch, paddles, an H gate) and turns Câmbio manual on; a button
is set alone (camera on the D-pad, read as one axis). In the race: neutral with the H lever in the
middle, 1st put in, the paddles and X / Z shift, the wheel steers unsmoothed, the clutch and brake
pedals, the D-pad's camera, Menu pauses and resumes, the automatic gearbox again, and unplugging.
Usage:
  verificar_volante.py [port]   (default 8799; INTERLAGOS_URL overrides the whole address)
"""
import json, os, sys
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, wait_race_start, GAME_URL

URL = os.environ.get('INTERLAGOS_URL') or (GAME_URL.replace('8799', sys.argv[1]) if len(sys.argv) > 1 else GAME_URL)
# Axis 0 the wheel, 1 the clutch, 2 the throttle, 5 the brake (resting at 1, floored at -1, 0 until
# first touched), 9 the D-pad (resting at 1.2857). Buttons 4 / 5 the paddles, 12-16 and 18 the H gate.
FAKE_WHEEL = """(()=>{
 const wheel={connected:false,axes:Array(10).fill(0),buttons:Array(26).fill(0)};wheel.axes[9]=1.2857;window.fakeWheel=wheel;
 Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>wheel.connected?[{id:'Logitech G29 Driving Force Racing Wheel (Vendor: 046d Product: c24f)',index:0,mapping:'',connected:true,timestamp:performance.now(),
  axes:[...wheel.axes],buttons:wheel.buttons.map(v=>({pressed:v>.5,touched:v>0,value:v}))}]:[]});
})()"""
report = {'errors': [], 'steps': {}}


def step(name, value=True):
    report['steps'][name] = value
    print(name, json.dumps(value, ensure_ascii=False), flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1280, 'height': 900})
    context.add_init_script(FAKE_WHEEL)
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    open_menu(page, URL)
    js = lambda code: page.evaluate(f"()=>{{{code};return true;}}")
    text = lambda selector: page.text_content(selector)
    wheel = "interlagosVolante.info()"

    def frames(*codes, gap=120):
        for code in codes:
            js(code)
            page.wait_for_timeout(gap)

    def press_pedal(axis):
        frames(f"fakeWheel.axes[{axis}]=.98", f"fakeWheel.axes[{axis}]=.2", f"fakeWheel.axes[{axis}]=-1", f"fakeWheel.axes[{axis}]=-1",
               f"fakeWheel.axes[{axis}]=.3", f"fakeWheel.axes[{axis}]=1")

    def tap_button(index):
        frames(f"fakeWheel.buttons[{index}]=1", f"fakeWheel.buttons[{index}]=0")

    def at_step(n):
        wait_js(page, f"document.querySelector('#wheelStepCount').textContent.startsWith('PASSO {n} ')", timeout=15000)

    page.click('#settingsButton')
    page.click('#tab-controls')
    assert 'Nenhum volante configurado' in text('#wheelStatus'), text('#wheelStatus')
    assert page.input_value('#gearbox') == 'automatico'
    js("fakeWheel.connected=true;dispatchEvent(new Event('gamepadconnected'))")
    wait_js(page, "document.querySelector('#wheelStatus').textContent.includes('Logitech G29 Driving Force Racing Wheel encontrado')")
    assert 'volante ou pedaleira' in text('#padStatus'), text('#padStatus')
    step('wheel found', [text('#wheelStatus'), text('#padStatus')])
    # Guided setup: wheel, throttle, brake, clutch, paddles, H gate.
    page.click('#wheelSetup')
    at_step(1)
    assert not page.is_visible('#wheelStepSkip'), 'the wheel cannot be skipped'
    frames("fakeWheel.axes[0]=.01", "fakeWheel.axes[0]=.08", "fakeWheel.axes[0]=.15", "fakeWheel.axes[0]=.2")
    at_step(2)
    js("fakeWheel.axes[0]=0")
    step('wheel learnt', page.evaluate(f"{wheel}.map.steer"))
    press_pedal(2)
    at_step(3)
    press_pedal(5)
    at_step(4)
    assert page.is_visible('#wheelStepSkip')
    press_pedal(1)
    at_step(5)
    tap_button(4)
    at_step(6)
    tap_button(4)
    page.wait_for_timeout(300)
    assert 'já ficou com Subir marcha' in text('#wheelStepNote'), text('#wheelStepNote')
    tap_button(5)
    at_step(7)
    assert page.is_visible('#wheelStepSkipLever')
    for n, button in zip(range(8, 14), [12, 13, 14, 15, 16, 18]):
        tap_button(button)
        if n < 13:
            at_step(n)
    wait_js(page, "document.querySelector('#wheelStep').hidden")
    info = page.evaluate(wheel)
    assert info['configured'] and info['connected'] and info['manual'], info
    assert info['map']['throttle'] == {'id': info['map']['steer']['id'], 'axis': 2, 'rest': 1, 'full': -1}, info['map']['throttle']
    assert info['map']['brake']['axis'] == 5 and info['map']['clutch']['axis'] == 1 and info['map']['gR'] == {'id': info['map']['steer']['id'], 'button': 18}
    assert page.input_value('#gearbox') == 'manual'
    assert 'Volante pronto' in text('#wheelStatus') and 'passou para Manual' in text('#wheelStatus'), text('#wheelStatus')
    step('guided setup', text('#wheelStatus'))
    # One command alone: the camera on the D-pad's left.
    page.click('summary:has-text("Todos os comandos do volante")')
    page.click('[data-learn="camera"]')
    wait_js(page, "document.querySelector('#wheelStepCount').textContent==='TROCAR CÂMERA'")
    frames("fakeWheel.axes[9]=.7143", "fakeWheel.axes[9]=1.2857")
    wait_js(page, "document.querySelector('#wheelStep').hidden")
    assert page.evaluate(f"{wheel}.map.camera.value") == .7143
    assert 'Direcional (eixo 9)' in text('#wheelBindings')
    step('camera on the D-pad')
    # Menu, learnt while the settings are open: the press that taught it does not close them.
    page.click('[data-learn="menu"]')
    frames("fakeWheel.buttons[9]=1", "fakeWheel.buttons[9]=0", gap=300)
    wait_js(page, "document.querySelector('#wheelStep').hidden")
    assert page.evaluate("document.querySelector('#settings').open") and 'Botão 9' in text('#wheelBindings')
    step('Menu learnt, settings still open')
    # The meters: the wheel's degrees, a pedal, the lever.
    frames("fakeWheel.axes[0]=.1;fakeWheel.axes[2]=-.03;fakeWheel.buttons[13]=1", gap=300)
    assert text('#wheelSteerText') == '45° →', text('#wheelSteerText')
    assert text('#wheelThrottleText') == '50%', text('#wheelThrottleText')
    assert text('#wheelGearText') == '2', text('#wheelGearText')
    page.screenshot(path=os.path.join(os.environ.get('VOLANTE_SHOTS', '.'), 'volante_controles.png'), full_page=False)
    js("fakeWheel.axes[0]=0;fakeWheel.axes[2]=1;fakeWheel.buttons[13]=0")
    step('meters')
    page.click('#settingsClose')
    # The race: the H lever in neutral, the throttle revs and the car stays.
    enter_track(page)
    wait_race_start(page)
    page.evaluate("()=>{const c=interlagos.car,step=c.step.bind(c);c.step=(input,dt)=>{window.lastInput={...input};return step(input,dt);};return true;}")
    speed = "Math.hypot(interlagos.car.vx,interlagos.car.vy)*3.6"
    js("fakeWheel.axes[2]=-1")
    wait_js(page, "window.lastInput&&lastInput.throttle===1&&lastInput.gear===0")
    page.wait_for_timeout(1500)
    assert page.evaluate(speed) < 2, page.evaluate(speed)
    assert text('#gear') == 'N', text('#gear')
    step('neutral', page.evaluate("[interlagos.car.rpm,document.querySelector('#gear').textContent]"))
    # 1st put in: it goes; the wheel steers at once (45° of 135°).
    js("fakeWheel.buttons[12]=1")
    wait_js(page, f"lastInput.gear===1&&{speed}>15", timeout=20000)
    js("fakeWheel.axes[0]=.1")
    wait_js(page, "lastInput.wheel===true&&Math.abs(lastInput.right-1/3)<.01&&lastInput.left===0")
    wait_js(page, "Math.abs(interlagos.car.steerInput+1/3)<.01")
    js("fakeWheel.axes[0]=0")
    step('1st and steering', page.evaluate(f"[{speed},lastInput.right]"))
    # The lever back to neutral, then the paddles: up to 1st, 2nd; X up, Z down.
    js("fakeWheel.buttons[12]=0")
    wait_js(page, "lastInput.gear===0")
    tap_button(4)
    wait_js(page, "lastInput.gear===1")
    tap_button(4)
    wait_js(page, "lastInput.gear===2")
    page.keyboard.press('KeyX')
    wait_js(page, "lastInput.gear===3")
    page.keyboard.press('KeyZ')
    wait_js(page, "lastInput.gear===2&&document.querySelector('#gear').textContent==='2'")
    step('paddles and keys', page.evaluate("[lastInput.gear,interlagos.car.gear]"))
    # The clutch floored: no drive, the engine revs free; the brake pedal.
    js("fakeWheel.axes[1]=-1")
    wait_js(page, "lastInput.clutch===1")
    js("fakeWheel.axes[1]=1;fakeWheel.axes[2]=1;fakeWheel.axes[5]=-1")
    wait_js(page, "lastInput.brake===1&&lastInput.throttle===0&&lastInput.clutch===0")
    js("fakeWheel.axes[5]=1")
    step('clutch and brake')
    # The D-pad's left changes the camera; Menu pauses and resumes.
    mode = page.evaluate("interlagos.state.mode")
    frames("fakeWheel.axes[9]=.7143", "fakeWheel.axes[9]=1.2857")
    wait_js(page, f"interlagos.state.mode!=={mode!r}")
    frames("fakeWheel.buttons[9]=1", "fakeWheel.buttons[9]=0")
    wait_js(page, "interlagos.state.paused&&!document.querySelector('#menu').classList.contains('hidden')")
    frames("fakeWheel.buttons[9]=1", "fakeWheel.buttons[9]=0")
    wait_js(page, "!interlagos.state.paused")
    step('D-pad camera, Menu')
    # Automatic again (the Controles tab): no gear is asked for.
    page.keyboard.press('Escape')
    wait_js(page, "interlagos.state.paused")
    page.click('#settingsButton')
    page.click('#tab-controls')
    page.select_option('#gearbox', 'automatico')
    page.select_option('#wheelLock', '540')
    wait_js(page, f"{wheel}.lock===540&&!{wheel}.manual")
    page.click('#settingsResume')
    js("fakeWheel.axes[2]=-1")
    wait_js(page, "!interlagos.state.paused&&lastInput.throttle===1&&lastInput.gear===undefined")
    step('automatic again')
    # Unplugged: nothing is held and the race says so.
    js("fakeWheel.connected=false")
    wait_js(page, "lastInput.throttle===0&&!interlagosVolante.info().connected")
    wait_js(page, "document.querySelector('#status').textContent==='Volante desconectado'")
    step('unplugged')
    context.close()
    browser.close()

assert not report['errors'], report['errors']
print(json.dumps(report, ensure_ascii=False, indent=1))
