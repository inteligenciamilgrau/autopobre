from browser_config import browser_executable, browser_args, wait_js, open_menu, race_options, enter_track
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
import math
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
 def snap():return page.evaluate('interlagos.cameraSnapshot()')
 def kept_view(a,b):
  # One pixel of mouse turns the view by .0025 rad; anything more is a jump.
  turn=math.acos(max(-1,min(1,sum(x*y for x,y in zip(a['direction'],b['direction'])))))
  return turn<.005 and math.dist(a['position'],b['position'])<.004*math.dist(a['position'],a['car'])+.05 and abs(a['fov']-b['fov'])<.05
 def sideways(c):
  # The car's horizontal angle from the screen centre.
  d=c['direction'];to=[c['car'][0]-c['position'][0],c['car'][1]+.85-c['position'][1],c['car'][2]-c['position'][2]]
  r=[-d[2],0,d[0]];return abs(math.atan2((to[0]*r[0]+to[2]*r[2])/math.hypot(*r),sum(a*b for a,b in zip(to,d))))
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
  wait_js(page,'!!document.pointerLockElement && interlagos.viewControls().pointerLocked');frame()
  view=snap();page.mouse.move(701,440);frame()
  check('chase_mouse_keeps_view',page.evaluate("interlagos.state.mode==='orbit'") and kept_view(view,snap()))
  page.mouse.move(1200,440,steps=3);frame()
  check('external_mouse_orbits',page.evaluate("interlagos.state.mode==='orbit'"))
  page.keyboard.down('KeyW');wait_js(page,'interlagos.telemetry().speed>8');wait_js(page,'interlagos.viewControls().centering')
  wait_js(page,'''()=>{const c=interlagos.cameraSnapshot(),h=interlagos.car.heading,x=c.position[0]-c.target[0],z=c.position[2]-c.target[2];return (-x*Math.cos(h)+z*Math.sin(h))/Math.hypot(x,z)>.995}''')
  check('orbit_returns_behind_car',True);page.screenshot(path=str(ROOT/'renders/camera_retorno_mouse.png'))
  # Orbiting with the mouse is still the chase view: C moves on to the next camera instead of recentring.
  page.keyboard.press('KeyC');check('c_after_chase_mouse_goes_to_close',page.evaluate("interlagos.state.mode==='close'"))
  page.keyboard.up('KeyW');page.keyboard.press('KeyP');wait_js(page,'!document.pointerLockElement && interlagos.state.paused');check('pause_releases_mouse',True)
  # The aerial view keeps its viewpoint when the mouse starts orbiting.
  race_options(page,camera='aerial');page.evaluate('interlagos.reposition(600)');enter_track(page);page.mouse.click(700,440)
  wait_js(page,'!!document.pointerLockElement && interlagos.viewControls().pointerLocked');frame()
  view=snap();page.mouse.move(701,440);frame()
  check('aerial_mouse_keeps_view',page.evaluate("interlagos.state.mode==='orbit'") and kept_view(view,snap()))
  page.keyboard.press('KeyC');check('c_after_aerial_mouse_goes_to_chase',page.evaluate("interlagos.state.mode==='chase'"))
  # Far from the car the orbit stays above the trees, and the return goes back to the aerial view itself.
  choose="(m)=>{const s=document.querySelector('#camera');s.value=m;s.dispatchEvent(new Event('change'))}"
  page.evaluate(choose,'aerial');frame();page.mouse.move(701,0,steps=4);frame()
  low=snap();check('aerial_orbit_stays_high',page.evaluate("interlagos.state.mode==='orbit'") and low['position'][1]-low['car'][1]>40)
  check('aerial_orbit_stays_level',abs(low['roll'])<.002)
  # That far orbit's tilt limit must not move the next camera when the mouse takes it over.
  page.keyboard.press('KeyC');frame();frame();view=snap();page.mouse.move(702,0);frame()
  check('chase_after_aerial_orbit_keeps_view',page.evaluate("interlagos.state.mode==='orbit'") and kept_view(view,snap()))
  page.evaluate(choose,'aerial');frame();page.mouse.move(703,0);frame()
  page.keyboard.down('KeyW');wait_js(page,'interlagos.telemetry().speed>8');wait_js(page,'interlagos.viewControls().centering');page.wait_for_timeout(2500)
  returned=snap();page.evaluate(choose,'aerial');frame();aerial=snap()
  rel=lambda c:[a-b for a,b in zip(c['position'],c['car'])]
  turn=math.acos(max(-1,min(1,sum(x*y for x,y in zip(returned['direction'],aerial['direction'])))))
  check('aerial_orbit_returns_to_aerial',turn<.02 and math.dist(rel(returned),rel(aerial))<1.5)
  page.keyboard.up('KeyW');page.keyboard.press('KeyP');wait_js(page,'!document.pointerLockElement && interlagos.state.paused')
  # Here the aerial view sits well to one side of the car; tilting the orbit up and then down to the horizon keeps the car centred.
  race_options(page,camera='aerial');page.evaluate('interlagos.reposition(1200)');enter_track(page);page.mouse.click(700,440)
  wait_js(page,'!!document.pointerLockElement && interlagos.viewControls().pointerLocked');frame()
  page.mouse.move(700,899,steps=6);frame();page.mouse.move(700,0,steps=12);frame()
  check('aerial_orbit_keeps_car_centred',page.evaluate("interlagos.state.mode==='orbit'") and sideways(snap())<.02)
  page.keyboard.press('KeyP');wait_js(page,'!document.pointerLockElement && interlagos.state.paused')
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
