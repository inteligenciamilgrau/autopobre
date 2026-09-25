"""Visual check of the moving finish fade and delayed results in both modes."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable,browser_args,wait_js,open_menu,enter_track,wait_race_start
import json
ROOT=Path(__file__).resolve().parents[1]
report={'errors':[],'modes':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 for immersive in [False,True]:
  context=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True)
  page=context.new_page();page.set_default_timeout(120000);page.on('pageerror',lambda e:report['errors'].append(str(e)))
  open_menu(page);enter_track(page,story=immersive);wait_race_start(page)
  page.evaluate("""async immersive=>{const {ImmersiveMode}=await import('./immersive-mode.js'),old=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixture=this;return old.call(this)};interlagos.immersiveInfo();const m=fixture,c=interlagos.car;window.realFinishStep=m.step.bind(m);m.step=()=>true;c.reset();c.vx=Math.cos(c.heading)*40;c.vy=Math.sin(c.heading)*40;c.clock=246.8;c.laps=immersive?1:3;window.finishOrigin=[c.x,c.y];if(immersive){m.state.phase='race';m.state.fuel=8;m.state.health=1;m.raceProgress=0;m.previousS=c.surface.s;m.sync();realFinishStep({throttle:0,brake:0,left:0,right:0},1/120);}else m.stepFree(1/120,{});window.advanceFinish=n=>{for(let i=0;i<n;i++)realFinishStep({},1/120)};}""",immersive)
  assert page.evaluate('fixture.finishing&&!fixture.freeResultReady&&!interlagos.state.paused')
  page.evaluate('advanceFinish(300)');wait_js(page,"Number(document.querySelector('#finishFade').style.opacity)>.49")
  assert page.evaluate('!interlagos.state.paused&&fixture.state.phase!=="podium"&&Math.hypot(interlagos.car.x-finishOrigin[0],interlagos.car.y-finishOrigin[1])>30')
  page.screenshot(path=str(ROOT/f'renders/chegada_meio_{immersive}.png'))
  page.keyboard.press('p');wait_js(page,'interlagos.state.paused');assert page.evaluate('fixture.finishElapsed<2.51&&!fixture.freeResultReady')
  page.click('#start');wait_js(page,'!interlagos.state.paused');assert page.evaluate('fixture.finishing&&fixture.finishElapsed<2.51')
  page.evaluate('advanceFinish(299)');wait_js(page,"Number(document.querySelector('#finishFade').style.opacity)>.99")
  assert page.evaluate('fixture.finishing&&!fixture.freeResultReady&&fixture.state.phase!=="podium"')
  page.screenshot(path=str(ROOT/f'renders/chegada_escuro_{immersive}.png'))
  page.evaluate('advanceFinish(1)')
  wait_js(page,'fixture.state.phase==="podium"' if immersive else 'interlagos.state.paused&&fixture.freeResultReady')
  wait_js(page,"getComputedStyle(document.querySelector('#finishFade')).opacity==='0'")
  assert page.evaluate('interlagos.car.clock===fixture.finishTime')
  if immersive:assert page.evaluate('fixture.state.podiumPlace===6&&fixture.state.paid')
  else:assert '04:06.800' in page.inner_text('#raceResult') and page.locator('#finishingOrder li').count()==15
  page.screenshot(path=str(ROOT/f'renders/chegada_resultado_{immersive}.png'))
  report['modes'].append({'immersive':immersive,'passed':True});print(json.dumps(report['modes'][-1]),flush=True);context.close()
 browser.close()
assert not report['errors'],report['errors']
print(json.dumps(report),flush=True)
