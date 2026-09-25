"""Render every original cue, then verify the real game's mix and scene routing."""
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[1]
report={'checks':{},'errors':[]}
def check(name,value):
 report['checks'][name]=bool(value);print(name,bool(value),flush=True);assert value,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(90000)
 # Verify the original fallback score even when the owner has supplied MP3s.
 page.route('**/assets/audio/tracks.json',lambda route:route.fulfill(status=200,content_type='application/json',body='[]'))
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 page.add_init_script("Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined,configurable:true})")
 def info():return page.evaluate('interlagos.audioInfo()')
 def frame():page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 def event(name):wait_js(page,'name=>(interlagos.audioInfo().effects?.counts[name]??0)>0',arg=name)
 try:
  open_menu(page)
  check('locked_before_gesture',info()['context']=='locked')
  page.click('#settingsButton');page.click('#tab-audio');wait_js(page,"interlagos.audioInfo().music?.theme==='opening'&&interlagos.audioInfo().rms>.001")
  check('opening_after_gesture',info()['music']['playing']);page.screenshot(path=str(ROOT/'renders/audio_configuracoes.png'))
  for selector,value in [('volume','60'),('musicVolume','28'),('effectsVolume','75')]:page.locator('#'+selector).fill(value)
  check('independent_controls',info()['volume']==.6 and info()['musicVolume']==.28 and info()['effectsVolume']==.75)
  page.locator('#musicVolume').fill('0');wait_js(page,'!interlagos.audioInfo().music.playing&&interlagos.audioInfo().rms<.00001');check('music_zero_silences_menu',True)
  page.locator('#musicVolume').fill('28');page.click('#settingsBack');enter_track(page,story=True);event('crowdWelcome');wait_js(page,"interlagos.audioInfo().music.theme==='menu'")
  page.evaluate('''async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const original=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return original.call(this)};interlagos.immersiveInfo();}''')
  page.evaluate("()=>{fixtureMode.state.talk(0);fixtureMode.state.joke(0)}");event('donation')
  page.evaluate("()=>{const s=fixtureMode.state;s.phase='starting';s.starter=true;s.pressure=.4;fixtureMode.sync();}");wait_js(page,'interlagos.audioInfo().effects.loops.starter>0');check('starter_loop_matches_crank',True)
  page.evaluate("()=>{const s=fixtureMode.state;s.phase='grid';s.fuel=10;s.countdown=3;s.startRace();fixtureMode.sync();}");event('raceGo');wait_js(page,"interlagos.audioInfo().music.theme==='race'")
  page.evaluate("()=>{fixtureMode.state.hitCar();fixtureMode.state.hitDebris();fixtureMode.state.tankWear=1;fixtureMode.state.fuel=3;fixtureMode.state.raceStep({speed:20,throttle:1,offTrack:5},.1);}");event('collision');event('glassHit');event('tankDrop');check('impact_events_reach_audio',True)
  page.evaluate("()=>{const s=fixtureMode.state;s.fuel=.0001;s.raceStep({speed:20,throttle:1},.1);fixtureMode.sync();}");event('fuelEmpty');wait_js(page,"interlagos.audioInfo().music.theme==='defeat'")
  page.evaluate('fixtureMode.state.beginTow()');event('towArrive');wait_js(page,'interlagos.audioInfo().effects.loops.tow>0');check('tow_engine_runs',True)
  page.evaluate("()=>{const s=fixtureMode.state;s.podium();s.leavePodium();s.requestInspection();fixtureMode.sync();}");event('judgeStart')
  page.evaluate('fixtureMode.state.inspectionStep(8)');event('judgeApprove');event('podiumLoss')
  page.evaluate("()=>{const m=fixtureMode;m.start();m.state.phase='race';m.state.finish(1);m.state.requestInspection();m.state.inspectionStep(8);m.sync();}");event('podiumWin');wait_js(page,"interlagos.audioInfo().music.theme==='victory'");check('winner_theme_despite_sixth_podium',page.evaluate('interlagos.immersiveInfo().podiumPlace')==6)
  page.keyboard.press('KeyP');wait_js(page,"interlagos.audioInfo().worldGain<.00001&&interlagos.audioInfo().music.theme==='menu'");check('pause_keeps_menu_music_only',True)
  page.keyboard.press('Escape');page.click('#settingsButton');page.click('#tab-audio');page.locator('#effectsVolume').fill('0');wait_js(page,'interlagos.audioInfo().rms>.001');check('effects_zero_keeps_music',True)
  page.click('#mute');wait_js(page,'interlagos.audioInfo().rms<.00001');check('global_mute_silences_everything',True)
  page.click('#mute');page.locator('#volume').fill('0');wait_js(page,'interlagos.audioInfo().rms<.00001');check('global_zero_silences_everything',True)
  page.locator('#volume').fill('60');page.locator('#effectsVolume').fill('75');page.evaluate("window.dispatchEvent(new Event('blur'))");wait_js(page,'interlagos.audioInfo().rms<.00001');check('blur_silences_music_too',not info()['focused']);page.evaluate("window.dispatchEvent(new Event('focus'))")
  # Real OfflineAudioContext rendering, independent of speakers/headless audio output.
  report['rendered']=page.evaluate('''async()=>{
   const {SoundEffects,EFFECT_NAMES}=await import('./sound-effects.js');const {GameMusic,MUSIC_THEMES}=await import('./game-music.js');const result={};
   const metric=data=>{let sum=0,peak=0,crossings=0;for(let i=0;i<data.length;i++){if(!Number.isFinite(data[i]))throw Error('Nonfinite sample');sum+=data[i]**2;peak=Math.max(peak,Math.abs(data[i]));if(i&&data[i-1]<0&&data[i]>=0)crossings++;}return {rms:Math.sqrt(sum/data.length),peak,crossings};};
   for(const name of [...EFFECT_NAMES,...Object.keys(MUSIC_THEMES)]){
    const ctx=new OfflineAudioContext(2,48000*5,48000),out=ctx.createGain();out.gain.value=.55;out.connect(ctx.destination);
    const noise=ctx.createBuffer(1,48000,48000);let seed=99;for(let i=0;i<48000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;noise.getChannelData(0)[i]=seed/2147483648-1;}
    if(MUSIC_THEMES[name]){const m=new GameMusic(ctx,out,noise);m.theme=name;for(let i=0;i<8;i++)m.arrange(i,i*30/MUSIC_THEMES[name].bpm);}
    else new SoundEffects(ctx,out,out,noise).play(name);
    const data=(await ctx.startRendering()).getChannelData(0);result[name]=metric(data);
   }return result;
  }''')
  effects=page.evaluate("async()=>(await import('./sound-effects.js')).EFFECT_NAMES.length")
  check('every_effect_and_5_themes_render',len(report['rendered'])==effects+5)
  check('all_cues_audible_finite_unclipped',all(.00005<v['rms']<.5 and v['peak']<.99 for v in report['rendered'].values()))
  check('five_distinct_compositions',len({report['rendered'][k]['crossings'] for k in ['opening','menu','race','victory','defeat']})==5)
  check('bounded_live_music_voices',info()['music']['peakVoices']<=128)
  open_menu(page);a=info();check('all_mix_preferences_survive_reload',a['volume']==.6 and a['musicVolume']==.28 and a['effectsVolume']==.75)
  check('no_browser_errors',not report['errors'] and not a['error']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_trilha.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);browser.close()
