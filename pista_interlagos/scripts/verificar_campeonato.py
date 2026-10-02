"""Championships in the browser, one per mode.

    python verificar_campeonato.py [porta]

Modo Corrida: five rounds in a row, points on the result sheet, the next round from there,
resuming after a reload and the final standings. Each round is finished on the spot (the
player's lap count is set to the race distance), so the player wins every round.
Modo História: its own championship; a round finished at the flag scores on the result sheet,
the box before the judge's inspection disqualifies (0 points) and the next vaquinha is the next
round; a round towed in scores nothing. Screenshots go to renders/campeonato_*.png.
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js, wait_race_start

PORT = sys.argv[1] if len(sys.argv) > 1 else '8799'
URL = f'http://127.0.0.1:{PORT}/pista_interlagos/teste/'
ROOT = Path(__file__).resolve().parents[1]
ROUNDS = ['interlagos', 'cascavel', 'piracicaba', 'chapeco', 'curvelo']
NAMES = {'cascavel': 'Cascavel', 'piracicaba': 'ECPA Piracicaba', 'chapeco': 'Chapecó', 'curvelo': 'Oval de Curvelo'}
STORY_KEY = 'opala99-championship-historia-v1'
FIXTURE = """async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const old=ImmersiveMode.prototype.info;
 ImmersiveMode.prototype.info=function(){window.fixture=this;return old.call(this)};interlagos.immersiveInfo();}"""
errors = []
report = {}


def finish_round(page, k):
    circuit = ROUNDS[k]
    wait_js(page, f"interlagos.ready&&interlagos.circuit==='{circuit}'&&!interlagos.state.paused", timeout=240000)
    page.evaluate('interlagos.skipIntro?.()')
    assert f'ETAPA {k + 1}/{len(ROUNDS)}' in page.inner_text('header .session'), page.inner_text('header .session')
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


def story_round(page, circuit):
    """A Modo História round loaded and on the grid: the paddock is skipped."""
    wait_js(page, f"interlagos.ready&&interlagos.circuit==='{circuit}'&&!interlagos.state.paused", timeout=240000)
    page.evaluate(FIXTURE)
    wait_js(page, "fixture.active&&fixture.state.phase==='crowd'")
    page.evaluate("()=>{const m=fixture;m.state.cash=300;m.state.fuel=6;m.state.phase='race';m.sync();}")


def story_saved(page):
    return page.evaluate(f"JSON.parse(localStorage.getItem('{STORY_KEY}'))")


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1280, 'height': 760})
    context.add_init_script(f"if(!sessionStorage.getItem('champ-test')){{localStorage.removeItem('opala99-championship-v1');localStorage.removeItem('{STORY_KEY}');sessionStorage.setItem('champ-test','1');}}")
    page = context.new_page()
    page.set_default_timeout(120000)
    page.on('pageerror', lambda e: (errors.append(str(e)), print('pageerror', e, flush=True)))
    page.goto(URL + '?intro=0', wait_until='domcontentloaded')
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    page.fill('#pilotName', 'Piloto campeonato')
    # Modo Corrida, then the championship on the track screen.
    page.click('#start')
    page.click('#carsNext')
    assert page.get_attribute('#tracks', 'data-mode') == 'corrida'
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
    wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
    page.click('#start')
    page.click('#carsNext')
    assert page.inner_text('#championshipStart') == 'Correr a etapa 2 →'
    page.click('#championshipStart')
    for k in range(1, len(ROUNDS)):
        finish_round(page, k)
        if k < len(ROUNDS) - 1:
            assert page.inner_text('#resultsContinue') == f'Próxima etapa: {NAMES[ROUNDS[k + 1]]} →'
            page.click('#resultsContinue')
    assert page.inner_text('#resultsContinue') == 'Ver a classificação final →'
    assert 'CAMPEÃO' in page.inner_text('#resultsChampionshipLine')
    page.screenshot(path=str(ROOT / 'renders/campeonato_final_resultado.png'))
    page.click('#resultsContinue')
    wait_js(page, "document.querySelector('#championshipDialog').open")
    assert page.locator('#championshipDialog tbody tr').count() == 15
    assert 'CAMPEÃO' in page.inner_text('#championshipBanner') and 'MODO CORRIDA' in page.inner_text('#championshipDialogMode')
    first = page.inner_text('#championshipDialog tbody tr:first-child')
    assert str(25 * len(ROUNDS)) in first and 'VOCÊ' in first, first
    page.screenshot(path=str(ROOT / 'renders/campeonato_classificacao.png'))
    page.click('#championshipClose')
    page.click('#resultsMainMenu')
    wait_js(page, "!document.querySelector('#tracks').classList.contains('hidden')")
    assert page.inner_text('#championshipStart') == 'Novo campeonato →'
    assert 'encerrado' in page.inner_text('#championshipStatus')

    # Modo História: a championship of its own.
    page.click('#tracksBack')
    page.click('#carsBack')
    page.click('#storyStart')
    assert page.get_attribute('#tracks', 'data-mode') == 'historia' and 'MODO HISTÓRIA' in page.inner_text('#championshipKicker')
    assert page.inner_text('#championshipStart').startswith('Começar campeonato'), page.inner_text('#championshipStart')
    page.screenshot(path=str(ROOT / 'renders/campeonato_historia_pistas.png'))
    page.click('#championshipStart')
    # Round 1 finished at the flag: points on the sheet, then the podium.
    story_round(page, 'interlagos')
    page.evaluate('interlagos.car.laps=fixture.storyLaps')
    wait_js(page, "fixture.state.phase==='podium'&&!document.querySelector('#raceResults').hidden", timeout=60000)
    line = page.inner_text('#resultsChampionshipLine')
    assert 'CAMPEONATO' in line and 'pts' in line and f'HISTÓRIA · CAMPEONATO · ETAPA 1 DE {len(ROUNDS)}' in page.inner_text('#resultsMode'), line
    assert page.locator('#raceResults tbody td.results-points').count() == 15
    assert page.inner_text('#resultsContinue') == 'Continuar para o pódio →'
    scored = story_saved(page)['results'][0]['rows']
    mine = next(r for r in scored if r['player'])
    report['historia_1'] = {'line': line, 'position': mine['position'], 'points': mine['points']}
    page.screenshot(path=str(ROOT / 'renders/campeonato_historia_resultado.png'))
    page.click('#resultsContinue')
    # The box before the judge: disqualified, the round's points go, and the next vaquinha is round 2.
    page.evaluate("fixture.action('afterPodium')")
    wait_js(page, "fixture.state.phase==='inspection'")
    page.evaluate("fixture.action('box')")
    wait_js(page, "fixture.state.phase==='disqualified'")
    wait_js(page, f"(()=>{{const r=JSON.parse(localStorage.getItem('{STORY_KEY}')).results[0].rows.find(r=>r.player);return r.dsq&&r.points===0}})()")
    story_round(page, 'cascavel')
    assert f'ETAPA 2/{len(ROUNDS)}' in page.inner_text('header .session') or page.evaluate('fixture.active')
    # Round 2 towed in: no points, the player last.
    page.evaluate("()=>{const m=fixture;m.state.fail('Pane de teste');m.state.podium();m.sync();}")
    wait_js(page, f"JSON.parse(localStorage.getItem('{STORY_KEY}')).results.length===2")
    rows = story_saved(page)['results'][1]['rows']
    assert rows[-1]['player'] and rows[-1].get('dnf') and rows[-1]['points'] == 0 and len(rows) == 15, rows[-1]
    page.click('[data-action="mainMenu"]')
    wait_js(page, "!document.querySelector('#tracks').classList.contains('hidden')")
    assert page.get_attribute('#tracks', 'data-mode') == 'historia'
    calendar = page.inner_text('#championshipCalendar')
    assert 'DSQ' in calendar and 'AB' in calendar and page.inner_text('#championshipStart') == 'Correr a etapa 3 →', calendar
    page.screenshot(path=str(ROOT / 'renders/campeonato_historia_calendario.png'))
    page.click('#championshipTableButton')
    wait_js(page, "document.querySelector('#championshipDialog').open")
    player_row = page.inner_text('#championshipDialog tbody tr.player')
    assert 'DSQ' in player_row and 'AB' in player_row and 'MODO HISTÓRIA' in page.inner_text('#championshipDialogMode'), player_row
    page.screenshot(path=str(ROOT / 'renders/campeonato_historia_classificacao.png'))
    page.click('#championshipClose')
    # The race championship is untouched.
    page.click('#tracksBack')
    page.click('#start')
    page.click('#carsNext')
    assert page.inner_text('#championshipStart') == 'Novo campeonato →'
    report['historia'] = {'calendar': calendar.split('\n'), 'player': player_row}
    browser.close()
assert not errors, errors
print(json.dumps({'passed': True, **report}, ensure_ascii=False, indent=1))
