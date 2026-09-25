"""People idle in the real game: marshals, cameramen, crews, the terrace and the café move
and blink, cars catch the marshals' and cameramen's eyes, and nothing costs much.

Uso: python scripts/verificar_pessoas.py [pasta_fotos]
Run from the repository root; INTERLAGOS_URL points at a server other than the default one.
With pasta_fotos it also writes close shots of each group and <pasta_fotos>_mosaico.jpg."""
import json
import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import GAME_URL, browser_executable, browser_args, open_menu, race_options, enter_track, wait_race_start, wait_js

URL = os.environ.get('INTERLAGOS_URL', GAME_URL) + '?circuito=interlagos&intro=0'
OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None
if OUT:
    OUT.mkdir(parents=True, exist_ok=True)

# The game's own camera, overridden just before the main view renders (window.__shot:
# {eye, at, fov}); the scene is kept for the checks. Post-process quads use other cameras.
HOOK = """async()=>{const THREE=await import('three');const people=await import('./pit-crew.js');window.__people=people;
 THREE.Scene.prototype.onBeforeRender=function(r,scene,camera,target){if(!camera.isPerspectiveCamera||target&&!target.isMainView)return;window.__scene=scene;const s=window.__shot;
  if(s){camera.position.fromArray(s.eye);camera.lookAt(...s.at);camera.fov=s.fov??50;camera.updateProjectionMatrix();camera.updateMatrixWorld();}};
 return true;}"""
INFO = '()=>window.__people.peopleInfo()'
PLACE = """(s)=>{const car=interlagos.car,a=car.data.samples,p=a.reduce((b,q)=>Math.abs(q[0]-s)<Math.abs(b[0]-s)?q:b,a[0]);
 car.x=p[1];car.y=p[2];car.heading=Math.atan2(p[8],p[7]);car.vx=car.vy=car.yaw=0;car.index=car.nearest(car.x,car.y,true).i;car.surface=car.sample(car.x,car.y);car.settle?.();
 return [car.x,car.surface.z,-car.y];}"""
# Pose signature of a crowd mesh: every bone's rotation and the prop/lid scales.
POSES = """(name)=>{const m=window.__scene.getObjectByName(name);return m.skeleton.bones.flatMap(b=>[b.rotation.x,b.rotation.y,b.rotation.z,b.position.z,b.scale.y]);}"""
LIDS = """(name)=>window.__scene.getObjectByName(name).skeleton.bones.filter(b=>b.name==='Palpebras').map(b=>b.scale.y)"""
shots, errors = [], []


def shoot(page, name, eye, at, fov=40, wait=900):
    page.evaluate('s=>{window.__shot=s;}', {'eye': eye, 'at': at, 'fov': fov})
    page.wait_for_timeout(wait)
    if OUT:
        path = OUT / f'{len(shots):02d}_{name}.png'
        page.screenshot(path=str(path))
        shots.append(path)


def front(spot, dist, height, side=0.0, look=1.2):
    """Eye `dist` m in front of a person (turned `side` rad), looking at his chest."""
    import math
    x, y, z, yaw = spot
    a = yaw + side
    return [x + math.cos(a) * dist, y + height, z - math.sin(a) * dist], [x, y + look, z]


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), args=browser_args() + ['--use-angle=d3d11'], headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    open_menu(page, URL)
    race_options(page, camera='chase')
    enter_track(page, 'Piloto pessoas')
    wait_race_start(page)
    page.add_style_tag(content='body *{visibility:hidden!important} #view{visibility:visible!important}')
    page.evaluate(HOOK)
    page.wait_for_timeout(500)
    crowds = page.evaluate(INFO)
    names = [c['name'] for c in crowds]
    track = [c for c in crowds if c['name'].startswith('Fiscais_e_cinegrafistas')]
    pits = [c for c in crowds if c['name'].startswith('Pessoas_paradas_boxes')]
    assert track and pits and all(c['attached'] for c in crowds), names
    kinds = {k for c in crowds for k in c['kinds']}
    assert {'marshal', 'camera', 'seated', 'desk', 'terrace', 'stand'} <= kinds, kinds
    report = {'crowds': len(crowds), 'people': sum(c['people'] for c in crowds), 'kinds': sorted(kinds)}

    # Marshal: the car parked 25 m up the track catches his eye; he keeps moving.
    marshal = next(c for c in track if 'marshal' in c['kinds'])
    k = marshal['kinds'].index('marshal')
    spot = marshal['spots'][k]
    s = page.evaluate("""([x,z])=>{const a=interlagos.car.data.samples;let best=a[0],d=1e9;for(const q of a){const e=Math.hypot(q[1]-x,q[2]+z);if(e<d){d=e;best=q;}}return best[0];}""", [spot[0], spot[2]])
    page.evaluate(PLACE, s + 25)
    eye, at = front(spot, 4.2, 1.7, .5)
    shoot(page, 'fiscal', eye, at)
    before = page.evaluate(POSES, marshal['name'])
    page.wait_for_timeout(2500)
    after = page.evaluate(POSES, marshal['name'])
    assert max(abs(a - b) for a, b in zip(before, after)) > .02, 'the marshal moves'
    shoot(page, 'fiscal_2', eye, at, wait=1500)

    # Cameraman on his tower films the car in front of it: the head pans off the base line.
    tower = next(c for c in track if 'camera' in c['kinds'])
    k = tower['kinds'].index('camera')
    spot = tower['spots'][k]
    s = page.evaluate("""([x,z])=>{const a=interlagos.car.data.samples;let best=a[0],d=1e9;for(const q of a){const e=Math.hypot(q[1]-x,q[2]+z);if(e<d){d=e;best=q;}}return best[0];}""", [spot[0], spot[2]])
    page.evaluate(PLACE, s + 40)
    eye, at = front(spot, 3.6, .6, -1.9, look=-.2)
    shoot(page, 'cinegrafista', eye, at, fov=45, wait=2500)
    info = next(c for c in page.evaluate(INFO) if c['name'] == tower['name'])
    assert info['doing'][k] == 'filmando' and abs(info['pan'][k]) > .1, info
    report['camera_pan'] = round(info['pan'][k], 2)
    page.evaluate(PLACE, s - 40)
    shoot(page, 'cinegrafista_vira', eye, at, fov=45, wait=2500)
    info2 = next(c for c in page.evaluate(INFO) if c['name'] == tower['name'])
    assert info2['pan'][k] * info['pan'][k] < 0, 'the camera turns to follow the car to the other side'

    # Box 99: café customers (with cups), engineers at the stand, crews at their doors, terrace.
    page.evaluate(PLACE, 40)
    for kind, name, dist, height, side in (('seated', 'cafe', 2.6, 1.3, .3), ('desk', 'engenheiros', 2.8, 1.8, .2), ('stand', 'equipe_rival', 3.5, 1.6, .35), ('terrace', 'terraco', 4.5, 1.9, .4)):
        crowd = next(c for c in pits if kind in c['kinds'])
        k = crowd['kinds'].index(kind)
        eye, at = front(crowd['spots'][k], dist, height, side, look=.9 if kind in ('seated', 'desk') else 1.2)
        shoot(page, name, eye, at, fov=50, wait=1200)
    cafe = next(c for c in pits if 'seated' in c['kinds'])
    before = page.evaluate(POSES, cafe['name'])
    lids, seen = [], set()
    for _ in range(80):
        page.wait_for_timeout(150)
        lids.append(max(page.evaluate(LIDS, cafe['name'])))
        seen.update(d for c in page.evaluate(INFO) if c['name'] == cafe['name'] for d in c['doing'] if d)
    after = page.evaluate(POSES, cafe['name'])
    assert max(abs(a - b) for a, b in zip(before, after)) > .05, 'the café moves'
    assert max(lids) > .5 and min(lids) < .01, f'they blink ({min(lids)}..{max(lids)})'
    report['cafe_doing'] = sorted(seen)
    # Close on a customer's face: a blink between frames.
    k = cafe['kinds'].index('seated')
    eye, at = front(cafe['spots'][k], .9, 1.25, .2, look=1.2)
    for n in range(3):
        shoot(page, f'rosto_{n}', eye, at, fov=35, wait=700)

    # The Box 99 crew and the Tia (person() figures) idle with the rest.
    crew = page.evaluate("""()=>{const g=window.__scene.getObjectByName('Equipe_box99'),w=g.children.find(o=>o.name==='Chefe_pirulito').getWorldPosition(g.position.clone());
      const tia=window.__scene.getObjectByName('Tia_da_lanchonete').getWorldPosition(g.position.clone());return {chief:[w.x,w.y,w.z],tia:[tia.x,tia.y,tia.z]};}""")
    c = crew['chief']
    shoot(page, 'equipe_box99', [c[0] + 1, c[1] + 2.2, c[2] + 1], [c[0] - 1.5, c[1] + 1, c[2] - 1.5], fov=70, wait=1500)
    t = crew['tia']
    tia_before = page.evaluate("""()=>{const r=window.__scene.getObjectByName('Tia_da_lanchonete');const b=r.getObjectByProperty('isSkinnedMesh',true).skeleton.bones;return b.flatMap(x=>[x.rotation.x,x.rotation.y,x.rotation.z]);}""")
    page.wait_for_timeout(3000)
    tia_after = page.evaluate("""()=>{const r=window.__scene.getObjectByName('Tia_da_lanchonete');const b=r.getObjectByProperty('isSkinnedMesh',true).skeleton.bones;return b.flatMap(x=>[x.rotation.x,x.rotation.y,x.rotation.z]);}""")
    assert max(abs(a - b) for a, b in zip(tia_before, tia_after)) > .02, 'the Tia moves'

    # Cost: the whole idle update, with the camera at the pits (most people in range).
    cost = page.evaluate("""async()=>{const THREE=await import('three'),eye=new THREE.Object3D();window.__scene.getObjectByName('Chefe_pirulito').getWorldPosition(eye.position);eye.updateMatrixWorld();
      const t0=performance.now();let n=0;for(;n<200;n++)window.__people.updatePeople(1/60,eye,[]);return (performance.now()-t0)/n;}""")
    report['update_ms'] = round(cost, 3)
    assert cost < 1.5, f'idle update costs {cost:.2f} ms a frame'
    report['draw_calls'] = page.evaluate('interlagos.state.drawCalls')
    browser.close()

bad = [e for e in errors if 'favicon' not in e and 'tracks.json' not in e]
assert not bad, bad[:5]
if OUT and shots:
    from PIL import Image, ImageDraw
    tiles = [Image.open(s).convert('RGB').resize((640, 360)) for s in shots]
    cols = 4
    rows = (len(tiles) + cols - 1) // cols
    mosaic = Image.new('RGB', (cols * 640, rows * 360), (20, 20, 20))
    draw = ImageDraw.Draw(mosaic)
    for i, (tile, path) in enumerate(zip(tiles, shots)):
        x, y = (i % cols) * 640, (i // cols) * 360
        mosaic.paste(tile, (x, y))
        draw.text((x + 8, y + 6), path.stem, fill=(255, 255, 0))
    mosaic.save(OUT.parent / f'{OUT.name}_mosaico.jpg', quality=86)
    report['shots'] = len(shots)
print(json.dumps(report, ensure_ascii=False))
