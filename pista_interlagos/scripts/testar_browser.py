from browser_config import browser_executable, wait_js
from playwright.sync_api import sync_playwright
from pathlib import Path
import json,time
R=Path(__file__).resolve().parents[1]
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1440,'height':900},device_scale_factor=1)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda msg:errors.append(msg.text) if msg.type=='error' else None)
 page.goto('http://127.0.0.1:8799/pista_interlagos/teste/',wait_until='networkidle',timeout=120000)
 wait_js(page,'window.interlagos?.ready',timeout=120000);page.uncheck("#immersiveMode")
 page.screenshot(path=str(R/'renders/teste_menu.png'))
 page.click('#start');page.wait_for_timeout(700)
 before=page.evaluate('interlagos.telemetry()')
 page.keyboard.down('KeyW');page.wait_for_timeout(3500);page.keyboard.up('KeyW')
 after=page.evaluate('interlagos.telemetry()')
 page.screenshot(path=str(R/'renders/teste_dirigindo.png'))
 page.keyboard.down('KeyD');page.wait_for_timeout(1000);page.keyboard.up('KeyD')
 steering=page.evaluate('({telemetry:interlagos.telemetry(),steer:interlagos.car.steer,heading:interlagos.car.heading})')
 page.keyboard.down('KeyS');page.wait_for_timeout(1500);page.keyboard.up('KeyS')
 braking=page.evaluate('interlagos.telemetry()')
 page.keyboard.press('KeyC');page.wait_for_timeout(500)
 camera=page.evaluate('interlagos.state.mode')
 page.click('#menuButton');page.select_option('#livery','seiva_danilo');wait_js(page,"interlagos.state.livery==='seiva_danilo'",timeout=60000)
 state=page.evaluate('interlagos.state')
 report={'errors':errors,'before':before,'accelerating':after,'steering':steering,'braking':braking,'camera':camera,'state':state}
 report['passed']=not errors and after['speed']>before['speed']+5 and braking['speed']<after['speed'] and camera=='hood' and state['wheels']==4 and state['livery']=='seiva_danilo'
 page.select_option('#camera','chase');page.evaluate('interlagos.reposition(180)');page.click('#start');page.wait_for_timeout(1500)
 page.screenshot(path=str(R/'renders/teste_s_do_senna.png'))
 (R/'dados/validacao_browser.json').write_text(json.dumps(report,indent=2))
 print(json.dumps(report,indent=2),flush=True)
 browser.close()
