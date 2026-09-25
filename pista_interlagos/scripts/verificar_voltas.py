"""The lap count setting: 3 by default, picked in Configurações › Corrida, kept after a reload
and used by the free race and the story on both circuits (HUD, finish, results sheet).

Uso: python scripts/verificar_voltas.py
Run from the repository root; INTERLAGOS_URL points at a server other than the default one."""
import json
import os
from playwright.sync_api import sync_playwright
from browser_config import GAME_URL, browser_executable, browser_args, open_menu, enter_track, wait_race_start, wait_js

BASE = os.environ.get('INTERLAGOS_URL', GAME_URL)
report, errors = {}, []


def pick_laps(page, laps):
    """Settings › Corrida › Voltas from the opening menu, then close the dialog."""
    page.click('#settingsButton' if page.is_visible('#settingsButton') else '#menuButton')
    page.click('#tab-race')
    page.select_option('#raceLaps', str(laps))
    page.click('#settingsClose')


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), args=browser_args() + ['--use-angle=d3d11'], headless=True)
    for circuit in ('interlagos', 'curvelo'):
        url = BASE + f'?circuito={circuit}&intro=0'
        # One browser profile per circuit: the saved choice carries from the race to the story.
        profile = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = profile.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        open_menu(page, url)
        # A fresh browser: 3 laps, 1 to 20 on offer.
        page.evaluate("()=>{localStorage.removeItem('opala99-preferences-v1');}")
        page.reload(wait_until='networkidle')
        wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
        options = page.evaluate("[...document.querySelectorAll('#raceLaps option')].map(o=>o.value)")
        assert page.input_value('#raceLaps') == '3' and options[0] == '1' and options[-1] == '20', options
        # Two laps, kept after a reload.
        pick_laps(page, 2)
        page.reload(wait_until='networkidle')
        wait_js(page, "window.interlagos&&!document.querySelector('#start').disabled")
        assert page.input_value('#raceLaps') == '2', 'the choice survives a reload'
        # Free race over two laps: the HUD counts to 2, one lap does not finish it, two do.
        enter_track(page, 'Piloto voltas')
        wait_race_start(page)
        info = page.evaluate('interlagos.immersiveInfo()')
        assert info['freeTotalLaps'] == 2 and page.inner_text('#lap').strip() == '1 / 2', (info['freeTotalLaps'], page.inner_text('#lap'))
        page.evaluate('interlagos.car.laps=1')
        page.wait_for_timeout(400)
        assert not page.evaluate('interlagos.immersiveInfo().freeFinished'), 'one lap of two does not end the race'
        page.evaluate('interlagos.car.laps=2')
        wait_js(page, 'interlagos.immersiveInfo().freeFinished', timeout=5000)
        # After the finish fade the results sheet names the mode and the distance.
        mode_text = wait_js(page, "document.querySelector('#resultsMode')?.textContent.includes('VOLTA')&&document.querySelector('#resultsMode').textContent", timeout=30000)
        report[circuit] = {'free': info['freeTotalLaps'], 'results': mode_text}
        page.close()
        # Story mode on the same browser profile: the same two laps.
        page = profile.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        open_menu(page, url)
        assert page.input_value('#raceLaps') == '2'
        enter_track(page, 'Piloto voltas', story=True)
        info = page.evaluate('interlagos.immersiveInfo()')
        assert info['storyLaps'] == 2 and info['phase'] == 'crowd', info
        report[circuit]['story'] = info['storyLaps']
        profile.close()
    browser.close()

assert not errors, errors[:5]
assert all('2 VOLTAS' in r['results'] for r in report.values()), report
print(json.dumps(report, ensure_ascii=False))
print('verificar_voltas: OK')
