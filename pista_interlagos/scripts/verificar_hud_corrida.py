from pathlib import Path
import json
from playwright.sync_api import sync_playwright
from browser_config import browser_executable,wait_js
ROOT=Path(__file__).resolve().parents[1];report={'checks':{},'errors':[]}
def check(name,value):report['checks'][name]=bool(value);print(name,bool(value),flush=True);assert value,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 context=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True,device_scale_factor=1)
 page=context.new_page();page.set_default_timeout(90000);page.on('pageerror',lambda e:report['errors'].append(str(e)))
 def shot(name):page.screenshot(path=str(ROOT/'renders'/f'hud_{name}.png'))
 try:
  page.goto('http://127.0.0.1:8799/pista_interlagos/teste/',wait_until='networkidle');wait_js(page,'window.interlagos?.ready')
  check('fullscreen_available_on_opening',page.is_visible('#startFullscreen'));page.tap('#startFullscreen');wait_js(page,'!!document.fullscreenElement');check('opening_fullscreen_enters',True);page.tap('#startFullscreen');wait_js(page,'!document.fullscreenElement')
  page.tap('#settingsButton');page.uncheck('#immersiveMode');page.select_option('#camera','aerial');page.tap('#settingsBack');page.tap('#start')
  wait_js(page,"interlagos.state.mode==='chase'");check('normal_starts_with_rear_camera',True)
  wait_js(page,"document.querySelector('#lap').textContent==='1 / 3'");page.wait_for_selector('#touchControls:not(.hidden)');check('three_laps_and_visible_position',page.is_visible('#racePosition') and page.inner_text('#racePosition')=='15º / 15')
  def check_control_layout(width):
   report.setdefault('layouts',{})[str(width)]=page.evaluate("()=>['#touchSteering','#touchPedals','#touchReverse','#touchHandbrake'].map(s=>({selector:s,...document.querySelector(s).getBoundingClientRect().toJSON()}))")
   check(f'steering_left_all_pedals_right_{width}',page.evaluate("()=>{const r=s=>document.querySelector(s).getBoundingClientRect();const steering=r('#touchSteering');const pedals=['#touchPedals','#touchReverse','#touchHandbrake'].map(r);return steering.right<innerWidth/2&&pedals.every(p=>p.left>innerWidth/2&&p.right<=innerWidth&&p.bottom<=innerHeight)&&pedals.every((a,i)=>pedals.slice(i+1).every(b=>a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top))&&pedals[0].height>pedals[0].width}"))
  check_control_layout(844)
  cdp=context.new_cdp_session(page);steer=page.locator('#touchSteering').bounding_box();gas=page.locator('#touchPedals').bounding_box();pedal={'x':gas['x']+gas['width']/2,'y':gas['y']+18,'id':1};center=steer['x']+steer['width']/2
  for selector,ratio in [('#touchSteering',.5),('#touchPedals',.2),('#touchPedals',.85)]:
   rect=page.locator(selector).bounding_box();stray={'x':rect['x']+rect['width']+12,'y':rect['y']+rect['height']*ratio,'id':8}
   check(f'near_control_test_hits_canvas_{selector}_{ratio}',page.evaluate('p=>document.elementFromPoint(p.x,p.y).id',stray)=='view')
   cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[stray]})
   for x in [stray['x']-40,420]:cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[dict(stray,x=x,y=200)]})
   cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});check(f'near_control_drag_does_not_move_camera_{selector}_{ratio}',page.evaluate("interlagos.state.mode==='chase'"))
  check('larger_steering_slider',steer['width']>=200)
  finger={'x':center+6,'y':steer['y']+steer['height']/2,'id':2};cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[pedal,finger]});wait_js(page,"interlagos.mobileInfo().throttle>.9");check('central_dead_zone_keeps_wheels_straight',page.evaluate('interlagos.mobileInfo().steering')==0)
  stray={'x':420,'y':200,'id':8};cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[pedal,finger,stray]});cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[pedal,finger,dict(stray,x=480)]});check('extra_touch_while_driving_keeps_camera_stable',page.evaluate("interlagos.state.mode==='chase'&&interlagos.mobileInfo().throttle>.9"));cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[pedal,finger]})
  finger['x']=center+20;cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[pedal,finger]});wait_js(page,'interlagos.mobileInfo().steering>.005');check('gentle_steering_near_center_with_gas',page.evaluate('interlagos.mobileInfo().steering')<.04)
  finger['x']=center+(steer['width']/2-22)*.5;cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[pedal,finger]});wait_js(page,'interlagos.mobileInfo().steering>.14');check('half_slider_gives_soft_steering',page.evaluate('interlagos.mobileInfo().steering')<.19)
  finger['x']=steer['x']+steer['width']-18;cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[pedal,finger]});wait_js(page,'interlagos.mobileInfo().steering===1');check('slider_end_reaches_full_steering',True)
  finger['x']=steer['x']+23;cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[pedal,finger]});wait_js(page,'interlagos.mobileInfo().steering<-.9&&interlagos.car.steer>0');check('same_finger_crosses_to_other_direction',True)
  cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});check('steering_recenters_on_release',page.evaluate('interlagos.mobileInfo().steering')==0 and not page.evaluate("interlagos.mobileInfo().throttle>.9"))
  def pedal_point(position):return dict(pedal,y=gas['y']+22+(gas['height']-44)*position)
  cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[pedal_point(.55)]});wait_js(page,'interlagos.mobileInfo().throttle>0');check('gentle_throttle_near_dead_zone',page.evaluate('interlagos.mobileInfo().throttle')<.02)
  for position,channel,low,high in [(.3,'throttle',.18,.25),(.62,'neutral',0,0),(.68,'neutral',0,0),(.75,'brake',.001,.04),(.85,'brake',.18,.25),(1,'brake',.999,1),(0,'throttle',.999,1)]:
   cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[pedal_point(position)]})
   if channel=='neutral':wait_js(page,'interlagos.mobileInfo().throttle===0&&interlagos.mobileInfo().brake===0')
   else:wait_js(page,f'interlagos.mobileInfo().{channel}>{low}&&interlagos.mobileInfo().{channel}<={high}');check(f'pedal_excludes_opposite_input_{position}',page.evaluate('interlagos.mobileInfo().brake' if channel=='throttle' else 'interlagos.mobileInfo().throttle')==0)
   check(f'pedal_60_10_30_response_{position}',True)
  cdp.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]});check('cancel_releases_both_pedals',page.evaluate('interlagos.mobileInfo().throttle===0&&interlagos.mobileInfo().brake===0'))
  check('keyboard_help_and_technical_hud_hidden',not page.is_visible('footer>div') and not page.is_visible('#cameraHint') and not page.is_visible('#telemetry .sensors'))
  page.tap('#touchHandbrake');page.wait_for_timeout(250);check('handbrake_latches_after_finger_released',page.evaluate("interlagos.mobileInfo().pressed.includes('Space')") and page.get_attribute('#touchHandbrake','aria-pressed')=='true')
  page.tap('#touchMenu');page.tap('#settingsResume');check('handbrake_remains_latched_after_pause',page.evaluate("interlagos.mobileInfo().pressed.includes('Space')"));page.tap('#touchHandbrake');check('second_tap_releases_handbrake',not page.evaluate("interlagos.mobileInfo().pressed.includes('Space')") and page.get_attribute('#touchHandbrake','aria-pressed')=='false')
  page.tap('#touchMenu');check('resume_labels',page.inner_text('#start')=='Voltar à pista →' and page.is_visible('#settingsResume'));page.tap('#settingsBack');check('resume_first_restart_second',page.evaluate("()=>[...document.querySelectorAll('#menu article>button')].filter(b=>b.getClientRects().length).slice(0,2).map(b=>b.id).join(',')==='start,restartRace'"));shot('menu_voltar_recomecar');before=page.evaluate('[interlagos.car.x,interlagos.car.y,interlagos.car.clock]');page.tap('#start');wait_js(page,'!interlagos.state.paused');check('resume_keeps_race_state',page.evaluate('interlagos.car.clock')>=before[2]);wait_js(page,'interlagos.car.clock>.5');check('stationary_player_does_not_lead_at_finish_line',page.inner_text('#racePosition')=='15º / 15');shot('mobile_limpo')
  page.evaluate("async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const original=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return original.call(this)};interlagos.immersiveInfo();}")
  page.evaluate('interlagos.car.laps=2');wait_js(page,"document.querySelector('#lap').textContent==='3 / 3'");check('third_lap_not_finished_early',not page.evaluate('fixtureMode.freeFinished'))
  page.evaluate('interlagos.car.laps=3');wait_js(page,'interlagos.state.paused&&fixtureMode.freeFinished');check('third_lap_finishes_with_result',page.is_visible('#raceResult') and '3 voltas' in page.inner_text('#raceResult'))
  page.tap('#start');wait_js(page,'!interlagos.state.paused');check('new_race_resets_laps',page.evaluate('interlagos.car.laps')==0 and not page.evaluate('fixtureMode.freeFinished'))
  page.evaluate('interlagos.car.laps=1');page.tap('#touchMenu');page.tap('#settingsBack');page.tap('#restartRace');check('explicit_restart_resets_race',page.evaluate("interlagos.car.laps===0&&interlagos.car.clock<.5&&interlagos.state.mode==='chase'"))
  page.tap('#touchMenu');page.check('#immersiveMode');page.tap('#settingsBack');page.tap('#start')
  page.evaluate("()=>{fixtureMode.state.cash=300;fixtureMode.action('prepare')}");page.wait_for_selector('#immLitres');page.wait_for_timeout(250);camera_before=page.evaluate('interlagos.cameraSnapshot().position')
  cdp=context.new_cdp_session(page);cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':380,'y':200,'id':9}]})
  for x in [400,420,440,460,480]:cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':200,'id':9}]})
  cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});wait_js(page,"interlagos.state.mode==='orbit'");check('drag_rotates_car_view_during_fuel_purchase',page.evaluate('interlagos.cameraSnapshot().position')!=camera_before);page.locator('#immLitres').fill('8');check('fuel_slider_still_works_while_orbiting',page.evaluate('fixtureMode.prepLitres')==8);shot('compra_orbita')
  page.evaluate("()=>{const m=fixtureMode;m.state.phase='race';m.state.fail('Pane de teste');m.state.beginTow();m.sync();}");wait_js(page,"document.body.classList.contains('tow-scene')")
  for width,height in [(844,390),(667,375)]:
   page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(250);shot(f'reboque_{width}')
   check_control_layout(width)
   check(f'tow_panel_leaves_center_visible_{width}',page.evaluate("()=>{const r=document.querySelector('#immersivePanel').getBoundingClientRect();return r.left>innerWidth*.5&&r.right<=innerWidth&&r.bottom<innerHeight-75}"))
   check(f'tow_panel_clear_of_pedals_{width}',page.evaluate("()=>{const panel=document.querySelector('#immersivePanel').getBoundingClientRect();return ['#touchPedals','#touchHandbrake'].every(s=>panel.bottom<document.querySelector(s).getBoundingClientRect().top)}"))
  page.tap('#touchMenu');page.uncheck('#immersiveMode');page.tap('#settingsBack');page.tap('#start');check('return_to_normal_uses_rear_camera',page.evaluate("interlagos.state.mode==='chase'"))
  check('no_browser_errors',not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_hud_corrida.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);browser.close()
