"""Opala V06 in the game: doors, hood, trunk lid and filler caps on their hinges (car-openings.js).

At Curvelo's Box 99 the pit panel lifts the hood, the crew opens what it works on (engine: hood,
fuel cell: trunk lid, refuelling: filler caps), the driver's door swings as the pilot gets out
and back in, and everything shuts when the stop ends. Outside the box, H lifts the hood with the
car standing and it shuts as the car moves off. Rivals leave the engine and the fuel cell out.
In story mode at Interlagos, the pilot on foot lifts the hood and the trunk lid of the Opala parked
in Box 99 (H/T or the panel buttons) to look at the engine and the fuel cell.

Usage, from the repo root, with the local server running (INTERLAGOS_URL for another port):
  python pista_interlagos/scripts/verificar_aberturas.py
Screenshots: pista_interlagos/renders/aberturas_*.png
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', 'http://127.0.0.1:8799/pista_interlagos/teste/')
HOOD, TRUNK, DOOR = 'Capo_DOBRADICA', 'Tampa_porta_malas_DOBRADICA', 'Porta_Motorista_DOBRADICA'
CAPS = ['Tampa_bocal_1_DOBRADICA', 'Tampa_bocal_2_DOBRADICA']
errors, checks = [], {}


def check(name, value):
    checks[name] = bool(value)
    print(name, bool(value), flush=True)
    assert value, name


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1280, 'height': 820})
    context.add_init_script("localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'curvelo',immersive:false}));")
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    opening = lambda name: page.evaluate(f"interlagos.openingsInfo()['{name}']")
    try:
        page.goto(URL + '?circuito=curvelo', wait_until='domcontentloaded')
        wait_js(page, "!document.querySelector('#start').disabled")
        page.fill('#pilotName', 'Piloto aberturas')
        page.click('#start')
        wait_js(page, 'window.interlagos?.ready')
        wait_js(page, 'interlagos.car.clock>0')
        info = page.evaluate('interlagos.openingsInfo()')
        check('v06_hinges_loaded', all(n in info for n in [HOOD, TRUNK, DOOR, 'Porta_Passageiro_DOBRADICA', *CAPS]))
        check('all_shut_at_start', all(v['open'] == 0 for v in info.values()))
        rival = page.evaluate('interlagos.rivalParts()')
        check('rivals_without_engine_and_cell', not rival['motor'] and not rival['tanque'] and rival['meshes'] > 10)
        # Park in Box 99 (as verificar_pitstop.py does) with the engine and the fuel cell worn.
        page.evaluate("""async()=>{const {PitStop}=await import('./pitstop.js');const old=PitStop.prototype.info;PitStop.prototype.info=function(){window.pit=this;return old.call(this)};interlagos.pitInfo();
         pit.setDamage(true);pit.condition.damage('motor',.5);pit.condition.damage('tanque',.5);pit.mode.freeFuel=5;
         const c=interlagos.car,i=c.a.findIndex(q=>q[0]>=20),q=c.a[i];c.reset(i);c.x=q[1]+q[9]*21.65;c.y=q[2]+q[10]*21.65;c.surface=c.sample(c.x,c.y);}""")
        wait_js(page, 'pit.opened')
        wait_js(page, "!document.querySelector('#pitPanel').hidden")
        check('pit_panel_offers_hood_and_trunk', page.is_visible('#pitHood') and page.is_visible('#pitTrunk') and 'capô' in page.inner_text('#pitHood'))
        # The panel's button lifts the hood to look at the engine; the camera goes round to the nose.
        page.click('#pitHood')
        wait_js(page, f"interlagos.openingsInfo()['{HOOD}'].open===1")
        check('hood_opens_from_panel', 'manual' in opening(HOOD)['reasons'] and 'Fechar' in page.inner_text('#pitHood'))
        page.evaluate('pit.view={angle:.45,elev:.62,distance:4.6}')
        page.wait_for_timeout(900)
        page.screenshot(path=str(ROOT / 'renders/aberturas_capo_aberto_box.png'))
        page.keyboard.press('h')
        wait_js(page, f"interlagos.openingsInfo()['{HOOD}'].open===0")
        check('h_key_shuts_hood_in_pit', True)
        # Orders: engine (hood), fuel cell (trunk lid) and refuelling (filler caps) open by themselves.
        page.click('[data-repair="motor"][data-kind="proper"]')
        page.click('[data-repair="tanque"][data-kind="proper"]')
        page.click('#pitFill2')
        # Refuelling shares the tank's place, so it waits for the fuel-cell repair.
        wait_js(page, "pit.service.jobs.map(j=>j.id).sort().join()==='motor,tanque'&&pit.service.queue[0]?.id==='fuel'")
        wait_js(page, f"interlagos.openingsInfo()['{HOOD}'].open===1&&interlagos.openingsInfo()['{TRUNK}'].open===1")
        check('crew_opens_hood_and_trunk', 'equipe' in opening(HOOD)['reasons'] and 'equipe' in opening(TRUNK)['reasons'] and not opening(CAPS[0])['reasons'])
        check('panel_says_crew_on_engine', page.is_disabled('#pitHood') and 'equipe no motor' in page.inner_text('#pitHood'))
        page.evaluate('pit.view={angle:2.6,elev:.5,distance:5.5}')
        page.wait_for_timeout(900)
        page.screenshot(path=str(ROOT / 'renders/aberturas_equipe_porta_malas.png'))
        wait_js(page, "pit.service.jobs.some(j=>j.id==='fuel')", timeout=60000)
        wait_js(page, f"interlagos.openingsInfo()['{CAPS[0]}'].open===1")
        check('refuelling_opens_caps', all('equipe' in opening(c)['reasons'] for c in CAPS) and not opening(TRUNK)['reasons'])
        page.evaluate('pit.view={angle:2.2,elev:.3,distance:3.2}')
        page.wait_for_timeout(600)
        page.screenshot(path=str(ROOT / 'renders/aberturas_bocal_abastecendo.png'))
        # Each job shuts its part when it ends.
        wait_js(page, 'pit.service.jobs.length===0', timeout=60000)
        wait_js(page, "Object.values(interlagos.openingsInfo()).every(p=>p.open===0)", timeout=10000)
        check('parts_shut_after_jobs', True)
        # The driver's door swings open as he gets out, then shuts behind him.
        page.click('#pitCoffee')
        wait_js(page, 'pit.coffee!==null')
        wait_js(page, f"interlagos.openingsInfo()['{DOOR}'].open>.95")
        wait_js(page, f"interlagos.openingsInfo()['{DOOR}'].open===0", timeout=10000)
        check('door_opens_as_pilot_gets_out_and_shuts', True)
        # Back to the car on foot; F opens the door again and the stop ends.
        page.evaluate("""()=>{const t=pit.heroStart();for(let i=0;i<2400;i++){const dx=t.x-pit.hero.position.x,dz=t.z-pit.hero.position.z;if(Math.hypot(dx,dz)<.5)return;pit.coffee.yaw=Math.atan2(-dz,dx);pit.beforeStep({throttle:1,brake:0,left:0,right:0},1/120);}}""")
        wait_js(page, "pit.interaction()==='car'")
        page.keyboard.press('f')
        wait_js(page, '!pit.opened')
        wait_js(page, f"interlagos.openingsInfo()['{DOOR}'].open>.5")
        check('door_opens_as_pilot_gets_back_in', True)
        wait_js(page, "Object.values(interlagos.openingsInfo()).every(p=>p.open===0&&!p.reasons.length)", timeout=10000)
        check('all_shut_after_stop', True)
        # Out of the box, standing: H lifts the hood; driving off shuts it.
        page.keyboard.press('h')
        wait_js(page, f"interlagos.openingsInfo()['{HOOD}'].open>.5")
        check('h_opens_hood_standing', True)
        page.keyboard.down('w')
        wait_js(page, 'Math.hypot(interlagos.car.vx,interlagos.car.vy)>2', timeout=20000)
        page.keyboard.up('w')
        wait_js(page, f"interlagos.openingsInfo()['{HOOD}'].open===0", timeout=10000)
        check('hood_shuts_when_moving', not opening(HOOD)['reasons'])
        # A livery swap loads the other GLB with its own hinges.
        livery = page.evaluate('interlagos.state.livery')
        page.keyboard.press('v')
        wait_js(page, f"interlagos.state.livery!=='{livery}'")
        page.keyboard.down('s')
        wait_js(page, 'Math.hypot(interlagos.car.vx,interlagos.car.vy)<.2', timeout=30000)
        page.keyboard.up('s')
        page.keyboard.press('h')
        wait_js(page, f"interlagos.openingsInfo()['{HOOD}'].open>.5")
        check('hinges_after_livery_swap', len(page.evaluate('interlagos.openingsInfo()')) == 6)
        check('no_browser_errors', not errors)
        context.close()
        # Story mode at Interlagos: on foot in the paddock, H and T (or the panel) lift the hood and
        # the trunk lid of the Opala parked in Box 99, to look at the engine and the fuel cell.
        context = browser.new_context(viewport={'width': 1280, 'height': 820})
        context.add_init_script("localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:true}));")
        page = context.new_page()
        page.set_default_timeout(180000)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.goto(URL, wait_until='domcontentloaded')
        wait_js(page, "!document.querySelector('#start').disabled")
        page.fill('#pilotName', 'Piloto paddock')
        page.evaluate("""async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const info=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return info.call(this);};}""")
        # The opening menu has its own "Modo História" button (older menus: the saved preference).
        page.click('#storyStart' if page.locator('#storyStart').count() else '#start')
        wait_js(page, 'window.interlagos?.ready')
        page.evaluate('interlagos.immersiveInfo()')
        wait_js(page, "fixtureMode.state.phase==='crowd'&&!!fixtureMode.visual.ownOpenings")
        own = lambda name: page.evaluate(f"fixtureMode.visual.ownOpenings.info()['{name}']")
        # Stand the pilot 3 m ahead of the parked Opala (or behind it), facing it; the camera follows him.
        page.evaluate("""window.standBy=side=>{const v=fixtureMode.visual,o=v.own,ry=o.rotation.y,f=[Math.cos(ry),-Math.sin(ry)];
         v.hero.position.x=o.position.x+f[0]*3*side;v.hero.position.z=o.position.z+f[1]*3*side;v.foot.yaw=v.hero.rotation.y=ry+(side>0?Math.PI:0);v.followPosition=null;}""")
        page.evaluate('standBy(1)')
        wait_js(page, 'fixtureMode.visual.nearCar()')
        check('paddock_panel_offers_hood_and_trunk', page.is_visible('[data-action="hood"]') and page.is_visible('[data-action="trunk"]'))
        check('paddock_hint_names_keys', 'H: capô' in page.inner_text('#immAlert'))
        page.keyboard.press('h')
        wait_js(page, f"fixtureMode.visual.ownOpenings.info()['{HOOD}'].open===1")
        page.wait_for_timeout(900)
        page.screenshot(path=str(ROOT / 'renders/aberturas_paddock_motor.png'))
        check('paddock_h_opens_hood', 'Fechar o capô' in page.inner_text('[data-action="hood"]') and not page.evaluate(f"interlagos.openingsInfo()['{HOOD}'].reasons.length"))
        page.evaluate('standBy(-1)')
        page.keyboard.press('t')
        wait_js(page, f"fixtureMode.visual.ownOpenings.info()['{TRUNK}'].open===1")
        page.wait_for_timeout(900)
        page.screenshot(path=str(ROOT / 'renders/aberturas_paddock_porta_malas.png'))
        check('paddock_t_opens_trunk', True)
        # The walk holds the mouse (pointer lock): Tab frees it to click the panel, as for the jokes.
        if page.evaluate('!!document.pointerLockElement'):
            page.keyboard.press('Tab')
            wait_js(page, '!document.pointerLockElement')
        page.click('[data-action="trunk"]')
        page.click('[data-action="hood"]')
        wait_js(page, f"fixtureMode.visual.ownOpenings.info()['{HOOD}'].open===0&&fixtureMode.visual.ownOpenings.info()['{TRUNK}'].open===0")
        check('paddock_panel_shuts_them', True)
        # Away from the car the keys do nothing (and never touch the player's hidden race car).
        page.evaluate("fixtureMode.visual.hero.position.x+=12")
        page.keyboard.press('h')
        page.wait_for_timeout(400)
        check('paddock_keys_need_the_car', own(HOOD)['open'] == 0 and not page.evaluate(f"interlagos.openingsInfo()['{HOOD}'].reasons.length"))
        check('no_browser_errors_paddock', not errors)
    finally:
        print(json.dumps({'checks': checks, 'errors': errors[:10]}, indent=1, ensure_ascii=False), flush=True)
        browser.close()
