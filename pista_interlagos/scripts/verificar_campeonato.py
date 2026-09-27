"""Championship in the browser: four rounds in a row, points on the result sheet, the next
round from there, resuming after a reload and the final standings.

    python verificar_campeonato.py [porta]

Each round is finished on the spot (the player's lap count is set to the race distance), so
the player wins every round; screenshots go to renders/campeonato_*.png.
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js, wait_race_start

PORT = sys.argv[1] if len(sys.argv) > 1 else '8799'
URL = f'http://127.0.0.1:{PORT}/pista_interlagos/teste/'
ROOT = Path(__file__).resolve().parents[1]
ROUNDS = ['interlagos', 'cascavel', 'piracicaba', 'curvelo']
NAMES = {'cascavel': 'Cascavel', 'piracicaba': 'ECPA Piracicaba', 'curvelo': 'Oval de Curvelo'}
FIXTURE = """async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const old=ImmersiveMode.prototype.info;
 ImmersiveMode.prototype.info=function(){window.fixture=this;return old.call(this)};interlagos.immersiveInfo();}"""
errors = []
report = {}


def finish_round(page, k):
    circuit = ROUNDS[k]
    wait_js(page, f"interlagos.ready&&interlagos.circuit==='{circuit}'&&!interlagos.state.paused", timeout=240000)
    page.evaluate('interlagos.skipIntro?.()')
    assert f'ETAPA {k + 1}/4' in page.inner_text('header .session'), page.inner_text('header .session')
    wait_race_start(page)
    page.evaluate(FIXTURE)
    page.evaluate('interlagos.car.laps=fixture.freeTotalLaps')
    wait_js(page, "interlagos.state.paused&&fixture.freeFinished&&!document.querySelector('#raceResults').hidden", timeout=60000)
    line = page.inner_text('#resultsChampionshipLine')
    rows = page.locator('#raceResults tbody tr').count()
    points = page.locator('#raceResults tbody td.results-points').count()
    assert page.is_visible('#resultsChampionship') and rows == 15 and points == 15, (rows, points)
    assert '+25 pts' in line, line
    report[circuit] = {'line': line, 'continue': page.inner_text('#resultsContinue')}
    return line


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1280, 'height': 760})
    context.add_init_script("if(!sessionStorage.getItem('champ-test')){localStorage.removeItem('opala99-championship-v1');sessionStorage.setItem('champ-test','1');}")
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: (errors.append(str(e)), print('pageerror', e, flush=True)))
    page.goto(URL + '?intro=0', wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#play').disabled")
    page.fill('#pilotName', 'Piloto campeonato')
    page.click('#play')
    assert page.inner_text('#championshipStart').startswith('Começar campeonato')
    page.click('#championshipStart')
    finish_round(page, 0)
    assert page.inner_text('#resultsContinue') == 'Próxima etapa: Cascavel →'
    page.screenshot(path=str(ROOT / 'renders/campeonato_etapa1.png'))
    # Leave, reload: the championship resumes at round 2.
    page.click('#resultsMainMenu')
    wait_js(page, "!document.querySelector('#tracks').classList.contains('hidden')")
    assert page.inner_text('#championshipStart') == 'Correr a etapa 2 →', page.inner_text('#championshipStart')
    assert page.locator('#championshipCalendar li.done').count() == 1 and page.is_visible('#championshipTableButton')
    page.screenshot(path=str(ROOT / 'renders/campeonato_pistas.png'))
    page.reload(wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#play').disabled")
    page.click('#play')
    assert page.inner_text('#championshipStart') == 'Correr a etapa 2 →'
    page.click('#championshipStart')
    for k in (1, 2, 3):
        finish_round(page, k)
        if k < 3:
            assert page.inner_text('#resultsContinue') == f'Próxima etapa: {NAMES[ROUNDS[k + 1]]} →'
            page.click('#resultsContinue')
    assert page.inner_text('#resultsContinue') == 'Ver a classificação final →'
    assert 'CAMPEÃO' in page.inner_text('#resultsChampionshipLine')
    page.screenshot(path=str(ROOT / 'renders/campeonato_final_resultado.png'))
    page.click('#resultsContinue')
    wait_js(page, "document.querySelector('#championshipDialog').open")
    assert page.locator('#championshipDialog tbody tr').count() == 15
    assert 'CAMPEÃO' in page.inner_text('#championshipBanner')
    first = page.inner_text('#championshipDialog tbody tr:first-child')
    assert '100' in first and 'VOCÊ' in first, first
    page.screenshot(path=str(ROOT / 'renders/campeonato_classificacao.png'))
    page.click('#championshipClose')
    page.click('#resultsMainMenu')
    wait_js(page, "!document.querySelector('#tracks').classList.contains('hidden')")
    assert page.inner_text('#championshipStart') == 'Novo campeonato →'
    assert 'encerrado' in page.inner_text('#championshipStatus')
    browser.close()
assert not errors, errors
print(json.dumps({'passed': True, **report}, ensure_ascii=False, indent=1))
