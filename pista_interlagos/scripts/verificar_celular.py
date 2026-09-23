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
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(120000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def info():return page.evaluate('interlagos.cockpitInfo().phone')
 def frame():page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 try:
  open_menu(page);race_options(page,immersive=False);enter_track(page);page.click('#cockpitButton')
  check('no_message_at_start',info()['count']==0)
  page.keyboard.down('Space')
  wait_js(page,'interlagos.cockpitInfo().phone.active')
  check('requested_first_message',info()['message']['text']=='Buscar filha na escola');report['first']=info()
  page.screenshot(path=str(ROOT/'renders/celular_interna.png'))
  page.locator('#view').click(position={'x':700,'y':400});wait_js(page,'interlagos.viewControls().pointerLocked')
  page.evaluate("document.dispatchEvent(new MouseEvent('mousemove',{movementX:0,movementY:150,bubbles:true}))");frame()
  check('look_down_to_read',page.evaluate('interlagos.viewControls().pitch<-.3'))
  page.screenshot(path=str(ROOT/'renders/celular_olhando_baixo.png'))
  page.keyboard.down('KeyA');wait_js(page,'interlagos.car.steer>.4');frame()
  check('phone_keeps_message_while_steering',info()['message']['text']=='Buscar filha na escola')
  check('hands_still_reach_wheel',page.evaluate('interlagos.driverInfo().arms.every(a=>a.reachable)'))
  page.keyboard.up('KeyA');page.keyboard.up('Space');page.keyboard.press('KeyP')
  before=info();frame();frame();check('pause_keeps_phone_state',before==info())
  race_options(page,livery='seiva_danilo');check('skin_change_preserves_message',info()==before)
  page.click('#start');page.keyboard.down('Space');page.screenshot(path=str(ROOT/'renders/celular_seiva.png'));page.keyboard.up('Space')
  page.click('#cockpitButton');frame();before=info();frame();frame();check('external_view_preserves_schedule',before==info())
  page.evaluate('interlagos.reset()');check('reset_clears_phone',info()['count']==0 and info()['message'] is None)
  check('no_browser_errors',not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_celular_browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2),flush=True);browser.close()
