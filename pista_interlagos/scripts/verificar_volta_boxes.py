"""Depois da bandeirada os rivais entram no pit lane e estacionam em fila (jogo real, Interlagos).

Os catorze rivais recebem a bandeirada antes da entrada dos boxes; a simulação corre até todos
pararem nas vagas, e o Opala para na faixa rápida olhando a fila. INTERLAGOS_URL troca o servidor."""
from browser_config import GAME_URL,browser_executable,browser_args,wait_js,open_menu,enter_track,wait_race_start
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,os
ROOT=Path(__file__).resolve().parents[1]
report={'checks':{},'errors':[]}
def check(name,value):report['checks'][name]=bool(value);print(name,bool(value),flush=True);assert value,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(90000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.add_init_script("Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined,configurable:true})")
 try:
  open_menu(page,os.environ.get("INTERLAGOS_URL",GAME_URL));enter_track(page);wait_race_start(page)
  page.evaluate('''async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const original=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return original.call(this)};interlagos.immersiveInfo();}''')
  wait_js(page,'window.fixtureMode?.field')
  # Every rival takes the flag 60-420 m before the pit entry, on the pit side of the road.
  page.evaluate('''()=>{const m=fixtureMode,f=m.field,R=f.route,L=m.data.meta.reconstructed_xy_m;
   f.rivals.forEach((r,k)=>{const c=r.car,s=((R.entryS-60-k*28)%L+L)%L;c.reset(Math.max(0,m.data.samples.findIndex(p=>p[0]>=s)));c.x+=c.surface.lx*R.entryD;c.y+=c.surface.ly*R.entryD;c.surface=c.sample(c.x,c.y);c.index=c.surface.i;c.settle?.();c.vx=Math.cos(c.heading)*20;c.vy=Math.sin(c.heading)*20;
    Object.assign(r,{lastS:c.surface.s,finished:true,finishTime:f.time-30,mode:'line',rival:null,lane:R.entryD,blend:1,blendTarget:1,pit:null,stun:0});});}''')
  check('route_and_slots',page.evaluate('fixtureMode.field.route.slots.length>=14'))
  # Midway: cars in the lane, entering in a line.
  page.evaluate('()=>{const m=fixtureMode;for(let i=0;i<120*14;i++)m.field.step(m.car,1/120,m.freeTotalLaps);}')
  check('cars_in_pit_lane',page.evaluate('fixtureMode.field.rivals.filter(r=>r.pit).length>=3'))
  for _ in range(40):
   if page.evaluate('()=>{const m=fixtureMode;for(let i=0;i<120*5;i++)m.field.step(m.car,1/120,m.freeTotalLaps);return m.field.rivals.every(r=>r.pit?.parked)}'):break
  info=page.evaluate('interlagos.immersiveInfo().field.rivals')
  check('all_fourteen_parked',sum(r['pit']=='parked' for r in info)==14)
  check('parked_on_pit_lane',page.evaluate('fixtureMode.field.rivals.every(r=>r.car.surface.pit)'))
  check('parked_cars_do_not_touch',page.evaluate('''async()=>{const {bodyContact}=await import('./race-field.js');const cars=fixtureMode.field.rivals.map(r=>r.car);return cars.every((a,i)=>cars.every((b,j)=>j<=i||!bodyContact(a,b)));}'''))
  # The Opala stops on the fast lane beside Box 99, looking down the queue.
  page.evaluate('''()=>{const m=fixtureMode,R=m.field.route,p=R.at(R.slots[13].u-16),c=m.car;c.x=p.x-p.ty*p.fast;c.y=p.y+p.tx*p.fast;c.heading=Math.atan2(p.ty,p.tx);c.vx=c.vy=c.yaw=0;c.surface=c.sample(c.x,c.y);c.index=c.surface.i;c.settle?.();}''')
  page.wait_for_timeout(2500)
  models=page.evaluate('''()=>{const m=fixtureMode;return m.visual.rivals.map((o,i)=>({visible:o.visible,parent:!!o.parent,off:Math.hypot(o.position.x-m.field.rivals[i].car.x,o.position.z+m.field.rivals[i].car.y)}));}''')
  report['models']=models
  check('rival_models_follow_the_cars',all(m['visible'] and m['off']<.5 for m in models))
  page.screenshot(path=str(ROOT/'renders/rivais_estacionados_boxes.png'))
  check('no_browser_errors',not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_volta_boxes.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);browser.close()
