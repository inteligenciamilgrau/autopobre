"""Multiplayer test version (teste/multiplayer.js) in the browser. Three windows of one browser join
the room of index.html#sala=...: the host picks Corrida única, which waits on the grid; one guest was
in the room already, the other arrives during that wait and is seated too; the host gives the start
(the Largar button). They race one lap of Interlagos on the automatic pilot, every window shows the
others' cars where they really are (solid: humans collide unless the host asks for ghosts), and every
result sheet lists all three pilots. Then the host reloads (F5): it hosts again under the same
identity and the guests keep their cars. A window opened without #sala shows nothing of it and does
not even load the module.

Two ways, as in the game: the windows of one browser alone (&local=1, the default here), or through
the room server (--servidor): wrangler dev from sala-cloudflare on this machine, with the group key
of its .dev.vars, and the host letting each guest in (Aceitar) as the doorman asks.

Usage: verificar_multiplayer.py [porta] [--servidor]  (INTERLAGOS_SHOTS=pasta keeps the screenshots;
INTERLAGOS_NODE=node.exe when node is not on the PATH)."""
import json
import os
import random
import shutil
import subprocess
import time
import statistics
import sys
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
PORT = ARGS[0] if ARGS else '8799'
URL = f'http://127.0.0.1:{PORT}/pista_interlagos/teste/'
SERVER = '--servidor' in sys.argv
# The room's way: this browser only, or the room server on this machine.
MODE = '&servidor=local' if SERVER else '&local=1'
SERVER_KEY = 'chave-de-teste-local'
SHOTS = Path(os.environ.get('INTERLAGOS_SHOTS') or tempfile.gettempdir()) / 'verificar_multiplayer'
SHOTS.mkdir(parents=True, exist_ok=True)
ROOM = f'verif{random.randrange(10**6)}'
# Who races which car: the host always the 99; the first guest asks for the 64, the late one gets
# the first free car (the 73).
PILOTS = {'host': ('Ana Anfitriã', '99'), 'guest': ('Bia Convidada', '64'), 'late': ('Caio Atrasado', '73')}
OPENING = "window.interlagos&&!document.querySelector('#start').disabled&&!document.querySelector('#pilotName').hidden"
PROBE = "()=>{const s=interlagosSala.info();return {t:performance.timeOrigin+performance.now(),me:s.me,cars:s.cars};}"
FPS = "new Promise(done=>{let n=0;const t=performance.now();const f=()=>{n++;if(performance.now()-t<1000)requestAnimationFrame(f);else done(n);};requestAnimationFrame(f);})"
MODULES = ('multiplayer.js', 'multiplayer.css', 'net-room.js', 'net-cars.js')
errors, requests = [], {}


def watch(page, name):
    requests[name] = []
    page.on('request', lambda r: requests[name].append(r.url))
    page.on('pageerror', lambda e: (errors.append(f'{name}: {e}'), print(f'{name}: {e}', flush=True)))
    page.set_default_timeout(120000)


def seen(probe, number):
    return next(c for c in probe['cars'] if c['number'] == number)


def gap(view, before, after, t):
    """Distance between where one window shows a car and where its owner had it at that instant
    (the owner's two probes around it, interpolated; carried on when the instant is just past them)."""
    k = (t - before['t']) / max(1e-6, after['t'] - before['t'])
    x = before['me']['x'] + (after['me']['x'] - before['me']['x']) * k
    y = before['me']['y'] + (after['me']['y'] - before['me']['y']) * k
    return ((view['x'] - x) ** 2 + (view['y'] - y) ** 2) ** .5


def guest_window(context, host, pages, name, car=None):
    """A guest is another window (a popup), not a tab: a headless browser draws its background tabs
    at a couple of frames a second, which would run that window's race in slow motion. noopener: a
    popup would otherwise start with a copy of the host tab's sessionStorage, the room identity
    included, as a duplicated tab does. The windows share one browser's localStorage, so each opens
    with its own pilot saved as the last one used (a guest seated while the start waits is pulled
    into the race before anyone could type)."""
    host.evaluate("name=>localStorage.setItem('autopobre-pilots-v1',JSON.stringify({selected:name,names:[name]}))", PILOTS[name][0])
    with context.expect_page() as popup:
        host.evaluate("url=>{window.open(url,'_blank','popup,noopener,width=800,height=450');}", f'{URL}?intro=0&cinema=off#sala={ROOM}&auto=1{MODE}' + (f'&carro={car}' if car else ''))
    page = pages[name] = popup.value
    watch(page, name)
    page.wait_for_load_state('load', timeout=120000)
    if SERVER:
        # The doorman: the host lets the guest in from its room card.
        wait_js(page, "window.interlagosSala?.info().pending", timeout=60000)
        knock = host.locator('#mpRoom .mp-knocks li', has_text=PILOTS[name][0])
        knock.get_by_role('button', name='Aceitar').click(timeout=30000)
    wait_js(page, f"window.interlagosSala?.info().role==='guest'&&interlagosSala.info().number==={PILOTS[name][1]!r}", timeout=60000)
    return page


def race_room(context, host, pages):
    host.goto(f'{URL}?intro=0&cinema=off#sala={ROOM}&auto=1{MODE}', wait_until='load', timeout=120000)
    wait_js(host, "window.interlagosSala?.info().role==='host'&&" + OPENING, timeout=60000)
    host.fill('#pilotName', PILOTS['host'][0])
    guest = guest_window(context, host, pages, 'guest', PILOTS['guest'][1])
    wait_js(host, f"interlagosSala.info().members.some(m=>m.name==={PILOTS['guest'][0]!r})", timeout=10000)
    # A room always races the 99: Modo Corrida skips the car screen.
    host.click('#start')
    assert host.is_visible('#tracks') and not host.is_visible('#cars') and host.inner_text('#tracksBack') == '← Início'
    assert 'Opala #99' in host.inner_text('#tracksPilot'), host.inner_text('#tracksPilot')
    host.screenshot(path=str(SHOTS / '1_anfitriao_pistas.png'))
    guest.screenshot(path=str(SHOTS / '1_convidado_espera.png'))
    host.click('#singleRace')

    # Corrida única waits on the grid, the Largar button showing, until the host gives the start.
    wait_js(host, "interlagosSala.info().phase==='waiting'&&!document.querySelector('#mpStart').hidden", timeout=240000)
    # A third window arrives during that wait: it is seated and loads the race by itself.
    late = guest_window(context, host, pages, 'late')
    ids = {name: page.evaluate('interlagosSala.info().id') for name, page in pages.items()}
    wait_js(host, f"(()=>{{const s=interlagosSala.info();return s.race?.seats.length===3&&[{ids['guest']!r},{ids['late']!r}].every(id=>s.ready.includes(id));}})()", timeout=240000)
    host.wait_for_timeout(500)
    assert host.evaluate("interlagosSala.info().phase") == 'waiting', 'nobody starts before the host says so'
    host.screenshot(path=str(SHOTS / '2_anfitriao_espera.png'))
    late.screenshot(path=str(SHOTS / '2_atrasado_espera.png'))
    host.click('#mpStart')

    for page in pages.values():
        wait_js(page, "interlagosSala.info().phase==='racing'", timeout=60000)
    for page in pages.values():
        wait_js(page, "window.interlagos?.ready&&document.querySelector('#raceCountdown').hidden", timeout=60000)
    info = {name: page.evaluate('interlagosSala.info()') for name, page in pages.items()}
    assert len({i['raceId'] for i in info.values()}) == 1
    assert [s['number'] for s in info['host']['race']['seats']] == ['99', '64', '73'], info['host']['race']['seats']
    # Host: only the guests' seats come over the network. Guests: every other car does.
    assert sorted(c['number'] for c in info['host']['cars'] if c['remote']) == ['64', '73'], info['host']['cars']
    for name in ('guest', 'late'):
        assert all(c['remote'] for c in info[name]['cars']) and '99' in [c['number'] for c in info[name]['cars']]
    # Every window shows the other two humans, named, drawn and solid (humans collide by default).
    for name, own in info.items():
        for other, (pilot, number) in PILOTS.items():
            if other == name:
                continue
            car = seen(own, number)
            assert car['name'] == pilot and car['shown'] and not car['ghost'], (name, other, car)
        assert not own['me']['ghost']
    fps = {name: page.evaluate(FPS) for name, page in pages.items()}

    # Mid-race: where each window shows the others' cars, against where they really were.
    gaps = {f'{a}_sees_{b}': [] for a in PILOTS for b in PILOTS if a != b}
    order = ('guest', 'late', 'host')
    for sample in range(12):
        host.wait_for_timeout(1800)
        first = {name: pages[name].evaluate(PROBE) for name in order}
        second = {name: pages[name].evaluate(PROBE) for name in order}
        for viewer in order:
            view = second[viewer] if viewer != 'host' else first['host']
            for owner in order:
                if owner != viewer:
                    gaps[f'{viewer}_sees_{owner}'].append(gap(seen(view, PILOTS[owner][1]), first[owner], second[owner], view['t']))
        if sample == 5:
            for name, page in pages.items():
                page.screenshot(path=str(SHOTS / f'3_{name}_corrida.png'))
    speed = pages['guest'].evaluate("Math.hypot(interlagos.car.vx,interlagos.car.vy)*3.6")
    for key, values in gaps.items():
        assert statistics.median(values) < 3 and max(values) < 8, (key, values)

    # The flag: the result waits for the other humans, then every sheet lists all three pilots.
    for page in pages.values():
        wait_js(page, "!document.querySelector('#raceResults').hidden", timeout=480000)
    for name, page in pages.items():
        page.screenshot(path=str(SHOTS / f'4_{name}_resultado.png'))
        text = page.evaluate("document.querySelector('#raceResults').innerText")
        assert all(pilot in text for pilot, _ in PILOTS.values()), (name, text[:600])

    # F5 on the host: the same identity hosts again at once, and each guest keeps its car.
    before = {name: page.evaluate('interlagosSala.info()') for name, page in pages.items()}
    host.reload(wait_until='load', timeout=120000)
    wait_js(host, f"window.interlagosSala?.info().role==='host'&&interlagosSala.info().id==={before['host']['id']!r}", timeout=60000)
    for name in ('guest', 'late'):
        wait_js(pages[name], f"(()=>{{const s=interlagosSala.info();return s.role==='guest'&&s.number==={PILOTS[name][1]!r};}})()", timeout=30000)
        assert pages[name].evaluate('interlagosSala.info().id') == before[name]['id']
    wait_js(host, "interlagosSala.info().members.length===3", timeout=30000)
    assert not errors, errors
    return fps, speed, gaps


def start_server():
    """wrangler dev on 8787 (net-link.js LOCAL_SERVER), from sala-cloudflare with its .dev.vars."""
    root = Path(__file__).resolve().parents[2] / 'sala-cloudflare'
    node = os.environ.get('INTERLAGOS_NODE') or shutil.which('node')
    assert node, 'node not found: set INTERLAGOS_NODE'
    process = subprocess.Popen([node, str(root / 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--ip', '127.0.0.1', '--port', '8787', '--show-interactive-dev-session=false'],
                               cwd=root, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace', env={**os.environ, 'WRANGLER_SEND_METRICS': 'false'})
    deadline = time.monotonic() + 90
    for line in process.stdout:
        if 'Ready on' in line:
            break
        if time.monotonic() > deadline:
            break
    return process


def stop_server(process):
    if process and process.poll() is None:
        if os.name == 'nt':
            subprocess.run(['taskkill', '/pid', str(process.pid), '/T', '/F'], capture_output=True)
        else:
            process.kill()


server = start_server() if SERVER else None
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 800, 'height': 450})
    # (try: a noopener popup first opens about:blank, whose opaque origin has no localStorage)
    context.add_init_script("try{localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,laps:1,camera:'chase'}));}catch{}")
    if SERVER:
        # The group key, as a pilot types it once on the room card.
        context.add_init_script("try{localStorage.setItem('autopobre-chave-grupo'," + json.dumps(SERVER_KEY) + ");}catch{}")

    # The normal game: no card, no room, no multiplayer file requested.
    plain = context.new_page()
    watch(plain, 'plain')
    plain.goto(URL + '?intro=0', wait_until='load', timeout=120000)
    wait_js(plain, "window.interlagos&&!document.querySelector('#start').disabled")
    hidden = plain.evaluate("({room:typeof window.interlagosSala,card:!!document.querySelector('#mpRoom')})")
    assert hidden == {'room': 'undefined', 'card': False}, hidden
    assert not [u for u in requests['plain'] if any(m in u for m in MODULES)], 'the normal game loads no multiplayer file'
    plain.close()

    host = context.new_page()
    watch(host, 'host')
    pages = {'host': host}
    try:
        fps, speed, gaps = race_room(context, host, pages)
    except Exception:
        # What each window was doing, for the next look.
        for name, page in pages.items():
            try:
                page.screenshot(path=str(SHOTS / f'falha_{name}.png'))
                print(name, json.dumps(page.evaluate("({sala:window.interlagosSala?.info(),menu:document.querySelector('#menu').className,tracks:!document.querySelector('#tracks').classList.contains('hidden'),pilot:document.querySelector('#pilotName')?.hidden,status:document.querySelector('#status').textContent})"), ensure_ascii=False, default=str)[:1500])
            except Exception as err:
                print(name, 'sem estado:', err)
        stop_server(server)
        raise
    browser.close()
stop_server(server)

report = {'room': ROOM, 'mode': 'servidor' if SERVER else 'local', 'fps': fps, 'guestSpeedKmh': round(speed), 'gaps': {k: {'median': round(statistics.median(v), 2), 'max': round(max(v), 2)} for k, v in gaps.items()},
          'shots': str(SHOTS)}
print(json.dumps(report, indent=1, ensure_ascii=False))
print('verificar_multiplayer: ok')
