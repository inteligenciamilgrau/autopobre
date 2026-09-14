from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable,wait_js
import json
ROOT=Path(__file__).resolve().parents[1]
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for mobile in [False,True]:
  context=browser.new_context(viewport={'width':844 if mobile else 1280,'height':390 if mobile else 820},is_mobile=mobile,has_touch=mobile)
  context.add_init_script("localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'curvelo',immersive:false}));")
  page=context.new_page();page.set_default_timeout(120000);page.on('pageerror',lambda e:(errors.append(str(e)),print(str(e),flush=True)))
  page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
  page.goto('http://127.0.0.1:8799/pista_interlagos/teste/?circuito=curvelo',wait_until='domcontentloaded');wait_js(page,"!document.querySelector('#start').disabled")
  page.click('#start');wait_js(page,'window.interlagos?.ready')
  page.evaluate("""async()=>{const {PitStop}=await import('./pitstop.js');const old=PitStop.prototype.info;PitStop.prototype.info=function(){window.pit=this;return old.call(this)};interlagos.pitInfo();window.park=()=>{const c=interlagos.car;const i=c.a.findIndex(p=>p[0]>=20),p=c.a[i];c.reset(i);c.x=p[1]+p[9]*20;c.y=p[2]+p[10]*20;c.surface=c.sample(c.x,c.y);};park();pit.condition.damage('motor',.6);pit.condition.damage('freios',.5);window.advance=n=>{for(let i=0;i<n;i++)pit.beforeStep({throttle:0,brake:0,left:0,right:0},1/120);};}""")
  wait_js(page,'pit.opened');wait_js(page,"!document.querySelector('#pitPanel').hidden")
  assert page.locator('.pit-parts article').count()==6
  assert page.evaluate('interlagos.car.surface.pit&&interlagos.car.surface.onRoad')
  page.wait_for_timeout(2500);page.screenshot(path=str(ROOT/f'renders/pitstop_servicos_{mobile}.png'))
  wallet=page.evaluate('pit.wallet');page.click('[data-repair="motor"][data-kind="proper"]')
  assert page.evaluate('pit.service.job?.id')=='motor';assert page.evaluate('pit.wallet')<wallet
  page.click('#pitSettings');elapsed=page.evaluate('pit.service.job.elapsed');page.wait_for_timeout(200);assert page.evaluate('pit.service.job.elapsed')==elapsed
  page.click('#settingsResume');page.click('#pitCoffee');wait_js(page,'pit.coffee!==null');page.evaluate('advance(520)')
  wait_js(page,'!pit.driver.root.visible&&pit.hero.visible');assert page.evaluate('pit.service.job!==null||pit.condition.quality.motor===1')
  page.wait_for_timeout(2500);page.screenshot(path=str(ROOT/f'renders/pitstop_cafe_{mobile}.png'))
  assert page.evaluate("()=>{const b=document.querySelector('#pitReturnCar').getBoundingClientRect();return b.right<=innerWidth&&b.left>=0&&b.bottom<=innerHeight}")
  page.evaluate('advance(1500)');assert page.evaluate('pit.condition.quality.motor')==1
  page.click('#pitReturnCar');page.evaluate('advance(500)');wait_js(page,'!pit.coffee&&pit.driver.root.visible')
  page.evaluate('pit.mode.freeFuel=3');page.click('#pitFill2');assert page.evaluate('pit.service.job.id')=='fuel'
  page.evaluate('advance(120)');assert 3<page.evaluate('pit.fuel')<5
  page.click('#pitLeave');wait_js(page,'!pit.opened');assert page.evaluate('!pit.service.job&&pit.driver.root.visible')
  if mobile:assert page.is_visible('#touchSteering')
  # Re-enter and verify the inexpensive partial repair, with a visible result.
  page.evaluate('pit.departing=false;advance(100)');wait_js(page,'pit.opened')
  page.click('[data-repair="freios"][data-kind="patch"]');page.evaluate('advance(1200)');assert .5<page.evaluate('pit.condition.quality.freios')<1
  # Immersive cash/profile accounting is independent of the free-race team budget.
  page.evaluate("pit.mode.onMainMenu()")
  page.click('#settingsButton');page.locator('#immersiveMode').set_checked(True);page.click('#settingsBack');page.click('#start')
  page.evaluate("pit.mode.state.phase='race';pit.mode.state.cash=120;pit.mode.state.profile.fund=200;pit.mode.state.fuel=4;pit.mode.raceProgress=0;pit.mode.previousS=20;pit.mode.sync();park();pit.departing=false;pit.condition.damage('tanque',.8);advance(100)")
  wait_js(page,'pit.opened');page.click('[data-repair="tanque"][data-kind="proper"]');assert page.evaluate('pit.mode.state.cash')<120;assert page.evaluate('pit.mode.state.profile.fund')==200
  page.evaluate('advance(2000)');assert page.evaluate('pit.condition.quality.tanque')==1
  assert page.evaluate('pit.mode.state.phase')=='race';assert page.evaluate('pit.mode.state.raceTime')>0
  print(json.dumps({'mobile':mobile,'repair':True,'coffee':True,'partialRepair':True,'refuel':True,'pause':True,'immersiveBalance':True}),flush=True)
  context.close()
 browser.close()
assert not errors,errors
