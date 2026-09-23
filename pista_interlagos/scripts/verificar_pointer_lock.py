from browser_config import browser_executable, browser_args, wait_js, open_menu, race_options, enter_track
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[1]
report={'errors':[],'checks':{}}
def check(name,value):
 report['checks'][name]=bool(value);print(name,bool(value),flush=True);assert value,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(60000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def frame():page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 def controls():return page.evaluate('interlagos.viewControls()')
 def release():
  page.keyboard.press('Escape');wait_js(page,'!document.pointerLockElement && interlagos.state.paused')
 try:
  # The free race starts behind the car; switch to the interior on track.
  open_menu(page);race_options(page,immersive=False);enter_track(page);page.click('#cockpitButton');page.keyboard.down('KeyS')
  page.mouse.click(750,440);wait_js(page,"document.pointerLockElement?.id==='view' && interlagos.viewControls().pointerLocked")
  check('native_pointer_lock',controls()['pointerLocked'])
  page.mouse.move(1030,500,steps=3);frame()
  looked=controls();check('mouse_looks_inside_without_drag',abs(looked['yaw'])>.1 and page.evaluate("interlagos.state.mode==='cockpit'"))
  page.wait_for_timeout(3300);frame()
  check('stationary_view_stays_free',not controls()['centering'] and abs(controls()['yaw']-looked['yaw'])<.01)
  page.keyboard.up('KeyS');page.keyboard.down('KeyW')
  wait_js(page,'interlagos.telemetry().speed>8')
  wait_js(page,'interlagos.viewControls().centering')
  wait_js(page,'Math.abs(interlagos.viewControls().yaw)<.03')
  check('cockpit_returns_forward',abs(controls()['pitch'])<.03)
  page.mouse.move(780,450,steps=2);frame()
  check('new_mouse_input_interrupts_return',not controls()['centering'] and abs(controls()['yaw'])>.1)
  page.keyboard.up('KeyW');release();check('escape_unlocks_and_pauses',not controls()['pointerLocked'])
  race_options(page,camera='chase');page.evaluate('interlagos.reposition(600)');enter_track(page);page.mouse.click(700,440)
  wait_js(page,'!!document.pointerLockElement && interlagos.viewControls().pointerLocked');page.mouse.move(1200,440,steps=3);frame()
  check('external_mouse_orbits',page.evaluate("interlagos.state.mode==='orbit'"))
  page.keyboard.down('KeyW');wait_js(page,'interlagos.telemetry().speed>8');wait_js(page,'interlagos.viewControls().centering')
  wait_js(page,'''()=>{const c=interlagos.cameraSnapshot(),h=interlagos.car.heading,x=c.position[0]-c.target[0],z=c.position[2]-c.target[2];return (-x*Math.cos(h)+z*Math.sin(h))/Math.hypot(x,z)>.995}''')
  check('orbit_returns_behind_car',True);page.screenshot(path=str(ROOT/'renders/camera_retorno_mouse.png'))
  page.keyboard.up('KeyW');page.keyboard.press('KeyP');wait_js(page,'!document.pointerLockElement && interlagos.state.paused');check('pause_releases_mouse',True)
  # Another click recaptures; leaving the window releases and clears held controls.
  race_options(page,camera='hood');enter_track(page);page.mouse.click(700,440);wait_js(page,'!!document.pointerLockElement && interlagos.viewControls().pointerLocked')
  page.mouse.move(880,450,steps=2);frame();check('hood_supports_head_look',page.evaluate("interlagos.state.mode==='hood'") and abs(controls()['yaw'])>.1)
  page.evaluate("window.dispatchEvent(new Event('blur'))");wait_js(page,'!document.pointerLockElement && interlagos.state.paused');check('focus_loss_releases_mouse',True)
  # Browser without Pointer Lock retains ordinary drag controls.
  fallback=browser.new_page(viewport={'width':1000,'height':700})
  fallback.add_init_script("Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined,configurable:true})")
  open_menu(fallback);race_options(fallback,immersive=False);enter_track(fallback)
  fallback.mouse.move(500,420);fallback.mouse.down();fallback.mouse.move(700,420,steps=4);fallback.mouse.up()
  check('unsupported_browser_drag_fallback',fallback.evaluate("interlagos.state.mode==='orbit' && !document.pointerLockElement"));fallback.close()
  check('no_webgl_errors',not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_pointer_lock.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);browser.close()
