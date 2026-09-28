"""Multiplayer test version (teste/multiplayer.js) in the browser. Two windows of one browser join
the room of index.html#sala=..., race one lap of Interlagos together on the automatic pilot, and
each must show the other's car where it really is; both result sheets list both pilots. A window
opened without #sala shows nothing of it and does not even load the module.

Usage: verificar_multiplayer.py [porta]  (INTERLAGOS_SHOTS=pasta keeps the screenshots there)."""
import json
import os
import random
import statistics
import sys
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import browser_executable, browser_args, wait_js

PORT = sys.argv[1] if len(sys.argv) > 1 else '8799'
URL = f'http://127.0.0.1:{PORT}/pista_interlagos/teste/'
SHOTS = Path(os.environ.get('INTERLAGOS_SHOTS') or tempfile.gettempdir()) / 'verificar_multiplayer'
SHOTS.mkdir(parents=True, exist_ok=True)
ROOM = f'verif{random.randrange(10**6)}'
GUEST_CAR = '64'
HOST_NAME, GUEST_NAME = 'Ana Anfitriã', 'Bia Convidada'
PROBE = "()=>{const s=interlagosSala.info();return {t:performance.timeOrigin+performance.now(),me:s.me,cars:s.cars};}"
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
    (the owner's two probes around it, interpolated)."""
    k = (t - before['t']) / max(1e-6, after['t'] - before['t'])
    x = before['me']['x'] + (after['me']['x'] - before['me']['x']) * k
    y = before['me']['y'] + (after['me']['y'] - before['me']['y']) * k
    return ((view['x'] - x) ** 2 + (view['y'] - y) ** 2) ** .5


def two_windows(context, host, pages):
    OPENING = "window.interlagos&&!document.querySelector('#start').disabled&&!document.querySelector('#pilotName').hidden"
    host.goto(f'{URL}?intro=0&cinema=off#sala={ROOM}&auto=1', wait_until='load', timeout=120000)
    wait_js(host, "window.interlagosSala?.info().role==='host'&&" + OPENING, timeout=60000)
    # The guest is a second window (a popup), not a tab: a headless browser draws its background
    # tabs at a couple of frames a second, which would run that window's race in slow motion.
    with context.expect_page() as popup:
        host.evaluate("url=>window.open(url,'convidado','popup,width=800,height=450')", f'{URL}?intro=0&cinema=off#sala={ROOM}&auto=1&carro={GUEST_CAR}')
    guest = pages['guest'] = popup.value
    watch(guest, 'guest')
    guest.wait_for_load_state('load', timeout=120000)
    wait_js(guest, f"window.interlagosSala?.info().role==='guest'&&interlagosSala.info().number==='{GUEST_CAR}'&&" + OPENING, timeout=60000)
    host.fill('#pilotName', HOST_NAME)
    guest.fill('#pilotName', GUEST_NAME)
    wait_js(host, f"interlagosSala.info().members.some(m=>m.name==={GUEST_NAME!r})", timeout=10000)
    host.click('#start')
    host.screenshot(path=str(SHOTS / '1_anfitriao_pistas.png'))
    guest.screenshot(path=str(SHOTS / '1_convidado_espera.png'))
    host.click('#singleRace')

    # The guest loads the track by itself; the lights go out once both are ready.
    for page in (host, guest):
        wait_js(page, "interlagosSala.info().phase==='racing'", timeout=240000)
    for page in (host, guest):
        wait_js(page, "window.interlagos?.ready&&document.querySelector('#raceCountdown').hidden", timeout=30000)
    host_info, guest_info = host.evaluate('interlagosSala.info()'), guest.evaluate('interlagosSala.info()')
    assert host_info['raceId'] == guest_info['raceId']
    assert [s['number'] for s in host_info['race']['seats']] == ['99', GUEST_CAR]
    # Host: only the guest's seat comes over the network. Guest: every other car does.
    assert [c['number'] for c in host_info['cars'] if c['remote']] == [GUEST_CAR], host_info['cars']
    assert all(c['remote'] for c in guest_info['cars']) and '99' in [c['number'] for c in guest_info['cars']]
    assert seen(host_info, GUEST_CAR)['name'] == GUEST_NAME and seen(guest_info, '99')['name'] == HOST_NAME
    assert host_info['me']['ghost'] and guest_info['me']['ghost']
    fps = {name: page.evaluate("new Promise(done=>{let n=0;const t=performance.now();const f=()=>{n++;if(performance.now()-t<1000)requestAnimationFrame(f);else done(n);};requestAnimationFrame(f);})") for name, page in (('host', host), ('guest', guest))}

    # Mid-race: where each window shows the other's car, against where it really was.
    gaps = {'host_sees_guest': [], 'guest_sees_host': []}
    for sample in range(14):
        host.wait_for_timeout(1800)
        g1, h1, g2, h2 = guest.evaluate(PROBE), host.evaluate(PROBE), guest.evaluate(PROBE), host.evaluate(PROBE)
        gaps['host_sees_guest'].append(gap(seen(h1, GUEST_CAR), g1, g2, h1['t']))
        gaps['guest_sees_host'].append(gap(seen(g2, '99'), h1, h2, g2['t']))
        if sample == 6:
            host.screenshot(path=str(SHOTS / '2_anfitriao_corrida.png'))
            guest.screenshot(path=str(SHOTS / '2_convidado_corrida.png'))
    speed = guest.evaluate("Math.hypot(interlagos.car.vx,interlagos.car.vy)*3.6")
    for key, values in gaps.items():
        assert statistics.median(values) < 3 and max(values) < 8, (key, values)

    # The flag: the result waits for the other human, then both sheets list both pilots.
    for page in (host, guest):
        wait_js(page, "!document.querySelector('#raceResults').hidden", timeout=480000)
    host.screenshot(path=str(SHOTS / '3_anfitriao_resultado.png'))
    guest.screenshot(path=str(SHOTS / '3_convidado_resultado.png'))
    results = {name: page.evaluate("document.querySelector('#raceResults').innerText") for name, page in (('host', host), ('guest', guest))}
    for name, text in results.items():
        assert HOST_NAME in text and GUEST_NAME in text, (name, text[:600])
    assert not errors, errors
    return fps, speed, gaps


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 800, 'height': 450})
    context.add_init_script("localStorage.setItem('opala99-preferences-v1',JSON.stringify({circuit:'interlagos',immersive:false,laps:1,camera:'chase'}));")

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
        fps, speed, gaps = two_windows(context, host, pages)
    except Exception:
        # What each window was doing, for the next look.
        for name, page in pages.items():
            try:
                page.screenshot(path=str(SHOTS / f'falha_{name}.png'))
                print(name, json.dumps(page.evaluate("({sala:window.interlagosSala?.info(),menu:document.querySelector('#menu').className,tracks:!document.querySelector('#tracks').classList.contains('hidden'),pilot:document.querySelector('#pilotName')?.hidden,status:document.querySelector('#status').textContent})"), ensure_ascii=False, default=str)[:1500])
            except Exception as err:
                print(name, 'sem estado:', err)
        raise
    browser.close()

report = {'room': ROOM, 'fps': fps, 'guestSpeedKmh': round(speed), 'gaps': {k: {'median': round(statistics.median(v), 2), 'max': round(max(v), 2)} for k, v in gaps.items()},
          'shots': str(SHOTS)}
print(json.dumps(report, indent=1, ensure_ascii=False))
print('verificar_multiplayer: ok')
