"""Audio settings in a real browser: an audible effects preview and a mute per channel.

Moving the Efeitos slider plays a stretch of the recorded starter (the old 55 Hz synth preview was
nearly silent on laptop and phone speakers); Música and Efeitos each have a Silenciar button that
keeps the slider's level (dimmed, "· mudo"), is saved across reloads, and moving a silenced
channel's slider turns it back on.

Usage, from the repo root, with the local server running (INTERLAGOS_URL for another port):
  python pista_interlagos/scripts/verificar_volume_canais.py
"""
from browser_config import browser_executable, browser_args, wait_js, open_menu, GAME_URL
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os
ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
report = {'errors': [], 'checks': {}}


def check(name, value):
    report['checks'][name] = bool(value); print(name, bool(value), flush=True); assert value, name


def audio(page): return page.evaluate('interlagos.audioInfo()')


def open_audio(page):
    open_menu(page, URL); page.click('#settingsButton'); page.click('#tab-audio'); page.wait_for_selector('#effectsMute')


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args() + ['--autoplay-policy=no-user-gesture-required'])
    try:
        context = browser.new_context(viewport={'width': 1280, 'height': 800}); page = context.new_page(); page.set_default_timeout(120000)
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        open_audio(page)
        page.locator('#musicVolume').fill('0'); page.locator('#effectsVolume').fill('70')
        wait_js(page, "(interlagos.audioInfo().effects?.counts.preview??0)>0&&interlagos.audioInfo().rms>.0005", timeout=8000)
        check('effects_slider_plays_recorded_preview', 'starter' in audio(page)['effects']['samples'])
        page.wait_for_timeout(1600); page.locator('#musicVolume').fill('40')
        page.click('#effectsMute'); page.wait_for_timeout(200)
        a = audio(page)
        check('effects_mute_keeps_level', a['effectsMuted'] and a['effectsVolume'] == .7 and page.input_value('#effectsVolume') == '70' and 'mudo' in page.inner_text('#effectsVolumeValue') and page.get_attribute('#effectsMute', 'aria-pressed') == 'true' and 'channel-muted' in (page.get_attribute('#effectsVolume', 'class') or '') and page.inner_text('#effectsMute') == 'Ativar efeitos')
        page.click('#musicMute'); page.wait_for_timeout(300)
        check('music_mute_keeps_level', audio(page)['musicMuted'] and audio(page)['musicVolume'] == .4 and not audio(page)['muted'])
        check('both_muted_is_silent', page.evaluate('new Promise(r=>setTimeout(()=>r(interlagos.audioInfo().rms),500))') < 1e-4)
        page.screenshot(path=str(ROOT / 'renders' / 'audio_canais_mudos.png'))
        page.reload(); open_audio(page)
        check('mutes_saved_across_reload', audio(page)['musicMuted'] and audio(page)['effectsMuted'] and page.get_attribute('#musicMute', 'aria-pressed') == 'true' and page.input_value('#musicVolume') == '40')
        page.locator('#effectsVolume').fill('55')
        check('moving_slider_unmutes_channel', not audio(page)['effectsMuted'] and audio(page)['effectsVolume'] == .55 and page.get_attribute('#effectsMute', 'aria-pressed') == 'false')
        page.click('#musicMute')
        check('music_back_on', not audio(page)['musicMuted'])
        context.close()
        check('no_browser_errors', not report['errors']); report['passed'] = True
    finally:
        report.setdefault('passed', False)
        print(json.dumps(report, ensure_ascii=False, indent=2), flush=True); browser.close()
