from browser_config import browser_executable, wait_js
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[1]
report={'errors':[],'checks':{},'poses':[]}
def check(name,value):
 report['checks'][name]=bool(value);print(name,bool(value),flush=True);assert value,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(90000)
 page.add_init_script("Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined,configurable:true})")
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def frame():page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 def pose():return page.evaluate('interlagos.driverInfo()')
 def check_arms(name):
  info=pose();report['poses'].append(info);check(name,all(a['reachable'] and abs(a['upper']-.275)<1e-5 and abs(a['lower']-.265)<1e-5 and abs(a['gripRadius']-.173)<1e-8 for a in info['arms']))
 try:
  page.goto('http://127.0.0.1:8799/pista_interlagos/teste/',wait_until='networkidle',timeout=120000);wait_js(page,'window.interlagos?.ready',timeout=120000);page.uncheck("#immersiveMode")
  page.select_option('#camera','cockpit');page.click('#start');page.keyboard.down('KeyS');frame();check_arms('hands_on_wheel_neutral')
  page.screenshot(path=str(ROOT/'renders/piloto_interna.png'))
  page.keyboard.down('KeyA');wait_js(page,'interlagos.car.steer>.48');frame();check('no_body_lean_while_parked',abs(pose()['lean'])<.002);check_arms('full_left_reachable');page.keyboard.up('KeyA')
  page.keyboard.down('KeyD');wait_js(page,'interlagos.car.steer<-.48');frame();check_arms('full_right_reachable');page.keyboard.up('KeyD');page.keyboard.up('KeyS')
  page.evaluate('interlagos.reposition(600)');page.keyboard.down('KeyW');wait_js(page,'interlagos.telemetry().speed>35')
  page.keyboard.down('KeyA');wait_js(page,'interlagos.driverInfo().lean<-.03');frame();check_arms('left_curve_grip_and_ik');page.screenshot(path=str(ROOT/'renders/piloto_curva_esquerda.png'));page.keyboard.up('KeyA')
  page.keyboard.down('KeyD');wait_js(page,'interlagos.driverInfo().lean>.03');frame();check_arms('right_curve_grip_and_ik');page.screenshot(path=str(ROOT/'renders/piloto_curva_direita.png'));page.keyboard.up('KeyD');page.keyboard.up('KeyW')
  page.click('#menuButton');page.select_option('#camera','chase');page.evaluate('interlagos.reposition(600)');page.select_option('#camera','orbit');page.click('#start');page.keyboard.down('KeyS')
  page.mouse.move(600,450);page.mouse.down();page.mouse.move(1050,450,steps=8);page.mouse.up();page.mouse.wheel(0,-700);frame();check('driver_visible_externally',pose()['visible']);page.screenshot(path=str(ROOT/'renders/piloto_externa_omp.png'));page.keyboard.up('KeyS')
  page.click('#menuButton');page.select_option('#livery','seiva_danilo');wait_js(page,"interlagos.state.livery==='seiva_danilo'");page.click('#start');page.keyboard.down('KeyS');frame();check_arms('second_livery_same_driver');page.screenshot(path=str(ROOT/'renders/piloto_externa_seiva.png'));page.keyboard.up('KeyS')
  page.evaluate('interlagos.reset()');frame();check('reset_clears_lean',abs(pose()['lean'])<.001)
  check('no_browser_errors',not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_piloto.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);browser.close()
