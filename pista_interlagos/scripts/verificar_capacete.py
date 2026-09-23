from browser_config import browser_executable, browser_args, wait_js, open_menu, race_options, enter_track, wait_race_start
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
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
 def frame():page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 try:
  open_menu(page);race_options(page,immersive=False);enter_track(page);page.click('#cockpitButton')
  info=page.evaluate('interlagos.driverInfo()');report['driver']=info
  check('helmet_and_balaclava_loaded',info['helmet']['balaclava'] and info['helmet']['visor']=='raised')
  check('helmet_fits_below_roof',info['headHeight']<1.36)
  page.keyboard.down('KeyS');wait_race_start(page);frame()
  page.screenshot(path=str(ROOT/'renders/capacete_interna.png'))
  page.keyboard.up('KeyS');page.evaluate('()=>{interlagos.reposition(600);const c=interlagos.car;c.vx=Math.cos(c.heading)*12;c.vy=Math.sin(c.heading)*12;}');page.keyboard.down('KeyA')
  wait_js(page,'interlagos.driverInfo().lean<-.035');page.keyboard.up('KeyA');frame()
  info=page.evaluate('interlagos.driverInfo()');check('animation_and_hands_preserved',all(a['reachable'] for a in info['arms']) and info['lean']<-.02)
  page.screenshot(path=str(ROOT/'renders/capacete_curva.png'))
  race_options(page,camera='chase');page.evaluate('interlagos.reposition(600)');race_options(page,camera='orbit');enter_track(page);page.keyboard.down('KeyS')
  page.mouse.move(600,450);page.mouse.down();page.mouse.move(1050,450,steps=8);page.mouse.up();page.mouse.wheel(0,-700);frame();page.screenshot(path=str(ROOT/'renders/capacete_externa.png'));page.keyboard.up('KeyS')
  race_options(page,livery='seiva_danilo');check('helmet_in_both_liveries',page.evaluate('interlagos.driverInfo().helmet.balaclava'))
  # Close-up inspection of the same production asset, without the car obscuring its details.
  report['geometry']=page.evaluate('''async()=>{
   const THREE=await import('three'),{createHelmet}=await import('./driver-helmet.js');
   const helmet=await createHelmet(),scene=new THREE.Scene();scene.background=new THREE.Color('#52616c');scene.add(helmet.root);
   scene.add(new THREE.HemisphereLight(0xffffff,0x5e626c,2.2));const light=new THREE.DirectionalLight(0xffffff,3.2);light.position.set(2,3,1);scene.add(light);
   const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(900,900);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.domElement.id='helmetPreview';renderer.domElement.style.cssText='position:fixed;inset:0;z-index:9999';document.body.append(renderer.domElement);
   const camera=new THREE.PerspectiveCamera(38,1,.01,10);window.helmetPreview={scene,renderer,camera};
   const box=new THREE.Box3().setFromObject(helmet.root),size=box.getSize(new THREE.Vector3());let triangles=0;
   helmet.root.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
   return {size:size.toArray(),triangles};
  }''')
  for name,eye in [('frente',[.66,.06,0]),('tres_quartos',[.52,.10,.48]),('lateral',[.015,.055,.66])]:
   page.evaluate('(eye)=>{const {camera,renderer,scene}=helmetPreview;camera.position.set(...eye);camera.lookAt(0,-.008,0);renderer.render(scene,camera);}',eye)
   page.locator('#helmetPreview').screenshot(path=str(ROOT/f'renders/capacete_{name}.png'))
  check('bounded_helmet_geometry',report['geometry']['triangles']<20000)
  check('no_browser_errors',not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_capacete.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);browser.close()
