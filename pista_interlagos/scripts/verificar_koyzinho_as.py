"""Browser check for the race option "Koyzinho Indestrutível": off by default; switched on in the race
settings, Koyzinho (#2) races as the ace, starts just ahead of the player and climbs the field.

Ticks the option (01 Corrida), starts the free race (Modo Corrida), reads the live RaceField through the fixtureMode hook, checks the
grid and photographs it from the chase camera, then lets the rivals race a seeded start (seed 6, as the
Node checks do: every start draws a new race otherwise) and checks that the ace is moving up the
order, on the asphalt. Honours INTERLAGOS_URL (default: the 8799 server)."""
import json
import os
from pathlib import Path
from browser_config import browser_executable, browser_args, wait_js, open_menu, enter_track, wait_race_start, GAME_URL
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
HOOK = """async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const old=ImmersiveMode.prototype.info;
ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return old.call(this)};interlagos.immersiveInfo();return true;}"""
FIELD = """()=>{const f=fixtureMode.field,L=fixtureMode.data.meta.reconstructed_xy_m,ace=f.rivals.find(r=>r.style.ace),car=interlagos.car;
const ahead=r=>((r.car.surface.s-car.surface.s)%L+L)%L;
return {ace:{number:ace.entry.number,name:ace.entry.name,slot:ace.slot,style:ace.style.name,ahead:ahead(ace),lane:ace.car.surface.d,progress:ace.progress,stun:ace.stun,onRoad:ace.car.surface.onRoad},
 rivals:f.rivals.map(r=>({number:r.entry.number,ahead:ahead(r),progress:r.progress})),time:f.time};}"""
report = {'errors': []}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1280, 'height': 720})
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' else None)
    open_menu(page, URL)
    page.click('#settingsButton')
    page.click('#tab-race')
    assert not page.is_checked('#aceKoyzinho'), 'the option starts switched off'
    page.check('#aceKoyzinho')
    page.screenshot(path=str(ROOT / 'renders/koyzinho_as_opcao.png'))
    page.click('#settingsClose')
    assert page.evaluate("JSON.parse(localStorage.getItem('opala99-preferences-v1')).aceKoyzinho") is True
    enter_track(page)
    roster = page.evaluate("document.querySelector('#gridRoster').textContent")
    assert 'Koyzinho” Bechtold · Indestrutível' in roster, roster
    page.evaluate(HOOK)
    page.evaluate('()=>{const m=fixtureMode;m.field.seed=6;m.field.reset(interlagos.car.surface.s,{grid:true});m.rivals=m.field.rivals;}')
    grid = page.evaluate(FIELD)
    report['grid'] = grid
    ace = grid['ace']
    assert ace['number'] == '2' and ace['style'] == 'Ás', ace
    assert ace['slot'] == len(grid['rivals']) - 1, 'the ace takes the last rival slot'
    assert ace['ahead'] == min(r['ahead'] for r in grid['rivals']) and ace['ahead'] < 20, 'the ace starts just ahead of the player'
    frame = page.evaluate('interlagos.cockpitInfo().renderedFrame')
    wait_js(page, f'interlagos.cockpitInfo().renderedFrame>{frame+2}')
    page.screenshot(path=str(ROOT / 'renders/koyzinho_as_grid.png'))
    wait_race_start(page)
    # The player stays on the grid; the rivals race. A minute in, the ace is already near the front.
    wait_js(page, 'fixtureMode.field.time>60', timeout=240000)
    race = page.evaluate(FIELD)
    report['race'] = race
    order = sorted(race['rivals'], key=lambda r: -r['progress'])
    place = [r['number'] for r in order].index('2') + 1
    report['placeAfter60s'] = place
    assert place <= 5, f'the ace climbs from 14th: {place}'
    assert race['ace']['onRoad'] and race['ace']['stun'] == 0
    page.close()
    # The recon lap races the same field (the option is kept); N rides along with Koyzinho for a picture.
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    open_menu(page, URL)
    page.fill('#pilotName', 'Piloto reconhecimento')
    page.click('#settingsButton')
    page.click('#tab-tour')
    page.click('#tour')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused&&interlagos.state.automatic', timeout=180000)
    page.evaluate("()=>{const s=document.querySelector('#camera');s.value='chase';s.dispatchEvent(new Event('change'));}")
    for _ in range(15):
        if page.evaluate('interlagos.watchInfo().number') == '2':
            break
        page.keyboard.press('KeyN')
        page.wait_for_timeout(200)
    assert page.evaluate('interlagos.watchInfo().number') == '2', 'N reaches Koyzinho'
    page.evaluate(HOOK)
    assert page.evaluate("fixtureMode.field.rivals.find(r=>r.entry.number==='2').style.ace"), 'the recon lap races the ace too'
    page.wait_for_timeout(20000)
    page.screenshot(path=str(ROOT / 'renders/koyzinho_as_corrida.png'))
    browser.close()
print(json.dumps({k: v for k, v in report.items() if k != 'grid'}, indent=1, ensure_ascii=False), flush=True)
assert not report['errors'], report['errors']
print('option, ace grid slot, start and climb verified')
