from browser_config import browser_executable, wait_js
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[1]
report={'errors':[],'checks':{}}
def check(name,value):
 report['checks'][name]=bool(value);print(name,bool(value),flush=True);assert value,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=['--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(90000)
 page.add_init_script("Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined,configurable:true})")
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def info():return page.evaluate('interlagos.audioInfo()')
 def speed(kmh,reset=False):page.evaluate('([v,reset])=>{if(reset)interlagos.reposition(600);const c=interlagos.car;c.vx=Math.cos(c.heading)*v/3.6;c.vy=Math.sin(c.heading)*v/3.6;}',[kmh,reset])
 try:
  page.goto('http://127.0.0.1:8799/pista_interlagos/teste/',wait_until='networkidle',timeout=120000);wait_js(page,'window.interlagos?.ready',timeout=120000);page.uncheck("#immersiveMode")
  check('silent_before_user_gesture',info()['context']=='locked')
  page.screenshot(path=str(ROOT/'renders/audio_opcoes.png'))
  page.click('#start');page.keyboard.down('KeyS');wait_js(page,"interlagos.audioInfo().context==='running'&&interlagos.audioInfo().rms>.001")
  check('engine_outputs_audio_after_start',info()['rpm']==950 and info()['rms']>.001)
  page.keyboard.up('KeyS');page.keyboard.down('KeyW');speed(30,True)
  wait_js(page,'interlagos.audioInfo().rpm>4000');report['accelerating']=info()
  shifts=info()['shifts'];speed(46);wait_js(page,'(n)=>interlagos.audioInfo().shifts>n',arg=shifts)
  check('upshift_and_rpm_drop',info()['gear']==2 and info()['rpm']<report['accelerating']['rpm']);page.keyboard.up('KeyW')
  shifts=info()['shifts'];speed(38);wait_js(page,'(n)=>interlagos.audioInfo().shifts>n',arg=shifts)
  check('downshift',info()['gear']==1)
  speed(65,True);page.keyboard.down('Space');page.keyboard.down('KeyA');wait_js(page,'interlagos.audioInfo().skid>.2')
  check('skid_sound_tracks_tyre_marks',info()['skid']>.2 and page.evaluate('interlagos.skidInfo().totalSegments')>0)
  page.keyboard.up('Space');page.keyboard.up('KeyA');page.keyboard.press('KeyM');wait_js(page,'interlagos.audioInfo().rms<.00001')
  check('mute_silences_output',info()['muted']);page.keyboard.press('KeyM');wait_js(page,'interlagos.audioInfo().rms>.001')
  check('unmute_restores_output',not info()['muted'])
  page.keyboard.press('KeyP');wait_js(page,'interlagos.audioInfo().rms<.00001');check('pause_silences_output',info()['paused'])
  page.locator('#volume').fill('30');check('volume_control',abs(info()['volume']-.3)<1e-6)
  # Render the actual Web Audio graph offline: verifies nonzero, distinct and unclipped waveforms.
  report['offline']=page.evaluate('''async()=>{
   const {CarAudio}=await import('./car-audio.js');const result={};
   for(const [name,kmh,gas,slip] of [['idle',0,0,0],['engine',35,1,0],['skid',35,1,.8]]){
    const ctx=new OfflineAudioContext(1,48000,48000),a=new CarAudio();a.volume=.55;a.muted=false;a.build(ctx);
    a.update({vx:kmh/3.6,vy:0,surface:{onRoad:true}},{throttle:gas},slip,false,'chase');
    const data=(await ctx.startRendering()).getChannelData(0);let sum=0,peak=0,crossings=0;
    for(let i=12000;i<data.length;i++){sum+=data[i]*data[i];peak=Math.max(peak,Math.abs(data[i]));if(data[i-1]<0&&data[i]>=0)crossings++;}
    result[name]={rms:Math.sqrt(sum/36000),peak,crossings,rpm:a.state.rpm};
   }
   return result;
  }''')
  sounds=report['offline'];check('audio_graph_has_signal_without_clipping',all(.001<s['rms']<.5 and s['peak']<.99 for s in sounds.values()))
  check('engine_pitch_rises_with_rpm',sounds['engine']['crossings']>sounds['idle']['crossings']*2)
  check('skid_adds_distinct_high_frequency_sound',sounds['skid']['crossings']>sounds['engine']['crossings'])
  page.reload(wait_until='networkidle');wait_js(page,'window.interlagos?.ready',timeout=120000);page.uncheck("#immersiveMode")
  check('volume_persists',abs(info()['volume']-.3)<1e-6)
  check('no_browser_audio_errors',not report['errors'] and not info()['error']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_audio.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);browser.close()
