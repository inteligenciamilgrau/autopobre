from browser_config import browser_executable, browser_args, wait_js, open_menu, race_options, enter_track, wait_race_start
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,math
ROOT=Path(__file__).resolve().parents[1]
report={'errors':[],'checks':{}}
def check(name,value):
 report['checks'][name]=bool(value);print(name,bool(value),flush=True);assert value,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(90000)
 page.add_init_script("Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined,configurable:true})")
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def sample(count=8):
  return page.evaluate('''count=>new Promise(resolve=>{
   const frames=[];
   function tick(){const i=interlagos.cockpitInfo();frames.push({frame:i.renderedFrame,mirror:i.mirrorFrame,eye:i.mirrorEyeLocal,clock:interlagos.car.clock});
    if(frames.length===count)resolve(frames);else requestAnimationFrame(tick);}
   requestAnimationFrame(tick);
  })''',count)
 def synced(frames):
  return all(f['frame']==f['mirror'] and math.dist(f['eye'],[-.65,1.14,0])<1e-6 for f in frames) and len(set(f['frame'] for f in frames))==len(frames)
 try:
  # The free race starts behind the car; switch to the interior on track.
  open_menu(page);enter_track(page);page.click('#cockpitButton')
  frames=sample();check('every_cockpit_frame_has_fresh_reflection',synced(frames))
  wait_race_start(page);page.evaluate('()=>{interlagos.reposition(600);const c=interlagos.car;c.vx=Math.cos(c.heading)*15;c.vy=Math.sin(c.heading)*15;}')
  page.keyboard.down('KeyA');frames=sample(12);page.keyboard.up('KeyA')
  check('moving_and_turning_stays_synchronized',synced(frames) and frames[-1]['clock']>frames[0]['clock'])
  report['moving_frames']=frames
  page.screenshot(path=str(ROOT/'renders/retrovisor_sincronizado.png'))
  page.keyboard.press('KeyP');page.evaluate('interlagos.reposition(800)');frames=sample(3)
  check('paused_reposition_refreshes_immediately',synced(frames) and frames[0]['clock']==frames[-1]['clock'])
  race_options(page,camera='chase');frames=sample(4)
  check('external_view_skips_mirror_render',len(set(f['mirror'] for f in frames))==1 and frames[-1]['frame']>frames[0]['frame'])
  race_options(page,camera='cockpit');frames=sample(3)
  check('return_to_cockpit_has_no_stale_frame',synced(frames))
  race_options(page,livery='seiva_danilo');frames=sample(3)
  check('second_livery_synchronized',synced(frames))
  check('no_browser_or_shader_errors',not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_retrovisor.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);browser.close()
