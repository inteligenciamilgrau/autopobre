"""The Fusca tab of Modo Corrida's car screen (car-select.js, fusca.js): the grid's 15 cars as Fuscas (the 99
black with the yellow stripe), the studio turning the chosen one in its colours, the choice kept, and on
track a field of Fuscas: the player's (the Opala's body, cockpit and brake lamps hidden, the driver in the
Fusca's seat) and every rival's, each driver on the Fusca's seat, with Stevan Gaipo's Fusca 99 in the seat
of the team taken. Back on the menu the Opala returns; the Opala tab and Modo História stay Opalas.
Usage: verificar_fusca.py [porta]
Screens in renders/: fusca_99.png, fusca_73.png, fusca_19.png, fusca_opala_aba.png, fusca_grid.png,
fusca_corrida_*.png, fusca_99_corrida.png, fusca_celular.png."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable,browser_args,wait_js,wait_race_start

PORT=sys.argv[1] if len(sys.argv)>1 else '8799'
URL=f'http://127.0.0.1:{PORT}/pista_interlagos/teste/'
ROOT=Path(__file__).resolve().parents[1]
RENDERS=ROOT/'renders';RENDERS.mkdir(exist_ok=True)
HOOK="""async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const old=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixture=this;return old.call(this)};interlagos.immersiveInfo();return true;}"""
FIELD="""()=>{interlagos.immersiveInfo();const f=fixture,v=f.visual;return {rivals:f.rivals.map(r=>r.entry.number),seats:v.rivals.map(o=>o.userData.entry.number),
 models:v.rivals.map(o=>o.userData.fusca?'fusca':'opala'),seat:v.rivals.map(o=>o.userData.driver?.root.position.toArray().map(c=>+c.toFixed(4))??null),
 opala99Shown:!!v.opala99?.visible,fuscasShown:v.root.children.filter(o=>o.visible&&o.userData.fusca).length,me:f.playerEntry?.number??'99'}}"""
CARS="()=>interlagosCarros.info()"
PREFS="()=>JSON.parse(localStorage.getItem('opala99-preferences-v1'))"
errors=[];result={}
def shot(page,name):page.wait_for_timeout(500);page.screenshot(path=str(RENDERS/name))
def camera(page,value):page.evaluate(f"(()=>{{const s=document.querySelector('#camera');s.value='{value}';s.dispatchEvent(new Event('change'));return true;}})()")
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 context=browser.new_context(viewport={'width':1440,'height':900})
 context.add_init_script("""if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,car:'99'}));}""")
 page=context.new_page();page.set_default_timeout(180000)
 page.on('pageerror',lambda e:(errors.append(str(e)),print(str(e),flush=True)))
 page.on('console',lambda m:print('console',m.type,m.text,flush=True) if m.type=='error' else None)
 fuscas=[];page.on('request',lambda r:fuscas.append(r.url) if 'fusca_v2.glb' in r.url else None)
 page.goto(URL+'?intro=0',wait_until='domcontentloaded');wait_js(page,"window.interlagos&&!document.querySelector('#start').disabled")

 # The Opala tab first, the default: 15 cards, no Fusca downloaded.
 page.fill('#pilotName','Piloto fusca');page.click('#start');assert page.is_visible('#cars')
 assert page.get_attribute('#carModels [data-model="opala"]','aria-selected')=='true' and page.locator('#carCards [data-car]').count()==15
 wait_js(page,"interlagosCarros.info().live&&interlagosCarros.info().built==='99'",timeout=180000);assert not fuscas,fuscas

 # The Fusca tab: the same 15 cars, the 99 still chosen (Stevan's black Fusca with the yellow stripe), then the 73.
 page.click('#carModels [data-model="fusca"]')
 assert page.get_attribute('#carModels [data-model="fusca"]','aria-selected')=='true'
 assert page.locator('#carCards [data-car]').count()==15 and page.get_attribute('#carCards [data-car="99"]','aria-checked')=='true' and 'Fusca' in page.inner_text('#carsTitle')
 wait_js(page,"(i=>i.live&&i.builtModel==='fusca'&&i.built==='99')(interlagosCarros.info())",timeout=180000)
 assert 'Fusca 99' in page.inner_text('#carName') and 'faixa amarela' in page.inner_text('#carDetail'),page.inner_text('#carDetail');shot(page,'fusca_99.png')
 page.click('#carCards [data-car="73"]');wait_js(page,"(i=>i.builtModel==='fusca'&&i.built==='73')(interlagosCarros.info())")
 prefs=page.evaluate(PREFS);assert prefs['carModel']=='fusca' and prefs['car']=='73',prefs
 assert 'Fusca 73' in page.inner_text('#carName') and 'Konrad' in page.inner_text('#carDetail'),page.inner_text('#carName')
 studio=page.evaluate(CARS);assert studio['meshes']>20,studio;shot(page,'fusca_73.png')
 page.click('#carCards [data-car="19"]');wait_js(page,"interlagosCarros.info().built==='19'");shot(page,'fusca_19.png')
 page.click('#carCards [data-car="2"]');wait_js(page,"interlagosCarros.info().built==='2'");shot(page,'fusca_2.png')
 # The tabs answer the arrows; the Opala tab keeps the team (an Opala 2 now), then back to the Fusca 73.
 page.focus('#carModels [data-model="fusca"]');page.keyboard.press('ArrowLeft')
 wait_js(page,"(i=>i.model==='opala'&&i.builtModel==='opala'&&i.built==='2')(interlagosCarros.info())");assert page.locator('#carCards [data-car]').count()==15
 shot(page,'fusca_opala_aba.png');assert page.evaluate(PREFS)['carModel']=='opala'
 page.click('#carModels [data-model="fusca"]');page.click('#carCards [data-car="73"]');wait_js(page,"(i=>i.builtModel==='fusca'&&i.built==='73')(interlagosCarros.info())")
 assert len(fuscas)==1,fuscas

 # The track screen names the Fusca; a single race in it.
 page.click('#carsNext');assert 'Fusca #73' in page.inner_text('#tracksPilot'),page.inner_text('#tracksPilot')
 page.click('#singleRace');wait_js(page,"interlagos.ready&&!interlagos.state.paused",timeout=240000)
 page.evaluate(HOOK);page.wait_for_timeout(400)
 field=page.evaluate(FIELD);cars=page.evaluate(CARS);print(json.dumps({'field':field,'cars':cars},ensure_ascii=False),flush=True)
 assert cars['raceModel']=='fusca' and cars['raceCar']=='73' and not cars['opalaShown'] and cars['painted']=='99',cars
 f=cars['fusca'];assert f and f['number']=='73' and f['wheels']==4 and f['decals']==5 and not f['ownWheelShown'],f
 assert abs(cars['seatShift'][0]-.257)<1e-6,cars
 assert '73' not in field['rivals'] and field['seats'][field['rivals'].index('99')]=='99' and field['me']=='73',field
 # The whole field in Fuscas, each rival's driver on the Fusca's seat (rival-driver.js CABIN_DROP plus fusca.js FUSCA_SEAT).
 assert field['models']==['fusca']*14 and field['fuscasShown']==14 and not field['opala99Shown'],field
 assert all(s==[.257,.02,0] for s in field['seat']),field['seat']
 shot(page,'fusca_grid.png')
 wait_race_start(page)
 # Driving: the wheels turn with the car; braking lights the tail lamps.
 page.keyboard.down('KeyW');page.wait_for_timeout(3500);page.keyboard.up('KeyW');shot(page,'fusca_corrida_perseguicao.png')
 page.keyboard.down('KeyS');page.wait_for_timeout(250);braking=page.evaluate(CARS)['fusca']['braking'];page.keyboard.up('KeyS')
 assert braking,'the Fusca\'s tail lamps light under braking'
 page.wait_for_timeout(1500);assert not page.evaluate(CARS)['fusca']['braking']
 cockpit=None
 for view in ['close','hood','cockpit','tv']:
  camera(page,view);page.wait_for_timeout(900);shot(page,f'fusca_corrida_{view}.png')
  if view=='cockpit':cockpit=page.evaluate("(()=>{const c=interlagos.cockpitInfo();return {visible:c.visible,external:c.externalVisible,eye:c.eyeLocal}})()")
 print(json.dumps({'cockpit':cockpit},ensure_ascii=False),flush=True)
 assert not cockpit['visible'] and cockpit['eye'][0]>.1,cockpit
 camera(page,'chase')
 result['corrida']={'fusca':f,'cockpit':cockpit}

 # Back on the menu: the Opala's body returns (the Fusca goes), the Opala tab and the story race Opalas.
 page.evaluate('interlagos.immersiveInfo();fixture.onMainMenu();true');wait_js(page,"!document.querySelector('#tracks').classList.contains('hidden')")
 after=page.evaluate(CARS);assert after['fusca'] is None and after['opalaShown'] and after['seatShift']==[0,0,0],after
 page.click('#tracksBack');wait_js(page,"interlagosCarros.info().live");page.click('#carsBack');page.click('#storyStart')
 page.click('#singleRace');wait_js(page,"interlagos.ready&&!interlagos.state.paused",timeout=240000);page.wait_for_timeout(600)
 story=page.evaluate(CARS);assert story['raceCar']=='99' and story['raceModel']=='opala' and story['fusca'] is None and story['opalaShown'],story
 storyField=page.evaluate(FIELD);assert storyField['models']==['opala']*14 and storyField['fuscasShown']==0,storyField
 result['historia']={'model':story['raceModel'],'raceCar':story['raceCar']}
 page.evaluate('interlagos.immersiveInfo();fixture.onMainMenu();true');wait_js(page,"!document.querySelector('#tracks').classList.contains('hidden')")

 # The Fusca 99: Stevan's black Fusca against the grid's 14 Fuscas; the 99's paint button is the Opala's, so it hides.
 page.click('#tracksBack');page.click('#start');wait_js(page,"(i=>i.live&&i.model==='fusca')(interlagosCarros.info())")
 page.click('#carCards [data-car="99"]');page.click('#carsNext');assert 'Fusca #99' in page.inner_text('#tracksPilot')
 page.click('#singleRace');wait_js(page,"interlagos.ready&&!interlagos.state.paused",timeout=240000);page.wait_for_timeout(600)
 own=page.evaluate(CARS);field99=page.evaluate(FIELD)
 assert own['raceModel']=='fusca' and own['raceCar']=='99' and own['fusca']['number']=='99' and not own['skin'] and not own['touchSkin'] and not own['opalaShown'],own
 assert '99' not in field99['rivals'] and len(field99['rivals'])==14 and not field99['opala99Shown'] and field99['models']==['fusca']*14,field99
 wait_race_start(page);page.keyboard.down('KeyW');page.wait_for_timeout(2500);page.keyboard.up('KeyW');shot(page,'fusca_99_corrida.png')
 result['fusca99']={'rivals':len(field99['rivals'])}
 page.evaluate('interlagos.immersiveInfo();fixture.onMainMenu();true');wait_js(page,"!document.querySelector('#tracks').classList.contains('hidden')")

 # Phones in landscape: the tabs and the 14 Fuscas on one screen.
 phone=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True)
 phone.add_init_script("""localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,car:'51',carModel:'fusca'}));""")
 small=phone.new_page();small.on('pageerror',lambda e:(errors.append(str(e)),print(str(e),flush=True)))
 small.goto(URL,wait_until='domcontentloaded');wait_js(small,"window.interlagos&&!document.querySelector('#start').disabled")
 small.fill('#pilotName','Piloto celular');small.tap('#start');wait_js(small,"(i=>i.live&&i.builtModel==='fusca'&&i.built==='51')(interlagosCarros.info())",timeout=180000)
 assert small.locator('#carCards [data-car]').count()==15
 fit=small.evaluate("""()=>{const c=document.querySelector('#cars'),r=s=>document.querySelector(s).getBoundingClientRect();return {width:document.documentElement.scrollWidth<=innerWidth,scroll:c.scrollHeight-c.clientHeight,next:r('#carsNext').bottom,tabs:r('#carModels').height,stage:r('#carStage').height,height:innerHeight}}""")
 shot(small,'fusca_celular.png')
 assert fit['width'] and fit['scroll']<=2 and fit['next']<=fit['height'] and fit['stage']>150,fit
 result['phone']=fit
 assert not errors,errors
 print(json.dumps({'passed':True,**result},ensure_ascii=False),flush=True)
 browser.close()
