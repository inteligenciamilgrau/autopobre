"""Rivals' drivers and the recon lap's driver switch, in the browser.

Every rival on track carries its driver (rival-driver.js): suit and helmet in the team's colours,
hands on a wheel that turns with the steering. In the recon lap (settings 04), N or the Piloto
button hands the cameras and the engine sound to the next car; Shift+N goes back; taking the wheel
returns them.
Photos go to the folder given as the first argument (default: a temporary folder, printed at
the end, so a run from the repository root leaves no pictures in it).

Run from the repository root; INTERLAGOS_URL points at a server other than the default one."""
import math
import os
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import GAME_URL, browser_args, browser_executable, open_menu, wait_js

URL = os.environ.get('INTERLAGOS_URL', GAME_URL) + '?intro=0'
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.gettempdir()) / 'autopobre_pilotos_rivais'
OUT.mkdir(parents=True, exist_ok=True)
results, errors = [], []


def check(name, ok, detail=''):
    results.append(bool(ok))
    print('OK  ' if ok else 'FAIL', name, detail)


def camera(page, value):
    page.evaluate("v=>{const s=document.querySelector('#camera');s.value=v;s.dispatchEvent(new Event('change'))}", value)
    page.wait_for_timeout(200)


def watch(page):
    return page.evaluate('interlagos.watchInfo()')


def heard(page, samples=4):
    """Engine speed of the sound against the watched car's (the sound adds up to 120 rpm of throttle)."""
    pairs = []
    for _ in range(samples):
        page.wait_for_timeout(300)
        pairs.append(page.evaluate('()=>[interlagos.audioInfo().rpm,Math.min(7400,Math.max(950,interlagos.watchInfo().rpm))]'))
    return all(abs(sound - engine) <= 125 for sound, engine in pairs), pairs


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), args=browser_args(), headless=False)
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    open_menu(page, URL)
    page.fill('#pilotName', 'Piloto reconhecimento')
    page.click('#settingsButton')
    page.click('#tab-tour')
    check('tour_tab_explains_the_key', '<kbd>N</kbd>' in page.inner_html('[aria-labelledby=tab-tour]'))
    page.click('#tour')
    wait_js(page, 'window.interlagos?.ready&&!interlagos.state.paused&&interlagos.state.automatic', timeout=180000)
    camera(page, 'chase')
    page.wait_for_timeout(5000)
    drivers = page.evaluate('interlagos.rivalDrivers()')
    check('every_rival_has_a_driver', len(drivers) == 14 and all(drivers), len(drivers))
    check('drivers_shown_near_the_camera', any(d['shown'] for d in drivers))
    check('hands_on_the_rim', all(a['reachable'] and abs(a['gap']) < 1e-4 for d in drivers for a in d['arms']))
    check('button_in_the_recon_lap', page.is_visible('#watchButton'), page.inner_text('#watchButton'))
    page.screenshot(path=str(OUT / 'pilotos_01_proprio.jpg'), quality=85)

    page.keyboard.press('KeyN')
    page.wait_for_timeout(1500)
    w = watch(page)
    check('n_watches_the_first_rival', w['watched'] == 1 and math.dist(w['camera'], w['target']) < 14, w['number'])
    check('hud_names_the_driver', w['number'] in page.inner_text('#watchButton') and w['number'] in page.inner_text('#surface'))
    check('sound_heard_from_the_rival', *heard(page))
    page.screenshot(path=str(OUT / 'pilotos_02_rival_atras.jpg'), quality=85)
    camera(page, 'cockpit')
    page.wait_for_timeout(2000)
    w = watch(page)
    check('cockpit_rides_in_the_rival', math.dist(w['camera'], w['target']) < 1.6)
    steering = []
    for _ in range(3):
        page.wait_for_timeout(1000)
        steering.append(page.evaluate('interlagos.rivalDrivers()[0].wheel'))
    check('rival_wheel_turns', any(abs(s) > .02 for s in steering), steering)
    page.screenshot(path=str(OUT / 'pilotos_03_rival_interna.jpg'), quality=85)
    camera(page, 'tv')
    page.wait_for_timeout(2500)
    page.screenshot(path=str(OUT / 'pilotos_04_rival_tv.jpg'), quality=85)
    camera(page, 'chase')

    page.keyboard.press('KeyN')
    page.keyboard.press('KeyN')
    check('n_moves_on', watch(page)['watched'] == 3)
    page.keyboard.press('Shift+KeyN')
    check('shift_n_goes_back', watch(page)['watched'] == 2)
    for _ in range(13):
        page.keyboard.press('KeyN')
    check('wraps_round_to_the_player', watch(page)['watched'] == 0)
    check('sound_back_in_the_players_car', *heard(page))
    page.click('#watchButton')
    check('button_switches_too', watch(page)['watched'] == 1)
    page.keyboard.down('KeyW')
    page.wait_for_timeout(200)
    page.keyboard.up('KeyW')
    check('taking_the_wheel_returns_the_cameras', watch(page)['watched'] == 0 and not page.evaluate('interlagos.state.automatic'))
    page.wait_for_timeout(300)
    check('button_hidden_when_driving', not page.is_visible('#watchButton'))
    page.keyboard.press('KeyN')
    check('n_ignored_when_driving', watch(page)['watched'] == 0)
    check('no_page_errors', not errors, errors[:3])
    browser.close()

print('Fotos em', OUT.resolve())
print('ALL OK' if all(results) else 'FAILED')
sys.exit(0 if all(results) else 1)
