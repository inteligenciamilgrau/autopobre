from browser_config import browser_executable,browser_args,wait_js,open_menu,enter_track
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[1]
report={'checks':{},'errors':[]}
def check(name,value):report['checks'][name]=bool(value);print(name,bool(value),flush=True);assert value,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(90000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.add_init_script("Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined,configurable:true})")
 try:
  open_menu(page)
  page.click('#settingsButton');check('dedicated_modal_settings',page.evaluate("document.querySelector('#settings').matches(':modal')"))
  page.screenshot(path=str(ROOT/'renders/configuracoes_corrida.png'));page.click('#tab-controls');page.screenshot(path=str(ROOT/'renders/configuracoes_controles.png'))
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(ROOT/'renders/configuracoes_mobile.png'))
  check('settings_fit_mobile',page.evaluate("()=>{const r=document.querySelector('#settings').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}"))
  page.set_viewport_size({'width':1440,'height':900});page.click('#settingsBack');enter_track(page)
  page.evaluate('''async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const original=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return original.call(this)};interlagos.immersiveInfo();}''')
  wait_js(page,"fixtureMode.visual.followPosition!==null&&fixtureMode.visual.followPosition!==undefined")
  before=page.evaluate('interlagos.immersiveInfo().hero');camera_before=page.evaluate('interlagos.cameraSnapshot().position')
  page.screenshot(path=str(ROOT/'renders/boxes_terceira_pessoa.png'))
  check('close_camera_and_four_parked_cars',page.evaluate('''()=>{const v=fixtureMode.visual,p=v.hero.getWorldPosition(v.hero.position.clone()),c=interlagos.cameraSnapshot().position;return Math.hypot(c[0]-p.x,c[1]-p.y,c[2]-p.z)<8&&c[1]>p.y+2&&v.parked.length===4;}'''))
  target=page.evaluate('''()=>{const m=fixtureMode,p=m.visual.fans[2].person.getWorldPosition(m.visual.hero.position.clone());p.y+=1.2;p.project(m.camera);return [(p.x*.5+.5)*innerWidth,(-p.y*.5+.5)*innerHeight];}''');page.mouse.click(*target);wait_js(page,'fixtureMode.state.fan===2');check('click_person_walks_and_opens_dialogue',True)
  check('camera_follows_walking_player',page.evaluate('interlagos.immersiveInfo().hero')!=before and page.evaluate('interlagos.cameraSnapshot().position')!=camera_before)
  check('opposite_arms_and_legs',page.evaluate('''()=>{const v=fixtureMode.visual;v.foot.cycle=.7;v.walk({throttle:1,brake:0,left:0,right:0},.06);const a=v.hero.userData.limbs.map(x=>x.rotation.z);return a[0]*a[2]<0&&a[1]*a[3]<0&&a[0]*a[3]>0&&a[1]*a[2]>0;}'''))
  check('camera_behind_hero',page.evaluate('''()=>{const v=fixtureMode.visual,p=v.hero.getWorldPosition(v.hero.position.clone()),c=interlagos.cameraSnapshot().position;return (c[0]-p.x)*Math.cos(v.hero.rotation.y)-(c[2]-p.z)*Math.sin(v.hero.rotation.y)<-3;}'''))
  page.wait_for_selector('[data-action="joke:0"]');page.screenshot(path=str(ROOT/'renders/boxes_conversa.png'))
  page.click('[data-action="joke:0"]');check('clicking_speech_gets_immediate_reply',bool(page.evaluate('fixtureMode.state.feedback')))
  page.click('[data-action="joke:2"]');wait_js(page,'fixtureMode.state.fan===null');check('donation_closes_dialogue_immediately',page.evaluate('fixtureMode.state.donors.includes(2)'))
  check('dollar_only_on_non_donors',page.evaluate('fixtureMode.visual.fans.every((f,i)=>f.dollar.visible===!fixtureMode.state.donors.includes(i))'))
  page.evaluate('''async()=>{const {FANS,JOKES}=await import('./immersive-state.js');const m=fixtureMode,s=m.state;for(let i=0;i<FANS.length;i++){s.talk(i);s.joke(JOKES.findIndex(j=>j.topic===FANS[i].taste));}m.action('close');m.action('prepare');}''');wait_js(page,"interlagos.immersiveInfo().phase==='prepare'")
  page.screenshot(path=str(ROOT/'renders/grid_compra_gasolina.png'))
  check('fuel_purchase_has_rear_camera_and_revving_grid',page.evaluate('''()=>{const m=fixtureMode,c=m.car,p=interlagos.cameraSnapshot().position;return (p[0]-c.x)*Math.cos(c.heading)+(-p[2]-c.y)*Math.sin(c.heading)<-6&&m.visual.rivals.every(x=>x.visible)&&interlagos.audioInfo().effects.loops.rival0>0;}'''))
  page.click('#menuButton');page.click('#tab-race');page.uncheck('#immersiveMode');page.click('#settingsBack');enter_track(page)
  wait_js(page,'interlagos.immersiveInfo().field.rivals.every(r=>r.speed>1)');check('normal_mode_has_fourteen_moving_rivals',len(page.evaluate('interlagos.immersiveInfo().field.rivals'))==14 and not page.evaluate('interlagos.immersiveInfo().active'))
  check('fuel_gauge_visible_in_normal_race',page.is_visible('#fuelGauge') and page.evaluate("document.querySelector('#fuelBar').value>0"))
  page.evaluate('fixtureMode.freeFuel=.6');wait_js(page,"document.querySelector('#fuelGauge').classList.contains('reserve')");check('fuel_reserve_warning',page.inner_text('#fuelStatus')=='RESERVA');page.screenshot(path=str(ROOT/'renders/corrida_mapa_combustivel.png'))
  page.evaluate('''()=>{const m=fixtureMode,c=m.car,r=m.field.rivals[0].car;c.x=r.x-Math.cos(r.heading)*4.4;c.y=r.y-Math.sin(r.heading)*4.4;c.heading=r.heading;c.vx=Math.cos(c.heading)*30;c.vy=Math.sin(c.heading)*30;c.surface=c.sample(c.x,c.y);c.index=c.surface.i;}''')
  wait_js(page,'interlagos.immersiveInfo().parts.total>0');check('impact_emits_visible_parts',page.evaluate('interlagos.immersiveInfo().parts.active')>0)
  page.screenshot(path=str(ROOT/'renders/colisao_pecas.png'))
  check('cars_separated_after_impact',page.evaluate('''async()=>{const {bodyContact}=await import('./race-field.js');return fixtureMode.field.rivals.every(r=>{const h=bodyContact(fixtureMode.car,r.car);return !h||h.depth<.03});}'''))
  page.keyboard.press('KeyP');wait_js(page,'interlagos.state.paused');frozen=page.evaluate('interlagos.immersiveInfo().field.rivals');page.wait_for_timeout(250);check('rivals_pause_with_player',page.evaluate('interlagos.immersiveInfo().field.rivals')==frozen)
  check('bounded_fragments',page.evaluate('interlagos.immersiveInfo().parts.active<=60'));check('no_browser_errors',not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_corrida_boxes.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);browser.close()
