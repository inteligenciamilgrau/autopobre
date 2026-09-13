from browser_config import browser_executable, wait_js
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,math
ROOT=Path(__file__).resolve().parents[1]
report={'errors':[],'checks':{},'views':[]}
def check(name,value):
 report['checks'][name]=bool(value);print(name,bool(value),flush=True);assert value,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(90000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def frame():page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 try:
  page.goto('http://127.0.0.1:8799/pista_interlagos/teste/',wait_until='networkidle',timeout=120000);wait_js(page,'window.interlagos?.ready',timeout=120000);page.uncheck("#immersiveMode")
  page.select_option('#camera','cockpit');page.click('#start');page.keyboard.down('KeyS');frame()
  page.screenshot(path=str(ROOT/'renders/cockpit_largada.png'))
  info=page.evaluate('interlagos.cockpitInfo()');report['views'].append(info)
  check('internal_selected',info['visible'] and not info['externalVisible'])
  check('eye_inside_cabin',math.dist(info['eyeLocal'],[-.39,1.08,.015])<1e-6)
  for key,sign in [('KeyA',1),('KeyD',-1)]:
   page.keyboard.down(key);wait_js(page,'(s)=>interlagos.car.steer*s>.3',arg=sign);frame()
   check(key+'_wheel_direction',page.evaluate('(s)=>interlagos.cockpitInfo().steering*s>.85',sign));page.keyboard.up(key)
  page.keyboard.up('KeyS');page.evaluate('interlagos.reposition(600)');page.keyboard.down('KeyW');wait_js(page,'interlagos.telemetry().speed>30');page.keyboard.up('KeyW');frame()
  info=page.evaluate('interlagos.cockpitInfo()');report['views'].append(info)
  check('speed_display_active',info['speed']>29)
  check('camera_rigid_while_driving',math.dist(info['eyeLocal'],[-.39,1.08,.015])<1e-6)
  page.screenshot(path=str(ROOT/'renders/cockpit_movimento.png'))
  page.click('#menuButton');page.select_option('#livery','seiva_danilo');wait_js(page,"interlagos.state.livery==='seiva_danilo'");page.evaluate('interlagos.reposition(800)');page.click('#start');page.keyboard.down('KeyS');frame()
  info=page.evaluate('interlagos.cockpitInfo()');check('second_livery_cockpit',info['visible'] and not info['externalVisible']);page.screenshot(path=str(ROOT/'renders/cockpit_seiva.png'));page.keyboard.up('KeyS')
  page.click('#cockpitButton');frame();info=page.evaluate('interlagos.cockpitInfo()');check('external_car_restored',not info['visible'] and info['externalVisible'] and info['fov']==58)
  modes=[]
  for _ in range(5):page.keyboard.press('KeyC');modes.append(page.evaluate('interlagos.state.mode'))
  check('five_camera_cycle',modes==['hood','cockpit','aerial','orbit','chase'])
  page.click('#cockpitButton');page.set_viewport_size({'width':1280,'height':720});frame();page.screenshot(path=str(ROOT/'renders/cockpit_16x9.png'))
  check('no_webgl_errors',not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_cockpit.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);browser.close()
