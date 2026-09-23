"""Salto e capotagem no navegador: pose fisica renderizada, rodas penduradas, HUD e fiscais."""
from browser_config import GAME_URL, browser_executable, browser_args, wait_js, open_menu, race_options, enter_track, wait_race_start
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,os
ROOT=Path(__file__).resolve().parents[1]
report={'errors':[],'checks':{},'metrics':{}}
def check(name,value):
 report['checks'][name]=bool(value);print(name,bool(value),flush=True);assert value,name
# Probe cars in the page find a real bank that launches a car leaving the road at 160 km/h
# with the throttle held; the live car then gets the same input, so it repeats the same crash.
FIND_RAMP='''()=>{const car=interlagos.car,Probe=car.constructor,data=car.data,idle={throttle:1,brake:0,left:0,right:0,reverse:0,handbrake:0};let best=null;
 for(let i=0;i<data.samples.length;i+=24)for(const side of [-1,1]){const c=new Probe(data);c.reset(i);const p=c.surface;c.heading=Math.atan2(p.ty,p.tx)+side*.45;c.x+=p.lx*side*3;c.y+=p.ly*side*3;c.vx=Math.cos(c.heading)*160/3.6;c.vy=Math.sin(c.heading)*160/3.6;c.settle();
  let air=0,longest=0,minUp=1;for(let k=0;k<600;k++){c.step(idle,1/120);if(c.wallImpactSpeed>0)break;air=c.wheelsDown===0&&!c.hullContact?air+1/120:0;longest=Math.max(longest,air);minUp=Math.min(minUp,c.upright);}
  const score=longest+(minUp<0?1:0);if(!best||score>best.score)best={i,side,score,longest,minUp};}
 return best;}'''
LAUNCH='''spot=>{const c=interlagos.car;interlagos.reposition(spot.i);const p=c.surface;c.heading=Math.atan2(p.ty,p.tx)+spot.side*.45;c.x+=p.lx*spot.side*3;c.y+=p.ly*spot.side*3;
 c.vx=Math.cos(c.heading)*160/3.6;c.vy=Math.sin(c.heading)*160/3.6;c.settle();return true;}'''
POSE='''()=>{const c=interlagos.car,p=c.pose(),snap=interlagos.cameraSnapshot();return {height:c.z-c.surface.z,wheelsDown:c.wheelsDown,hull:c.hullContact,upright:c.upright,overturned:c.overturned,rightings:c.rightings,travel:[...c.wheelTravel],
 airTime:c.airTime,renderError:Math.hypot(snap.car[0]-p.x,snap.car[1]-p.z,snap.car[2]+p.y),hud:document.querySelector('#surface').textContent,speed:Math.hypot(c.vx,c.vy)*3.6};}'''
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(90000)
 page.add_init_script("Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined,configurable:true})")
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 try:
  open_menu(page,os.environ.get('INTERLAGOS_URL',GAME_URL));race_options(page,immersive=False,camera='chase');enter_track(page);wait_race_start(page)
  spot=page.evaluate(FIND_RAMP);report['metrics']['spot']=spot;check('found_a_launching_bank',spot and spot['longest']>1)
  page.keyboard.down('KeyW');page.evaluate(LAUNCH,spot)
  # Airborne: the rendered body follows the physics pose and the wheels hang down.
  airborne=wait_js(page,f'(()=>{{const s=({POSE})();return s.wheelsDown===0&&!s.hull&&s.height>1.8&&s.travel.every(t=>t<-.08)&&s.hud==="NO AR!"?s:null;}})()',timeout=20000)
  report['metrics']['airborne']=airborne;page.screenshot(path=str(ROOT/'renders/capotagem_no_ar.png'))
  check('car_leaves_the_ground_at_speed',airborne['height']>1.8)
  check('rendered_body_matches_physics_pose',airborne['renderError']<.05)
  check('wheels_hang_on_extended_suspension',all(t<-.08 for t in airborne['travel']))
  check('hud_announces_the_jump',airborne['hud']=='NO AR!')
  # This bank rolls the car when the search says so.
  if spot['minUp']<0:
   rolled=wait_js(page,f'(()=>{{const s=({POSE})();return s.upright<0?s:null;}})()',timeout=20000);report['metrics']['rolled']=rolled
   page.screenshot(path=str(ROOT/'renders/capotagem_capotando.png'));check('car_rolls_over',rolled['upright']<0)
  settled=wait_js(page,f'(()=>{{const s=({POSE})();return s.overturned>.5||s.wheelsDown===4&&s.upright>.9&&s.speed<60?s:null;}})()',timeout=30000)
  report['metrics']['settled']=settled;page.keyboard.up('KeyW')
  # Dropped onto its roof at rest: the HUD counts down and the marshals right it.
  page.evaluate('''()=>{const c=interlagos.car;interlagos.reposition(c.index);c.roll=Math.PI;c.z+=1.2;c.stepX=c.x;c.stepY=c.y;return true;}''')
  rest=wait_js(page,f'(()=>{{const s=({POSE})();return s.overturned>.5&&s.hud.startsWith("CAPOTADO")?s:null;}})()',timeout=30000);report['metrics']['overturned']=rest
  page.screenshot(path=str(ROOT/'renders/capotagem_fiscais.png'))
  check('car_rests_on_its_roof',rest['upright']<-.9)
  check('hud_counts_down_to_the_marshals',rest['hud'].startswith('CAPOTADO'))
  righted=wait_js(page,f'(()=>{{const s=({POSE})();return s.rightings>0&&s.upright>.95?s:null;}})()',timeout=15000);report['metrics']['righted']=righted
  check('marshals_put_the_car_back_on_its_wheels',righted['rightings']>=1)
  check('hud_reports_the_marshals',wait_js(page,"document.querySelector('#surface').textContent==='FISCAIS DESVIRARAM O CARRO'",timeout=3000))
  check('no_page_errors',not report['errors'])
 finally:
  report['passed']=all(report['checks'].values()) and not report['errors']
  (ROOT/'dados/validacao_capotagem_browser.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf8')
  browser.close()
