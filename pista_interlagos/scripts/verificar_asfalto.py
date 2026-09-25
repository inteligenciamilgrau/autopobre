"""Visual QA of the asphalt PBR maps and live rival tyre marks."""
from browser_config import browser_executable,browser_args,wait_js,open_menu,enter_track
from pathlib import Path
from playwright.sync_api import sync_playwright
import json

ROOT=Path(__file__).resolve().parents[1]
report={'errors':[],'views':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 for mobile,width,height in [(False,1280,720),(True,844,390)]:
  context=browser.new_context(viewport={'width':width,'height':height},is_mobile=mobile,has_touch=mobile,device_scale_factor=1)
  page=context.new_page();page.set_default_timeout(90000)
  page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
  open_menu(page);enter_track(page)
  page.evaluate("""async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const original=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return original.call(this)};interlagos.immersiveInfo();fixtureMode.stepFree=()=>{};interlagos.car.step=()=>{};}""")
  for mode,index in [('hood',85),('chase',700)]:
   page.evaluate("([mode,index])=>{interlagos.reposition(index);const s=document.querySelector('#camera');s.value=mode;s.dispatchEvent(new Event('change'))}",[mode,index])
   frame=page.evaluate('interlagos.cockpitInfo().renderedFrame');wait_js(page,f'interlagos.cockpitInfo().renderedFrame>{frame+1}')
   page.screenshot(path=str(ROOT/f'renders/asfalto_v2_{mode}_{"mobile" if mobile else "desktop"}.png'))
   info=page.evaluate('interlagos.surfaceInfo()');assert info['pbr'] and info['vertices']>10000 and info['resolution']==2048
   report['views'].append({'mobile':mobile,'mode':mode,**info})
  page.evaluate("()=>{fixtureMode.car.x+=10000;for(let i=0;i<120*45;i++)fixtureMode.field.step(fixtureMode.car,1/120,3)}")
  counts=page.evaluate('fixtureMode.rivalTrails.map(t=>t.wheels.reduce((s,w)=>s+w.segments,0))');assert all(n>0 for n in counts),counts
  report['mobileRivalMarks' if mobile else 'desktopRivalMarks']=counts
  page.evaluate("()=>{const info=interlagos.skidInfo(),mesh=fixtureMode.visual.root.parent.getObjectByName('Marcas_de_derrapagem'),a=mesh.geometry.attributes.position,k=((info.totalSegments-300+info.capacity)%info.capacity)*4,p=fixtureMode.car.sample(a.getX(k),-a.getZ(k));interlagos.reposition(Math.max(0,p.i-12));const select=document.querySelector('#camera');select.value='hood';select.dispatchEvent(new Event('change'));}")
  frame=page.evaluate('interlagos.cockpitInfo().renderedFrame');wait_js(page,f'interlagos.cockpitInfo().renderedFrame>{frame+1}')
  page.screenshot(path=str(ROOT/f'renders/asfalto_v2_borracha_{"mobile" if mobile else "desktop"}.png'))
  print('asphalt and rival marks verified',mobile,counts,flush=True);context.close()
 browser.close()
report['passed']=not report['errors'];(ROOT/'dados/validacao_asfalto.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);assert report['passed']
