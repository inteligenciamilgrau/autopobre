"""Cenario de Interlagos no navegador: relevo ajustado, arquibancada coberta e capturas.

Uso: python scripts/verificar_cenario.py [porta]  (servidor local em execucao; padrao 8799)
Resultado em dados/validacao_cenario.json e capturas renders/cenario_*.png.
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import GAME_URL, browser_executable, browser_args, open_menu, race_options, enter_track, wait_race_start

ROOT = Path(__file__).resolve().parents[1]
PORT = sys.argv[1] if len(sys.argv) > 1 else '8799'
URL = GAME_URL.replace(':8799', ':' + PORT) + '?circuito=interlagos'
# Car poses: on the track (s, lateral offset, turn from the track heading) or on the pit lane.
VIEWS = [
    ('arquibancada', 'track', 4170, -5.5, -1.35),
    ('reta_chegada', 'track', 4035, -3, 0),
    ('muro_boxes', 'track', 30, 5.5, .12),
    ('garagens', 'pit', 470, 2, 0),
    ('saida_boxes', 'pit', 760, 0, 0),
    ('rua_saida', 'pit', 960, 0, 0),
]
PLACE = """([kind,s,d,turn])=>{const car=interlagos.car,data=car.data;let x,y,heading;
 if(kind==='track'){const a=data.samples,p=a.reduce((b,q)=>Math.abs(q[0]-s)<Math.abs(b[0]-s)?q:b,a[0]);x=p[1]+p[9]*d;y=p[2]+p[10]*d;heading=Math.atan2(p[8],p[7])+turn;}
 else{const P=data.pit,c=Object.fromEntries(P.columns.map((k,i)=>[k,i])),p=P.samples.reduce((b,q)=>Math.abs(q[c.s]-s)<Math.abs(b[c.s]-s)?q:b,P.samples[0]),mid=(p[c.lane_lo]+p[c.lane_hi])/2+d;
  x=p[c.x]+p[c.lx]*mid;y=p[c.y]+p[c.ly]*mid;heading=Math.atan2(p[c.ty],p[c.tx])+turn;}
 car.x=x;car.y=y;car.heading=heading;car.vx=car.vy=car.yaw=0;car.index=car.nearest(x,y,true).i;car.surface=car.sample(x,y);car.settle?.();
 return {kind,s,onRoad:car.surface.onRoad,pit:car.surface.pit};}"""
report = {'url': URL, 'views': [], 'errors': []}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), args=browser_args(), headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    # Errors, and the warning printed when the GLB terrain could not take the fitted ground.
    page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' or (m.type == 'warning' and 'Terreno' in m.text) else None)
    open_menu(page, URL)
    race_options(page, immersive=False, camera='chase')
    enter_track(page, 'Piloto cenario')
    wait_race_start(page)
    info = page.evaluate('interlagos.sceneryInfo()')
    report['scenery'] = info
    ground, stands = info.get('ground') or {}, info.get('stands') or {}
    assert ground.get('residual', 1) <= .002 and ground.get('lowered', 0) > 1000, ground
    assert stands.get('blocks') == 6 and stands.get('rows', 0) >= 400 and info.get('fans', 0) > 2000, info
    # The GLB's old step-only stands (buried in the bank) are all retired.
    assert info.get('legacyStands') == 0, info
    for name, kind, s, d, turn in VIEWS:
        state = page.evaluate(PLACE, [kind, s, d, turn])
        page.wait_for_timeout(900)
        assert state['onRoad'], state
        page.screenshot(path=str(ROOT / f'renders/cenario_{name}.png'))
        report['views'].append({'name': name, **state})
    # Aerial view over the grandstand: C cycles chase, close, hood, cockpit, aerial.
    page.evaluate(PLACE, ['track', 4150, -4, 0])
    for _ in range(4):
        page.keyboard.press('KeyC')
    page.wait_for_timeout(1500)
    page.screenshot(path=str(ROOT / 'renders/cenario_arquibancada_aerea.png'))
    report['camera'] = page.evaluate('interlagos.state.mode')
    browser.close()
assert not report['errors'], report['errors']
(ROOT / 'dados/validacao_cenario.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps({'ground': report['scenery'].get('ground'), 'stands': report['scenery'].get('stands'), 'fans': report['scenery'].get('fans'), 'camera': report['camera']}, ensure_ascii=False))
print('verificar_cenario: OK')
