"""The two TVs in Box 99's garage and the team stand's monitors show the current track's records,
in a real browser.

Left TV: best laps; right TV: best races over the standard distance; people and the AI together,
for the mode being played. The stand's three monitors add the other mode's best laps. A new record for the pilot shows up on them within a couple of
seconds, and Curvelo shows its own board. Photos: renders/tv_recordes_<circuit>*.png.

Usage, from the repo root, with the local server running (INTERLAGOS_URL for another port):
  python pista_interlagos/scripts/verificar_tv_recordes.py
"""
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, GAME_URL
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os
ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
report = {'errors': [], 'checks': {}}


def check(name, value):
    report['checks'][name] = bool(value); print(name, bool(value), flush=True); assert value, name


SHOWN = 'fixtureMode.visual.layout.recordsShown'


def run(page, circuit):
    open_menu(page, URL); enter_track(page, pilot='Tester TV', story=True)
    page.evaluate('''async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const original=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return original.call(this)};interlagos.immersiveInfo();}''')
    wait_js(page, "fixtureMode.state.phase==='crowd'")
    check('circuit_' + circuit, page.evaluate('interlagos.circuit') == circuit)
    # The pilot in front of the garage door, looking at the two TVs.
    page.evaluate('''()=>{const v=fixtureMode.visual,L=v.lane,b=v.layout.pit.box99,x=b.bay/2-1.15,p=L.point(x,b.front-2.2),o=v.crowd.position;v.hero.position.set(p.x,fixtureMode.walkGround(p.clone().add(o),99)-o.y,p.z);v.foot.floor=v.hero.position.y+o.y;v.foot.yaw=v.hero.rotation.y=L.heading+Math.PI/2;v.foot.pitch=.05;v.foot.distance=1.6;v.followPosition=null;}''')
    wait_js(page, '!!' + SHOWN); page.wait_for_timeout(1200); page.screenshot(path=str(ROOT / 'renders' / f'tv_recordes_{circuit}.png'))
    shown = page.evaluate(SHOWN); name = {'interlagos': 'INTERLAGOS', 'curvelo': 'OVAL DE CURVELO'}[circuit]
    check('tvs_titled_for_track_' + circuit, shown['title'] == 'RECORDES · ' + name and shown['mode'] == 'immersive')
    check('stand_shows_other_mode_' + circuit, shown['other']['mode'] == 'normal' and len(shown['other']['lap']) == 8 and all(r['ai'] for r in shown['other']['lap']))
    check('tvs_list_track_records_' + circuit, len(shown['lap']) == 8 and all(r['time'] != '—' for r in shown['lap'] + shown['race']) and [r['place'] for r in shown['lap']] == sorted(r['place'] for r in shown['lap']))
    # A new best lap for the pilot is saved by the game (lap-records.js) and reaches the TVs.
    page.evaluate('''async()=>{const {saveRecord}=await import('./lap-records.js');saveRecord(localStorage,{name:'Tester TV',circuit:interlagos.circuit,mode:'immersive',bestLap:interlagos.circuit==='curvelo'?20:90,bestRace:null});}''')
    wait_js(page, SHOWN + ".lap.some(r=>r.me)", timeout=5000)
    mine = [r for r in page.evaluate(SHOWN + '.lap') if r['me']][0]
    check('new_record_reaches_tvs_' + circuit, mine['place'] == 1 and mine['number'] == '99' and mine['name'] == 'Tester TV')
    page.wait_for_timeout(600); page.screenshot(path=str(ROOT / 'renders' / f'tv_recordes_{circuit}_novo.png'))
    # The team stand's monitors, from the registration circle beside the engineers.
    page.evaluate('''()=>{const m=fixtureMode,v=m.visual,s=v.desk.spot;m.deskInside=true;document.querySelector('#immersivePanel').style.visibility='hidden';v.hero.position.copy(s);v.foot.floor=s.y+v.crowd.position.y;v.foot.lift=0;v.foot.yaw=v.lane.heading-.9;v.foot.pitch=.34;v.foot.distance=.15;v.foot.zoomFov=34;v.followPosition=null;}''')
    page.wait_for_timeout(1500); page.screenshot(path=str(ROOT / 'renders' / f'tv_recordes_{circuit}_barraca.png'))


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    try:
        for circuit in ['interlagos', 'curvelo']:
            context = browser.new_context(viewport={'width': 1280, 'height': 800})
            context.add_init_script(f"localStorage.setItem('opala99-preferences-v1',JSON.stringify({{...JSON.parse(localStorage.getItem('opala99-preferences-v1')||'{{}}'),circuit:'{circuit}'}}))")
            page = context.new_page(); page.set_default_timeout(120000)
            page.on('pageerror', lambda e: report['errors'].append(str(e)))
            page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' else None)
            run(page, circuit); context.close()
        check('no_browser_errors', not report['errors']); report['passed'] = True
    finally:
        report.setdefault('passed', False)
        print(json.dumps(report, ensure_ascii=False, indent=2), flush=True); browser.close()
