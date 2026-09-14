"""Circuit choices must not navigate, build WebGL, fetch race assets or restart music."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable,wait_js
import json
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 context=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True)
 context.add_init_script("""localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false}));
 window.mediaPlayers=[];const NativeAudio=window.Audio;window.Audio=new Proxy(NativeAudio,{construct(target,args){const player=Reflect.construct(target,args);mediaPlayers.push(player);return player;}});
 window.gpuContexts=0;const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type.startsWith('webgl'))gpuContexts++;return original.call(this,type,...args);};""")
 page=context.new_page();page.set_default_timeout(120000)
 page.on('pageerror',lambda e:(errors.append(str(e)),print(str(e),flush=True)))
 requests=[];navigations=[]
 page.on('request',lambda r:requests.append(r.url))
 page.on('request',lambda r:navigations.append(r.url) if r.is_navigation_request() and r.resource_type=='document' else None)
 def heavy():return [u for u in requests if any(s in u for s in ['.glb','/dados/pista.json','asfalto_','cockpit_faixa','/piloto/'])]
 page.goto('http://127.0.0.1:8799/pista_interlagos/teste/',wait_until='domcontentloaded');wait_js(page,"window.interlagos&&!document.querySelector('#start').disabled")
 assert not heavy(),heavy();assert page.evaluate('gpuContexts')==0
 page.click('[data-circuit="curvelo"]');wait_js(page,"interlagos.audioInfo().recordings?.playing")
 page.evaluate('window.song=mediaPlayers.find(p=>!p.paused);window.songTime=song.currentTime;window.songSrc=song.src')
 for circuit in ['interlagos','curvelo','interlagos','curvelo']:
  page.click('[data-circuit="'+circuit+'"]')
 page.wait_for_timeout(500)
 assert len(navigations)==1,navigations
 assert page.evaluate('song===mediaPlayers.find(p=>!p.paused)&&song.src===songSrc&&song.currentTime>songTime')
 assert not heavy(),heavy();assert page.evaluate('gpuContexts')==0
 assert page.evaluate("JSON.parse(localStorage.getItem('opala99-preferences-v1')).circuit")=='curvelo'
 page.click('#recordsButton');assert page.input_value('#recordsCircuit')=='curvelo';page.click('#recordsClose')
 page.click('#settingsButton');page.select_option('#camera','hood');page.select_option('#livery','seiva_danilo');page.click('#settingsBack')
 assert not heavy(),heavy()
 print(json.dumps({'selectionNoReload':True,'sameSongContinues':True,'noRaceAssetsOrGPU':True,'settingsBeforeRace':True}),flush=True)
 page.click('#start');wait_js(page,"interlagos.ready&&interlagos.circuit==='curvelo'&&!interlagos.state.paused")
 assert heavy();assert page.evaluate('gpuContexts')==1
 page.evaluate("""async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const old=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixture=this;return old.call(this)};interlagos.immersiveInfo();fixture.onMainMenu();}""")
 count=len(heavy());page.click('[data-circuit="interlagos"]');page.wait_for_timeout(250)
 assert len(heavy())==count;assert page.evaluate("interlagos.circuit==='curvelo'")
 # Fail one load, keep the menu usable, then retry in the same audio session.
 page.route('**/dados/pista.json',lambda r:r.fulfill(status=503,body='Unavailable'))
 page.click('#start');wait_js(page,"!document.querySelector('#start').disabled&&!interlagos.ready")
 assert page.is_visible('#circuitPicker');page.unroute('**/dados/pista.json')
 page.click('#start');wait_js(page,"interlagos.ready&&interlagos.circuit==='interlagos'&&!interlagos.state.paused")
 page.evaluate('interlagos.immersiveInfo();fixture.onMainMenu()')
 assert page.locator('#immersivePanel').count()==1;assert page.locator('#pitPanel').count()==0
 page.click('[data-circuit="curvelo"]');page.click('#start');wait_js(page,"interlagos.ready&&interlagos.circuit==='curvelo'&&!interlagos.state.paused")
 assert page.locator('#immersivePanel').count()==1;assert page.locator('#pitPanel').count()==1;assert page.locator('#gridRoster li').count()==15
 assert len(navigations)==1;assert page.evaluate('gpuContexts')==1
 # Restart on the loaded circuit: no second world, model fetch or blocked skin control.
 page.evaluate('interlagos.immersiveInfo();fixture.onMainMenu();window.previousCar=interlagos.car')
 count=len(heavy());page.click('#start');wait_js(page,"interlagos.ready&&!interlagos.state.paused")
 assert page.evaluate('interlagos.car===previousCar');assert len(heavy())==count
 assert not page.is_disabled('#skinButton')
 print(json.dumps({'startsOnlyOnClick':True,'retryLoad':True,'switchesBothWays':True,'singleRenderer':True,'noDuplicateUI':True}),flush=True)
 browser.close()
assert not errors,errors

