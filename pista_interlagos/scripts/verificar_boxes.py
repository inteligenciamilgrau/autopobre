"""Pit lane de Interlagos no navegador: superficie, HUD, minimapa e capturas.

Uso: python scripts/verificar_boxes.py [porta]  (servidor local em execucao; padrao 8799)
Resultado em dados/validacao_boxes.json e capturas renders/boxes_*.png.
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import GAME_URL, browser_executable, browser_args, open_menu, race_options, enter_track, wait_race_start, wait_js

ROOT = Path(__file__).resolve().parents[1]
PORT = sys.argv[1] if len(sys.argv) > 1 else '8799'
URL = GAME_URL.replace(':8799', ':' + PORT) + '?circuito=interlagos'
# Stations along the pit lane (metres): entry, gore, chicane, garages, exit curve, S do Senna, merge.
STATIONS = [('entrada', 20), ('zebrado', 120), ('chicane', 210), ('limite', 330), ('garagens', 470), ('passarela', 700), ('saida', 900), ('reta_oposta', 1150)]
PLACE = """(s)=>{const car=interlagos.car,P=car.data.pit,c=Object.fromEntries(P.columns.map((k,i)=>[k,i]));
 const p=P.samples.reduce((b,q)=>Math.abs(q[c.s]-s)<Math.abs(b[c.s]-s)?q:b,P.samples[0]),mid=(p[c.lane_lo]+p[c.fast_hi])/2;
 car.x=p[c.x]+p[c.lx]*mid;car.y=p[c.y]+p[c.ly]*mid;car.heading=Math.atan2(p[c.ty],p[c.tx]);car.vx=car.vy=car.yaw=0;
 car.index=car.nearest(car.x,car.y,true).i;car.surface=car.sample(car.x,car.y);car.settle?.();
 return {s,pit:car.surface.pit,onRoad:car.surface.onRoad,pitS:car.surface.pitS,lapS:car.surface.s,z:car.surface.z};}"""
report = {'url': URL, 'stations': [], 'errors': []}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), args=browser_args(), headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' else None)
    open_menu(page, URL)
    race_options(page, immersive=False, camera='chase')
    enter_track(page, 'Piloto boxes')
    wait_race_start(page)
    info = page.evaluate("""()=>{const P=interlagos.car.data.pit;return {samples:P.samples.length,length:P.length_m,entry:P.entry_main_s,exit:P.exit_main_s,walls:P.walls.map(w=>w.name),limit:P.limit};}""")
    report['pit'] = info
    assert info['samples'] > 400 and 3850 < info['entry'] < 3950 and 750 < info['exit'] < 950, info
    for name, s in STATIONS:
        state = page.evaluate(PLACE, s)
        page.wait_for_timeout(700)
        state['hud'] = page.inner_text('#surface')
        state['location'] = page.inner_text('#location')
        assert state['pit'] and state['onRoad'], state
        assert state['hud'].startswith('PIT LANE') and 'Pit lane' in state['location'], state
        if info['limit']['from'] <= state['pitS'] <= info['limit']['to']:
            assert 'MÁX. 60' in state['hud'], state
        page.screenshot(path=str(ROOT / f'renders/boxes_{name}.png'))
        report['stations'].append(state)
    # Box 99: parked nose in, the pit stop opens; leaving closes it again.
    state = page.evaluate("""()=>{const car=interlagos.car,P=car.data.pit,c=Object.fromEntries(P.columns.map((k,i)=>[k,i])),b=P.box99;
     const p=P.samples.reduce((a,q)=>Math.abs(q[c.s]-b.s)<Math.abs(a[c.s]-b.s)?q:a,P.samples[0]),d=b.front+6;
     car.x=p[c.x]+p[c.lx]*d;car.y=p[c.y]+p[c.ly]*d;car.heading=Math.atan2(p[c.ty],p[c.tx])+Math.PI/2;car.vx=car.vy=car.yaw=0;
     car.index=car.nearest(car.x,car.y,true).i;car.surface=car.sample(car.x,car.y);car.settle?.();return {pit:car.surface.pit,pitD:car.surface.pitD,front:b.front};}""")
    wait_js(page, 'interlagos.pitInfo()?.opened', timeout=20000)
    page.wait_for_timeout(800)
    report['box99'] = {**state, 'title': page.inner_text('#pitTitle'), 'label': page.inner_text('#pitPanel small')}
    assert 'Cuida do Opala' in report['box99']['title'] and 'BOX 99' in report['box99']['label'], report['box99']
    page.screenshot(path=str(ROOT / 'renders/boxes_box99.png'))
    page.click('#pitLeave')
    wait_js(page, '!interlagos.pitInfo().opened')
    # Overview from above: C cycles chase, hood, cockpit, aerial.
    for _ in range(3):
        page.keyboard.press('KeyC')
    for name, s in [('aerea_entrada', 90), ('aerea_garagens', 480), ('aerea_saida', 720)]:
        page.evaluate(PLACE, s)
        page.wait_for_timeout(900)
        page.screenshot(path=str(ROOT / f'renders/boxes_{name}.png'))
    report['errors'] = [e for e in report['errors'] if 'favicon' not in e]
    assert not report['errors'], report['errors']
    browser.close()
(ROOT / 'dados/validacao_boxes.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps({'stations': len(report['stations']), 'pit': report['pit'], 'box99': report['box99']}, ensure_ascii=False))
