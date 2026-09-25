from browser_config import browser_executable, browser_args, wait_js, open_menu, race_options, enter_track
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
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def frame():page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 def move(x,y):page.evaluate('([x,y])=>document.dispatchEvent(new MouseEvent("mousemove",{movementX:x,movementY:y}))',[x,y]);frame()
 def structure():return page.evaluate('interlagos.structureInfo()')
 try:
  open_menu(page);race_options(page,immersive=False);enter_track(page)
  check('v04_structural_panels_loaded',structure()['parts']==1 and structure()['revision']=='v04_fechamentos')
  # The free race starts behind the car; switch to the interior on track.
  page.click('#cockpitButton');page.keyboard.down('KeyS');frame()
  # Inside, the game's controls sit in the V06 body, lowered onto its floor: the body and its
  # structure (floor, walls) show, the old box interior and its cabin shell do not.
  inside_v06="(()=>{const c=interlagos.cockpitInfo();return c.externalVisible&&!c.view.classic&&!c.view.cabin&&c.view.drop<0;})()"
  check('v06_body_round_the_controls',structure()['visible'] and page.evaluate(inside_v06))
  page.screenshot(path=str(ROOT/'renders/fechamento_interna_frente.png'))
  page.locator('#view').click(position={'x':800,'y':430});wait_js(page,'interlagos.viewControls().pointerLocked');move(0,300)
  check('look_down_active',page.evaluate('interlagos.viewControls().pitch<-.5'))
  page.screenshot(path=str(ROOT/'renders/fechamento_interna_pes.png'))
  move(500,0);page.screenshot(path=str(ROOT/'renders/fechamento_interna_passageiro.png'))
  page.keyboard.press('KeyV');wait_js(page,"interlagos.state.livery==='seiva_danilo'");frame()
  check('second_skin_keeps_interior_and_driver',structure()['visible'] and structure()['parts']==1 and page.evaluate(inside_v06) and page.evaluate('interlagos.driverInfo().helmet.balaclava'))
  check('mirror_still_current',page.evaluate('interlagos.cockpitInfo().mirrorFrame===interlagos.cockpitInfo().renderedFrame'))
  page.screenshot(path=str(ROOT/'renders/fechamento_interna_seiva.png'))
  # The classic setting brings back the old box interior (its shell, at its own height) instead of the body.
  classic=lambda on:page.evaluate("on=>{const c=document.querySelector('#classicInterior');c.checked=on;c.dispatchEvent(new Event('change'));}",on)
  classic(True);frame()
  check('classic_interior_replaces_body',not structure()['visible'] and page.evaluate('(()=>{const c=interlagos.cockpitInfo();return !c.externalVisible&&c.view.classic&&c.view.cabin&&c.view.drop===0;})()'))
  page.screenshot(path=str(ROOT/'renders/fechamento_interna_classica.png'))
  classic(False);frame()
  page.keyboard.up('KeyS');page.keyboard.press('KeyP');race_options(page,camera='orbit');enter_track(page);page.keyboard.down('KeyS')
  page.locator('#view').click(position={'x':800,'y':430});wait_js(page,'interlagos.viewControls().pointerLocked');move(650,-550)
  page.screenshot(path=str(ROOT/'renders/fechamento_externa_baixa.png'))
  check('external_structure_and_wheels_preserved',structure()['visible'] and page.evaluate('interlagos.state.wheels===4&&interlagos.cockpitInfo().externalVisible'))
  check('no_browser_errors',not report['errors']);report['passed']=True
 finally:
  report.setdefault('passed',False);(ROOT/'dados/validacao_fechamentos_browser.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True);browser.close()
