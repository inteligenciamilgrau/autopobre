"""Story mode engine start in the cockpit, in a real browser.

After paying on the grid the view goes into the cockpit: the IGN switch on the overhead bank
must be turned on (L, or a click on the switch), then PARTIDA held (I, or the on-screen button)
while the throttle is kept in the dial's green band. Without IGN the starter turns but the engine
never fires; too much throttle floods it. The recorded cranking sound plays while it turns.

Usage, from the repo root, with the local server running (INTERLAGOS_URL for another port):
  python pista_interlagos/scripts/verificar_partida.py
"""
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, GAME_URL
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os, time
ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
report = {'errors': [], 'checks': {}}


def check(name, value):
    report['checks'][name] = bool(value); print(name, bool(value), flush=True); assert value, name


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    page = browser.new_page(viewport={'width': 1280, 'height': 800}); page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' and 'tracks.json' not in m.text and 'status of 404' not in m.text else None)
    def state(): return page.evaluate('({phase:fixtureMode.state.phase,ign:fixtureMode.state.ignOn,crank:fixtureMode.state.crank,pressure:fixtureMode.state.pressure,battery:fixtureMode.state.battery,flood:fixtureMode.state.flood,mode:interlagos.state.mode,reason:fixtureMode.state.reason})')
    def shot(name): page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); page.screenshot(path=str(ROOT / 'renders' / f'partida_{name}.png'))
    def to_start():
        page.evaluate("()=>{const m=fixtureMode;m.start();m.state.cash=300;m.action('desk');}")
        page.wait_for_selector('[data-action="buy"]'); page.click('[data-action="buy"]'); wait_js(page, "fixtureMode.state.phase==='starting'")
        page.wait_for_timeout(400)
    lever = "fixtureMode.carRoot.getObjectByName('Interruptor_IGN').rotation.x"
    try:
        open_menu(page, URL); enter_track(page, story=True)
        page.evaluate('''async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const original=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return original.call(this)};interlagos.immersiveInfo();}''')
        wait_js(page, "fixtureMode.state.phase==='crowd'")
        to_start()
        s = state()
        check('start_in_cockpit_view', s['mode'] == 'cockpit' and not page.is_visible('#mapcard'))
        check('ign_starts_off', not s['ign'] and page.evaluate(lever) > .3 and page.evaluate('fixtureMode.startRing.visible'))
        check('start_dial_on_screen', page.is_visible('.start-dial') and page.inner_text('#startZone') == 'BAIXO')
        shot('ign_desligado')
        # Without IGN the starter turns (and sounds) but the engine never fires.
        page.keyboard.down('KeyI'); page.wait_for_timeout(500)
        check('starter_turns_without_ign', state()['crank'] > .2 and page.evaluate('interlagos.audioInfo().effects.loops.starter>0'))
        check('recorded_cranking_sound_loaded', 'starter' in page.evaluate('interlagos.audioInfo().effects.samples'))
        page.keyboard.down('KeyW'); page.wait_for_timeout(700); page.keyboard.up('KeyW'); page.wait_for_timeout(600)
        page.keyboard.up('KeyI')
        check('no_ign_never_fires', state()['phase'] == 'starting')
        # Letting go of PARTIDA does not bring the battery back.
        charge = state()['battery']; page.wait_for_timeout(600)
        check('battery_does_not_recharge', charge < .75 and abs(state()['battery'] - charge) < 1e-9)
        # A click on the IGN switch in the cockpit turns it on.
        xy = page.evaluate('''()=>{const o=fixtureMode.carRoot.getObjectByName('Interruptor_IGN'),p=o.getWorldPosition(o.position.clone()).project(fixtureMode.camera),r=document.querySelector('#view').getBoundingClientRect();return [r.left+(p.x+1)/2*r.width,r.top+(1-p.y)/2*r.height];}''')
        page.mouse.click(*xy); page.wait_for_timeout(300)
        check('click_on_cockpit_switch_turns_ign_on', state()['ign'] and page.evaluate(lever) < -.3 and 'ON' in page.inner_text('.start-ign'))
        # PARTIDA held with the throttle dosed in the green band: it catches and the grid follows.
        page.keyboard.down('KeyI'); held = shot_taken = False; t0 = time.time()
        while state()['phase'] == 'starting' and time.time() - t0 < 8:
            want = state()['pressure'] < .4
            if want != held: (page.keyboard.down if want else page.keyboard.up)('KeyW'); held = want
            if time.time() - t0 > .6 and not shot_taken: shot('no_ponto'); shot_taken = True
            page.wait_for_timeout(30)
        page.keyboard.up('KeyW'); page.keyboard.up('KeyI')
        s = state()
        check('dosed_throttle_starts_engine', s['phase'] in ('grid', 'race'))
        check('view_back_after_start', s['mode'] == 'chase')
        check('ign_lever_left_on', page.evaluate(lever) < -.3 and not page.evaluate('fixtureMode.startRing.visible'))
        # Holding the on-screen PARTIDA with full throttle floods it.
        to_start(); page.keyboard.press('KeyL'); check('l_key_turns_ign_on', state()['ign'])
        # Pumping the pedal without cranking soaks the plugs (the flood level rises and stays).
        for _ in range(2): page.keyboard.down('KeyW'); page.wait_for_timeout(700); page.keyboard.up('KeyW'); page.wait_for_timeout(300)
        page.keyboard.down('KeyW'); page.wait_for_timeout(300)
        check('pumping_pedal_soaks_plugs', state()['flood'] > .2 and 'molha a vela' in page.inner_text('#startTip'))
        page.keyboard.up('KeyW')
        box = page.locator('.start-crank').bounding_box(); page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        page.keyboard.down('KeyW'); page.wait_for_timeout(900); page.mouse.down()
        page.wait_for_timeout(250); shot('afogando')
        wait_js(page, "fixtureMode.state.phase!=='starting'", timeout=5000); page.mouse.up(); page.keyboard.up('KeyW')
        check('flooded_with_full_throttle', 'afogado' in state()['reason'])
        check('no_browser_errors', not report['errors']); report['passed'] = True
    finally:
        report.setdefault('passed', False)
        (ROOT / 'dados/validacao_partida.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(report, ensure_ascii=False, indent=2), flush=True); browser.close()
