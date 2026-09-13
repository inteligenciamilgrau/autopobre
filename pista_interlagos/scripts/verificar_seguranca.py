"""HTTP and browser regression checks for the publication boundary."""
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from playwright.sync_api import sync_playwright
from browser_config import browser_executable
from publicacao import ROOT, PUBLIC_FILES, contained_file, security_headers
from servidor import Handler


def main():
    dist = ROOT / 'dist'
    report = {'checks': {}, 'browser_errors': []}

    def check(name, value):
        report['checks'][name] = bool(value)
        assert value, name

    class ReleaseHandler(SimpleHTTPRequestHandler):
        def translate_path(self, path):
            translated = super().translate_path(path.removeprefix('/preview'))
            return translated

        def end_headers(self):
            for name, value in security_headers((dist / 'index.html').read_text(encoding='utf-8')).items():
                self.send_header(name, value)
            super().end_headers()

        def list_directory(self, path):
            self.send_error(404)

        def log_message(self, *args):
            pass

    local = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    release = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(ReleaseHandler, directory=str(dist)))
    for server in (local, release):
        threading.Thread(target=server.serve_forever, daemon=True).start()
    local_url = f'http://127.0.0.1:{local.server_port}'

    def status(path, headers=None):
        try:
            with urlopen(Request(local_url + path, headers=headers or {})) as response:
                return response.status
        except HTTPError as error:
            return error.code

    try:
        for path in ['/.git/config', '/.env', '/carro/', '/pista_interlagos/scripts/servidor.py',
                     '/pista_interlagos/README.md', '/pista_interlagos/dados/',
                     '/pista_interlagos/teste/assets/', '/pista_interlagos/teste/package-lock.json',
                     '/pista_interlagos/teste/../../../.env', '/pista_interlagos/teste/%2e%2e/%2e%2e/.env',
                     '/pista_interlagos/teste/%5c..%5c.env']:
            check('blocked:' + path, status(path) == 404)
        check('host_header_rejected', status('/pista_interlagos/teste/', {'Host': 'untrusted.example'}) == 403)
        check('cross_site_fetch_rejected', status('/pista_interlagos/teste/main.js', {'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'cors'}) == 403)
        for invalid in ['../outside.txt', '/outside.txt']:
            try:
                contained_file(ROOT, invalid)
            except ValueError:
                continue
            raise AssertionError('Path containment failed')
        check('path_containment', True)
        with urlopen(local_url + '/pista_interlagos/teste/') as response:
            check('security_headers', response.headers['X-Content-Type-Options'] == 'nosniff' and "frame-ancestors 'none'" in response.headers['Content-Security-Policy'])
            check('no_python_version', 'Python' not in response.headers.get('Server', ''))
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=browser_executable(), headless=True,
                args=['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            page = browser.new_page(viewport={'width':1280, 'height':800})
            page.set_default_timeout(120000)
            page.on('pageerror', lambda error: report['browser_errors'].append(str(error)))
            console_errors = []
            page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
            page.goto(local_url + '/pista_interlagos/teste/', wait_until='networkidle')
            page.wait_for_selector('#start:not([disabled])')
            check('local_game_ready_with_csp', True)
            requests = []
            page.on('request', lambda request: requests.append(request.url))
            base = f'http://127.0.0.1:{release.server_port}/preview/'
            page.goto(base, wait_until='networkidle')
            page.wait_for_selector('#start:not([disabled])')
            check('release_ready_in_subdirectory', True)
            check('logo_visible', page.locator('.opening-brand img').is_visible())
            check('immersive_selected_by_default', page.is_checked('#immersiveMode'))
            page.uncheck('#immersiveMode')
            page.select_option('#camera', 'aerial')
            page.select_option('#livery', 'seiva_danilo')
            page.wait_for_selector('#skinButton:not([disabled])')
            page.locator('#volume').fill('23'); page.click('#mute')
            page.reload(wait_until='networkidle'); page.wait_for_selector('#start:not([disabled])')
            check('free_mode_persists', not page.is_checked('#immersiveMode'))
            check('camera_and_livery_restored', page.evaluate("interlagos.state.mode==='aerial'&&interlagos.state.livery==='seiva_danilo'"))
            check('audio_preferences_restored', page.input_value('#volume')=='23' and page.locator('#mute').get_attribute('aria-pressed')=='true')
            page.click('#start'); page.click('#cockpitButton'); page.click('#skinButton')
            page.wait_for_selector('#skinButton:not([disabled])')
            page.reload(wait_until='networkidle'); page.wait_for_selector('#start:not([disabled])')
            check('track_buttons_preferences_restored', page.evaluate("interlagos.state.mode==='cockpit'&&interlagos.state.livery==='assinaturas_omp'"))
            page.click('#start')
            page.click('#cockpitButton')
            page.evaluate("interlagos.setLivery('seiva_danilo')")
            check('second_skin', page.locator('#skinButton').inner_text().find('Seiva') >= 0)
            check('invalid_livery_rejected', page.evaluate("async()=>{try{await interlagos.setLivery('../../.env');return false}catch{return true}}"))
            page.click('#menuButton'); page.check('#immersiveMode')
            page.reload(wait_until='networkidle'); page.wait_for_selector('#start:not([disabled])')
            check('immersive_choice_persists_without_autostart', page.is_checked('#immersiveMode') and not page.evaluate('interlagos.immersiveInfo().active'))
            page.click('#start')
            check('immersive_starts', page.evaluate("interlagos.immersiveInfo().phase==='crowd'"))
            page.click('#menuButton'); page.uncheck('#immersiveMode'); page.click('#tour')
            check('normal_mode_returns', not page.evaluate('interlagos.immersiveInfo().active'))
            page.click('#menuButton')
            page.screenshot(path=str(ROOT / '.audit-local/security_release.png'))
            check('no_external_network', all(url.startswith(base) or url.startswith('blob:') or url.startswith('data:') for url in requests))
            check('no_unexpected_browser_errors', not report['browser_errors'] and not console_errors)
            page.evaluate("()=>{const s=document.createElement('script');s.textContent='window.inlineInjectionRan=true';document.body.append(s)}")
            check('csp_blocks_inline_script', page.evaluate('window.inlineInjectionRan!==true'))
            check('corrupt_profile_sanitized', page.evaluate("async()=>{const {ImmersiveState}=await import('./immersive-state.js');const a=new ImmersiveState({fund:'<img src=x onerror=alert(1)>',races:Infinity,released:'false'});const b=new ImmersiveState(null);return a.profile.fund===0&&a.profile.races===0&&!a.profile.released&&b.profile.fund===0}"))
            browser.close()
        report['passed'] = True
    finally:
        for server in (local, release):
            server.shutdown(); server.server_close()
        report.setdefault('passed', False)
        (ROOT / '.audit-local/security_checks.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
