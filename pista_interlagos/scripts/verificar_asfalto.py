from browser_config import browser_executable, wait_js
"""Visual QA of the actual WebGL asphalt shader and existing driving controls."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json

ROOT=Path(__file__).resolve().parents[1]
report={'errors':[],'views':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1440,'height':900})
 # Material QA uses drag fallback; pointer capture is validated separately.
 page.add_init_script("Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined,configurable:true})")
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda msg:report['errors'].append(msg.text) if msg.type=='error' else None)
 page.goto('http://127.0.0.1:8799/pista_interlagos/teste/',wait_until='networkidle',timeout=120000)
 wait_js(page,'window.interlagos?.ready',timeout=120000);page.uncheck("#immersiveMode")
 def frame():page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 for mode,index,name in [('chase',100,'perseguicao'),('hood',680,'frenagem'),('orbit',180,'orbita')]:
  page.select_option('#camera',mode)
  page.evaluate('(i)=>interlagos.reposition(i)',index)
  page.click('#start');page.keyboard.down('KeyS');frame()
  if mode=='orbit':
   page.mouse.move(700,440);page.mouse.down();page.mouse.move(900,530,steps=6);page.mouse.up();frame()
  page.screenshot(path=str(ROOT/f'renders/asfalto_{name}.png'))
  report['views'].append({'camera':mode,'index':index,**page.evaluate('interlagos.surfaceInfo()')})
  page.keyboard.up('KeyS');page.click('#menuButton')
 page.select_option('#camera','hood');page.evaluate('interlagos.reposition(600)');page.click('#start')
 page.keyboard.down('KeyW')
 wait_js(page,'interlagos.telemetry().speed>35',timeout=120000)
 frame();report['driving']=page.evaluate('interlagos.telemetry()')
 page.screenshot(path=str(ROOT/'renders/asfalto_movimento.png'))
 page.keyboard.up('KeyW')
 report['passed']=not report['errors'] and all(v['vertices']>10000 and v['anisotropy']>=1 for v in report['views']) and report['driving']['speed']>35
 (ROOT/'dados/validacao_asfalto.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
 print(json.dumps(report,indent=2),flush=True)
 browser.close()
 assert report['passed']
