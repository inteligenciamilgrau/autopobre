from browser_config import browser_executable, browser_args, wait_js, open_menu, race_options, enter_track, wait_race_start
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[1]
report={'errors':[],'checks':{}}
def check(name,value):
 report['checks'][name]=bool(value);print(name,bool(value),flush=True);assert value,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(90000)
 page.add_init_script("Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined,configurable:true})")
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 # Rivals share the rubber buffer (and spin up at the start): count the player's wheels only.
 own='interlagos.skidInfo().perWheel.reduce((n,w)=>n+w.segments,0)'
 def setup(kmh):page.evaluate('(v)=>{interlagos.reposition(600);const c=interlagos.car;c.vx=Math.cos(c.heading)*v/3.6;c.vy=Math.sin(c.heading)*v/3.6;}',kmh)
 try:
  open_menu(page);race_options(page,immersive=False);enter_track(page);wait_race_start(page)
  setup(20);page.keyboard.down('KeyA');wait_js(page,'interlagos.car.clock>1')
  report['slow_turn']=page.evaluate('()=>{const c=interlagos.car;return {rearSlip:Math.abs(-c.vx*Math.sin(c.heading)+c.vy*Math.cos(c.heading)-c.yaw*1.117),marks:'+own+',squeal:interlagos.audioInfo().skid,speed:interlagos.telemetry().speed};}')
  r=report['slow_turn'];check('low_speed_turn_grips',r['rearSlip']<.2 and r['speed']>10)
  check('no_false_marks_or_squeal',r['marks']==0 and r['squeal']==0)
  page.screenshot(path=str(ROOT/'renders/aderencia_curva_lenta.png'))
  page.keyboard.up('KeyA');page.keyboard.down('KeyS');wait_js(page,'interlagos.telemetry().speed<1')
  check('low_speed_braking_clean',page.evaluate(own+'===0&&interlagos.audioInfo().skid===0'))
  page.keyboard.up('KeyS');setup(60);page.keyboard.down('Space');page.keyboard.down('KeyA')
  wait_js(page,own+'>50&&interlagos.audioInfo().skid>.1')
  check('intentional_drift_keeps_marks_and_sound',True);page.keyboard.up('Space');page.keyboard.up('KeyA')
  page.keyboard.press('KeyP');check('no_browser_errors',not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_aderencia_browser.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);browser.close()
