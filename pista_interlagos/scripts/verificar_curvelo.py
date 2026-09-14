"""Browser QA: two circuit choices, banking, result/record isolation and mobile."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable,wait_js
import json
import sys
ROOT=Path(__file__).resolve().parents[1]
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for mobile in ([True] if '--mobile' in sys.argv else [False,True]):
  context=browser.new_context(viewport={'width':844 if mobile else 1280,'height':390 if mobile else 820},is_mobile=mobile,has_touch=mobile)
  context.add_init_script("if(!localStorage.getItem('opala99-preferences-v1'))localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'curvelo',immersive:false}));")
  page=context.new_page();page.set_default_timeout(120000);page.on('pageerror',lambda e:(errors.append(str(e)),print(str(e),flush=True)))
  page.on('console',lambda m: errors.append(m.text) if m.type=='error' else None)
  page.goto('http://127.0.0.1:8799/pista_interlagos/teste/',wait_until='domcontentloaded');wait_js(page,"!document.querySelector('#start').disabled")
  assert page.evaluate("!interlagos.ready")
  page.screenshot(path=str(ROOT/f'renders/curvelo_abertura_{mobile}.png'))
  page.fill('#pilotName','Teste Curvelo');page.click('#start');wait_js(page,'window.interlagos?.ready');wait_js(page,'interlagos.car.clock>0')
  assert page.evaluate("interlagos.circuit==='curvelo'&&interlagos.car.data.meta.reconstructed_xy_m===1250")
  assert page.get_attribute('[data-circuit="curvelo"]','aria-pressed')=='true'
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert page.evaluate("!interlagos.state.paused&&interlagos.state.mode==='chase'")
  page.screenshot(path=str(ROOT/f'renders/curvelo_grid_{mobile}.png'))
  page.evaluate("interlagos.reposition(interlagos.car.data.samples.findIndex(p=>p[0]>350))")
  page.click('#touchMenu' if mobile else '#menuButton');page.select_option('#camera','aerial');page.click('#settingsResume')
  page.screenshot(path=str(ROOT/f'renders/curvelo_inclinacao_{mobile}.png'))
  # Freeze one frame at the finish, then exercise actual post-race transitions.
  page.evaluate("""async ()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const old=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixture=this;return old.call(this)};interlagos.immersiveInfo();const m=fixture,c=interlagos.car;window.finishStep=m.step.bind(m);m.step=()=>true;c.clock=129;c.best=40;c.laps=3;c.vx=30;c.vy=0;m.stepFree(1/120,{});for(let i=0;i<600;i++)finishStep({},1/120);} """)
  wait_js(page,"!document.querySelector('#raceResults').hidden")
  assert page.inner_text('#resultsCircuit')=='OVAL DE CURVELO';assert page.locator('#raceResults tbody tr').count()==15
  page.click('#resultsRecords');page.click('[data-records-source="human"]');assert page.get_attribute('[data-records-circuit="curvelo"]','aria-pressed')=='true'
  assert page.locator('#lapRecords tbody tr').count()==1
  page.click('[data-records-circuit="interlagos"]');assert page.locator('#lapRecords tbody tr').count()==0
  page.click('#recordsClose');page.click('#resultsMainMenu');assert page.is_visible('#circuitPicker')
  page.click('#settingsButton');page.locator('#immersiveMode').set_checked(True);page.click('#settingsBack');page.click('#start')
  wait_js(page,"fixture.active&&fixture.state.phase==='crowd'")
  page.screenshot(path=str(ROOT/f'renders/curvelo_boxes_{mobile}.png'))
  page.evaluate("fixture.state.cash=300;fixture.action('prepare')")
  wait_js(page,"fixture.state.phase==='prepare'")
  assert '1–2 L' in page.inner_text('#immersivePanel')
  page.screenshot(path=str(ROOT/f'renders/curvelo_preparacao_{mobile}.png'))
  page.evaluate('fixture.onMainMenu()');page.click('[data-circuit="interlagos"]')
  page.wait_for_url('**/*circuito=interlagos');assert page.evaluate("interlagos.circuit==='curvelo'")
  page.click('#start');wait_js(page,"window.interlagos?.ready&&interlagos.circuit==='interlagos'")
  assert page.evaluate("interlagos.circuit==='interlagos'&&interlagos.car.data.meta.reconstructed_xy_m>4300")
  assert page.get_attribute('[data-circuit="interlagos"]','aria-pressed')=='true'
  page.screenshot(path=str(ROOT/f'renders/curvelo_volta_interlagos_{mobile}.png'))
  print(json.dumps({'mobile':mobile,'choice':True,'race':True,'recordsSeparated':True,'immersive':True,'switchBack':True}),flush=True)
  context.close()
 browser.close()
assert not errors,errors
