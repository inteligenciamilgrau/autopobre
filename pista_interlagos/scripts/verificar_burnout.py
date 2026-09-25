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
 page=browser.new_page(viewport={'width':1120,'height':720});page.set_default_timeout(90000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 try:
  open_menu(page);race_options(page,immersive=False);enter_track(page);wait_race_start(page)
  page.evaluate('interlagos.reposition(600)');page.keyboard.press('Space')
  check('handbrake_without_throttle_no_smoke',page.evaluate('interlagos.smokeInfo().active===0'))
  start=page.evaluate('({x:interlagos.car.x,y:interlagos.car.y})')
  page.keyboard.down('KeyW');wait_js(page,'interlagos.smokeInfo().active>60&&interlagos.car.rearSlipSpeed>18')
  info=page.evaluate('({x:interlagos.car.x,y:interlagos.car.y,spin:interlagos.car.spin,rearSpin:interlagos.car.rearSpin,smoke:interlagos.smokeInfo(),audio:interlagos.audioInfo(),skid:interlagos.skidInfo()})');report['burnout']=info
  check('burnout_holds_position',((info['x']-start['x'])**2+(info['y']-start['y'])**2)**.5<.1)
  check('rear_wheels_spin_independently',abs(info['rearSpin'])>20 and abs(info['spin'])<.1)
  check('stationary_engine_and_squeal',info['audio']['rpm']>5000 and info['audio']['skid']>.8)
  check('stationary_rear_marks',all(w['segments']>0 for w in info['skid']['perWheel'] if not w['front']))
  page.screenshot(path=str(ROOT/'renders/burnout_parado.png'))
  page.keyboard.press('Space');wait_js(page,'interlagos.telemetry().speed>7')
  check('launch_with_wheelspin',page.evaluate('interlagos.car.rearSlipSpeed>1'))
  page.screenshot(path=str(ROOT/'renders/burnout_arrancada.png'));page.keyboard.up('KeyW')
  page.evaluate('interlagos.reset()');check('reset_clears_smoke',page.evaluate('interlagos.smokeInfo().active===0'))
  race_options(page,livery='seiva_danilo',camera='orbit');page.evaluate('interlagos.reposition(600)');enter_track(page)
  page.keyboard.press('Space');page.keyboard.down('KeyW');page.keyboard.down('KeyA')
  wait_js(page,'interlagos.car.yaw>.9&&interlagos.smokeInfo().active>50')
  check('left_donut_second_skin',page.evaluate('interlagos.car.rearSlipSpeed>15&&interlagos.telemetry().speed>5'))
  wait_js(page,'interlagos.car.clock>7')
  page.screenshot(path=str(ROOT/'renders/burnout_zerinho.png'));page.keyboard.up('KeyA');page.keyboard.down('KeyD')
  wait_js(page,'interlagos.car.yaw<-.9');check('right_donut',True)
  page.keyboard.up('KeyD');page.keyboard.press('Space');page.keyboard.up('KeyW');page.click('#menuButton')
  state=page.evaluate('interlagos.smokeInfo()');page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  check('pause_freezes_smoke',state==page.evaluate('interlagos.smokeInfo()'))
  race_options(page,camera='cockpit');page.evaluate('interlagos.reposition(600)');enter_track(page);page.keyboard.press('Space');page.keyboard.down('KeyW')
  wait_js(page,'interlagos.smokeInfo().active>50')
  check('smoke_mirror_current',page.evaluate('interlagos.cockpitInfo().mirrorFrame===interlagos.cockpitInfo().renderedFrame'))
  page.screenshot(path=str(ROOT/'renders/burnout_retrovisor.png'));page.keyboard.press('Space');page.keyboard.up('KeyW')
  check('no_browser_errors',not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_burnout_browser.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);browser.close()
