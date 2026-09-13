import sys,json
from pathlib import Path
sys.path.insert(0,str(Path('pista_interlagos/scripts').resolve()))
from browser_config import browser_executable,wait_js
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':844,'height':390},is_mobile=True,has_touch=True);page.set_default_timeout(90000)
 page.goto('http://127.0.0.1:8799/pista_interlagos/teste/',wait_until='networkidle');wait_js(page,'window.interlagos?.ready')
 page.click('#settingsButton');page.uncheck('#immersiveMode');page.click('#settingsBack');page.click('#start')
 result=page.evaluate("""async()=>{const {ImmersiveMode}=await import('./immersive-mode.js'),{recognitionInput}=await import('./physics.js');const old=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return old.call(this)};interlagos.immersiveInfo();const c=interlagos.car,m=fixtureMode,events=[];let last=0;for(let i=0;i<120*1000&&!m.freeFinished;i++){const input=recognitionInput(c);if(m.freeFuel<=0)input.throttle=0;c.step(input,1/120);m.stepFree(1/120,input);if(c.laps!==last){last=c.laps;events.push({laps:c.laps,clock:c.clock,fuel:m.freeFuel,finished:m.freeFinished});}}return {events,finished:m.freeFinished,laps:c.laps,clock:c.clock,fuel:m.freeFuel,lastValid:c.lastLapValid,next:c.nextCheckpoint,s:c.surface.s};}""")
 print(json.dumps(result),flush=True);wait_js(page,'interlagos.state.paused',timeout=5000)
 assert page.is_visible('#raceResult') and page.inner_text('#menu h1')=='Fim de corrida.'
 wait_js(page,"interlagos.audioInfo().music.theme==='defeat'")
 endClock=page.evaluate('interlagos.car.clock');page.keyboard.press('KeyP');page.wait_for_timeout(200)
 assert page.evaluate('interlagos.state.paused') and page.evaluate('interlagos.car.clock')==endClock
 page.screenshot(path='pista_interlagos/renders/fim_corrida_livre.png');print(page.inner_text('#raceResult'),flush=True)
 page.click('#start');wait_js(page,'!interlagos.state.paused')
 assert page.evaluate('interlagos.car.laps===0&&interlagos.car.awaitingStart&&!fixtureMode.freeFinished')
 page.evaluate('fixtureMode.rivals.forEach(r=>r.finished=false);interlagos.car.laps=3')
 wait_js(page,"interlagos.state.paused&&interlagos.audioInfo().music.theme==='victory'")
 assert '1º de 6' in page.inner_text('#raceResult')
 print('Finish screen, stopped clock, disabled resume, restart and both result music themes passed.',flush=True)
 browser.close()
