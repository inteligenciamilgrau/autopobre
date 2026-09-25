"""Browser QA for the 15-car roster, branding and results on desktop/mobile."""
from pathlib import Path
from browser_config import browser_executable,browser_args,wait_js,open_menu,enter_track
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[1]
report={'errors':[],'views':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 for mobile,w,h in [(False,1280,720),(True,844,390)]:
  context=browser.new_context(viewport={'width':w,'height':h},is_mobile=mobile,has_touch=mobile)
  page=context.new_page();page.set_default_timeout(120000)
  page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
  open_menu(page)
  assert page.evaluate("document.querySelector('.old-stock-opening').naturalWidth>0")
  page.screenshot(path=str(ROOT/f'renders/oldstock_abertura_{mobile}.png'))
  enter_track(page)
  # The roster is filled once the circuit has loaded: read it from the pause settings.
  page.click('#touchMenu' if mobile else '#menuButton');page.click('#tab-race');page.click('.grid-roster summary')
  assert page.locator('#gridRoster li').count()==15 and 'Kleber Eletric' in page.inner_text('#gridRoster')
  page.screenshot(path=str(ROOT/f'renders/oldstock_pilotos_{mobile}.png'))
  page.click('#settingsResume');wait_js(page,'!interlagos.state.paused')
  info=page.evaluate("""async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const old=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return old.call(this)};interlagos.immersiveInfo();fixtureMode.stepFree=()=>{};interlagos.car.step=()=>{};const scene=fixtureMode.visual.root.parent,boards=scene.getObjectByName('Outdoors_AutoPobre_OldStock'),kleber=fixtureMode.visual.rivals.find(o=>o.userData.entry.number==='70');return {rivals:fixtureMode.field.info().rivals,numbers:fixtureMode.visual.rivals.map(o=>o.userData.entry.number),billboards:boards.children.length,kleberLogo:!!kleber.getObjectByName('OldStock_no_Opala70'),lead:fixtureMode.field.gridLeadIn,positions:fixtureMode.rivals.map(r=>r.car.surface.s),L:fixtureMode.data.meta.reconstructed_xy_m};}""")
  assert len(info['rivals'])==14 and len(set(info['numbers']))==14 and '99' not in info['numbers']
  assert all(s>info['L']-78 and s<info['L']-4 for s in info['positions'])
  assert info['billboards']==16 and info['kleberLogo']
  assert '15' in page.inner_text('#racePosition')
  frame=page.evaluate('interlagos.cockpitInfo().renderedFrame');wait_js(page,f'interlagos.cockpitInfo().renderedFrame>{frame+1}')
  page.screenshot(path=str(ROOT/f'renders/oldstock_grid_{mobile}.png'))
  page.evaluate("()=>{const r=fixtureMode.rivals.find(r=>r.entry.number==='70'),c=interlagos.car;c.x=r.car.x-r.car.surface.tx*8;c.y=r.car.y-r.car.surface.ty*8;c.heading=r.car.heading;c.surface=c.sample(c.x,c.y);const s=document.querySelector('#camera');s.value='hood';s.dispatchEvent(new Event('change'));}")
  frame=page.evaluate('interlagos.cockpitInfo().renderedFrame');wait_js(page,f'interlagos.cockpitInfo().renderedFrame>{frame+1}')
  page.screenshot(path=str(ROOT/f'renders/oldstock_kleber_{mobile}.png'))
  page.evaluate("()=>{interlagos.reposition(8);const s=document.querySelector('#camera');s.value='chase';s.dispatchEvent(new Event('change'));}")
  page.screenshot(path=str(ROOT/f'renders/oldstock_outdoors_{mobile}.png'))
  page.evaluate("async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');fixtureMode.stepFree=ImmersiveMode.prototype.stepFree;interlagos.car.laps=3;fixtureMode.rivals.forEach(r=>r.finished=true);}")
  wait_js(page,'interlagos.state.paused&&fixtureMode.freeFinished')
  assert '15º de 15' in page.inner_text('#raceResult') and page.locator('#finishingOrder li').count()==15
  page.screenshot(path=str(ROOT/f'renders/oldstock_resultado_{mobile}.png'))
  page.click('#resultsMainMenu');page.click('#storyStart');wait_js(page,'interlagos.immersiveInfo().active')
  page.evaluate("()=>{fixtureMode.state.cash=300;fixtureMode.state.phase='starting';fixtureMode.sync();}")
  assert len(page.evaluate('fixtureMode.rivals'))==14
  page.evaluate("()=>{fixtureMode.state.phase='race';fixtureMode.state.finish(15);fixtureMode.sync();}")
  podium=page.evaluate('({place:fixtureMode.state.podiumPlace,result:fixtureMode.state.result.position,fund:fixtureMode.state.profile.fund})')
  assert podium['place']==6 and podium['result']==15 and isinstance(podium['fund'],(float,int))
  report['views'].append({'mobile':mobile,**info,'podium':podium});print('grid, branding and results verified',mobile,flush=True);context.close()
 browser.close()
print(json.dumps(report,indent=2),flush=True);assert not report['errors']
