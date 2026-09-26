"""Exercise real supplied MP3s through the game's streaming music bus."""
from browser_config import browser_executable,browser_args,wait_js,open_menu,enter_track
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[1]
report={'checks':{},'errors':[]}
def check(name,value):report['checks'][name]=bool(value);print(name,bool(value),flush=True);assert value,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=browser_executable(),headless=True,args=browser_args())
 page=browser.new_page(viewport={'width':1280,'height':800});page.set_default_timeout(90000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 try:
  open_menu(page);page.click('#settingsButton');page.click('#tab-audio')
  page.locator('#musicVolume').fill('0');page.locator('#effectsVolume').fill('45');wait_js(page,"(interlagos.audioInfo().effects?.counts.preview??0)>0&&interlagos.audioInfo().rms>.0001");check('effects_slider_has_audible_preview',True)
  page.locator('#effectsVolume').fill('0');page.locator('#musicVolume').fill('35')
  wait_js(page,'interlagos.audioInfo().recordings?.available.length>0');available=page.evaluate('interlagos.audioInfo().recordings.available');report['files']=available
  if 'intro.mp3' in available:
   wait_js(page,"interlagos.audioInfo().recordings.file==='intro.mp3'&&interlagos.audioInfo().rms>.001");check('intro_streams_on_opening',True)
  page.click('#settingsBack');enter_track(page,story=True)
  page.evaluate('''async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const original=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return original.call(this)};interlagos.immersiveInfo();}''')
  if 'patrocinio.mp3' in available:
   wait_js(page,"interlagos.audioInfo().recordings.file==='patrocinio.mp3'&&interlagos.audioInfo().rms>.001");check('sponsor_track_in_paddock',True)
  page.evaluate("()=>{const s=fixtureMode.state;s.phase='grid';s.fuel=10;s.startRace();fixtureMode.sync();}")
  if 'race.mp3' in available:
   wait_js(page,"interlagos.audioInfo().recordings.file==='race.mp3'&&interlagos.audioInfo().rms>.001");check('race_streams_with_synth_silent',not page.evaluate('interlagos.audioInfo().music.playing'))
  page.keyboard.press('KeyM');wait_js(page,'interlagos.audioInfo().rms<.00001');check('mute_cuts_mp3',True);page.keyboard.press('KeyM')
  page.evaluate("()=>{const s=fixtureMode.state;s.finish(1);s.leavePodium();s.requestInspection();s.inspectionStep(8);fixtureMode.sync();}")
  if 'turbo.mp3' in available:
   wait_js(page,"interlagos.audioInfo().recordings.file==='turbo.mp3'&&interlagos.audioInfo().rms>.001");check('turbo_on_victory',True)
  page.evaluate("()=>{const m=fixtureMode;m.start();m.state.phase='race';m.state.fail('Teste de derrota');m.sync();}")
  if 'hojenaodeu.mp3' in available:
   wait_js(page,"interlagos.audioInfo().recordings.file==='hojenaodeu.mp3'&&interlagos.audioInfo().rms>.001");check('defeat_mp3',True)
  else:
   wait_js(page,"interlagos.audioInfo().music.theme==='defeat'&&interlagos.audioInfo().music.playing");check('missing_defeat_uses_original',True)
  page.evaluate("window.dispatchEvent(new Event('blur'))");wait_js(page,'interlagos.audioInfo().rms<.00001');check('blur_pauses_recording',not page.evaluate('interlagos.audioInfo().recordings.playing'))
  page.evaluate("window.dispatchEvent(new Event('focus'))")
  if 'energia.mp3' in available:
   wait_js(page,"interlagos.audioInfo().recordings.file==='energia.mp3'&&interlagos.audioInfo().rms>.001");check('energy_in_menus',True)
  # Missing-file fallback and same-file scene transitions use the real streaming rack.
  check('energy_fallback',page.evaluate('''async()=>{const {RecordedMusic}=await import('./recorded-music.js');const ctx=new AudioContext(),out=ctx.createGain();out.gain.value=0;out.connect(ctx.destination);const m=new RecordedMusic(ctx,out);await m.ready;m.files=['energia.mp3'];const ok=['opening','sponsor','race','victory','defeat','menu'].every(t=>m.fileFor(t)==='energia.mp3');m.update('opening',false);m.ended=true;m.update('menu',false);const changed=!m.ended&&m.players[m.index].audio.loop;m.suspend();await ctx.close();return ok&&changed;}'''))
  check('no_media_error',not page.evaluate('interlagos.audioInfo().recordings.error') and not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_mp3.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);browser.close()
