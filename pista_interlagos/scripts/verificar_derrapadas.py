from browser_config import browser_executable, wait_js
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[1]
report={'errors':[],'checks':{}}
def check(name,value):
 report['checks'][name]=bool(value);print(name,bool(value),flush=True);assert value,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(90000)
 page.add_init_script("Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined,configurable:true})")
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def info():return page.evaluate('interlagos.skidInfo()')
 def frame():page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 try:
  page.goto('http://127.0.0.1:8799/pista_interlagos/teste/',wait_until='networkidle',timeout=120000)
  wait_js(page,'window.interlagos?.ready',timeout=120000);page.uncheck("#immersiveMode")
  check('starts_without_marks',info()['segments']==0)
  page.click('#start');page.keyboard.down('KeyS');frame();check('parked_brake_no_marks',info()['segments']==0);page.keyboard.up('KeyS')
  # Known initial speed on the Reta Oposta, then actual keyboard controls drive the effect.
  page.evaluate('()=>{interlagos.reposition(600);const c=interlagos.car;c.vx=Math.cos(c.heading)*18;c.vy=Math.sin(c.heading)*18;}')
  page.keyboard.down('Space');page.keyboard.down('KeyA')
  wait_js(page,'interlagos.skidInfo().totalSegments>100')
  page.keyboard.up('KeyA');page.keyboard.up('Space');page.keyboard.down('KeyS')
  wait_js(page,'interlagos.telemetry().speed<1');frame()
  report['after_drift']=info();check('drift_and_braking_visible_geometry',info()['segments']>100)
  check('all_wheels_can_leave_marks',all(w['segments']>0 for w in info()['perWheel']))
  check('one_extra_draw_call',info()['drawCalls']==1)
  page.screenshot(path=str(ROOT/'renders/derrapadas_perseguicao.png'))
  page.click('#menuButton');page.select_option('#camera','orbit');page.click('#start');page.keyboard.down('KeyS')
  page.mouse.move(700,450);page.mouse.down();page.mouse.move(1050,680,steps=6);page.mouse.up();page.mouse.wheel(0,180);frame()
  page.screenshot(path=str(ROOT/'renders/derrapadas_orbita.png'))
  total=info()['totalSegments'];page.evaluate('interlagos.reset()');frame()
  check('reset_retains_marks_without_connection',info()['totalSegments']==total and info()['activeWheels']==0)
  page.keyboard.up('KeyS');check('no_browser_or_shader_errors',not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_derrapadas.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);browser.close()
