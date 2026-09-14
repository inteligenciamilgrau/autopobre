"""Check keyboard/touch inputs reach the same high-speed steering physics."""
from playwright.sync_api import sync_playwright
from browser_config import browser_executable,wait_js
import json
report={'errors':[],'controls':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for mobile in [False,True]:
  context=browser.new_context(viewport={'width':844,'height':390},is_mobile=mobile,has_touch=mobile)
  page=context.new_page();page.set_default_timeout(120000)
  page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.goto('http://127.0.0.1:8799/pista_interlagos/teste/',wait_until='networkidle');wait_js(page,'window.interlagos?.ready')
  page.click('#settingsButton');page.uncheck('#immersiveMode');page.click('#settingsBack');page.click('#start')
  page.evaluate("""async()=>{const {ImmersiveMode}=await import('./immersive-mode.js'),old=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return old.call(this)};interlagos.immersiveInfo();fixtureMode.stepFree=()=>{};const c=interlagos.car;window.physicsStep=c.step.bind(c);c.step=input=>{window.lastInput={...input}};c.sample=()=>({i:0,u:0,s:500,d:0,z:.055,width:1000,bank:0,grade:0,gx:0,gy:0,tx:1,ty:0,lx:0,ly:1,onRoad:true});c.reset();c.heading=0;c.vx=50;c.vy=0;c.surface=c.sample();}""")
  session=context.new_cdp_session(page)
  def touch(position,event='touchMove'):
   b=page.locator('#touchSteering').bounding_box()
   session.send('Input.dispatchTouchEvent',{'type':event,'touchPoints':[{'x':b['x']+b['width']/2+position*(b['width']/2-22),'y':b['y']+b['height']/2,'id':1}]})
  if mobile:
   touch(-.05,'touchStart');wait_js(page,'window.lastInput&&interlagos.mobileInfo().steering===0')
   assert page.evaluate('lastInput.left===0&&lastInput.right===0')
   touch(-.25);wait_js(page,'interlagos.mobileInfo().steering<0')
   assert page.evaluate('Math.abs(interlagos.mobileInfo().steering)<.03')
   touch(-1)
  else:page.keyboard.down('a')
  wait_js(page,'window.lastInput?.left>.99')
  page.evaluate('()=>{for(let i=0;i<240;i++)physicsStep(lastInput,1/120)}')
  assert page.evaluate('interlagos.car.steer>0&&interlagos.car.yaw>0')
  if mobile:touch(1)
  else:page.keyboard.up('a');page.keyboard.down('d')
  wait_js(page,'lastInput.right>.99&&lastInput.left===0')
  result=page.evaluate("""()=>{const c=interlagos.car;let reverse=null;for(let i=0;i<30;i++){physicsStep(lastInput,1/120);if(reverse===null&&c.yaw<0)reverse=(i+1)/120;}return {reverse,steer:c.steer,yaw:c.yaw,mode:interlagos.state.mode}}""")
  assert result['reverse']<=.1 and result['steer']<0 and result['mode']=='chase'
  if mobile:session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
  else:page.keyboard.up('d')
  wait_js(page,'lastInput.left===0&&lastInput.right===0')
  report['controls'].append({'mobile':mobile,**result});print(json.dumps(report['controls'][-1]),flush=True);context.close()
 browser.close()
assert not report['errors'],report['errors']
print(json.dumps(report,indent=2),flush=True)
