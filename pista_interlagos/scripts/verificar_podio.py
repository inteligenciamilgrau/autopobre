"""The story's podium: names on fixed plates on the steps (no sprites turning with the camera),
a banner over the steps, the free camera turning round the middle of the steps (kept clear
of the panel by a lens shift) and Space / E continuing while the mouse drives the camera.

Uso: python scripts/verificar_podio.py [pasta_fotos]
Run from the repository root; INTERLAGOS_URL points at a server other than the default one."""
import json
import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import GAME_URL, browser_executable, browser_args, open_menu, enter_track

URL = os.environ.get('INTERLAGOS_URL', GAME_URL) + '?circuito=interlagos&intro=0'
OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None
if OUT:
    OUT.mkdir(parents=True, exist_ok=True)
errors, report = [], {}

# The live ImmersiveMode (fixtureMode), then straight to the podium after a third place.
FIXTURE = """async()=>{const {ImmersiveMode}=await import('./immersive-mode.js');const o=ImmersiveMode.prototype.info;ImmersiveMode.prototype.info=function(){window.fixtureMode=this;return o.call(this)};interlagos.immersiveInfo();
 const m=fixtureMode;m.state.phase='podium';m.state.result={position:3,status:'Completou a corrida'};m.freeOrder=null;m.sync();return true;}"""
# The podium group's contents and where the middle of the steps lands on screen.
PODIUM = """()=>{const v=fixtureMode.visual,g=v.podium,names=[];let sprites=0;g.traverse(o=>{if(o.isSprite&&o.visible)sprites++;if(o.name)names.push(o.name);});
 const cam=v.cameraRef,zs=v.podiumSlots.map(s=>s.z),mid=g.localToWorld(new v.podium.position.constructor(-2,1.9,(Math.min(...zs)+Math.max(...zs))/2)).project(cam);
 return {sprites,plates:names.filter(n=>n.startsWith('Placa_podio_')).length,banner:names.includes('Faixa_podio'),ribbon:names.includes('Faixa_sexto'),sign:names.includes('Placa_oficina'),
  middle:[mid.x,mid.y],shifted:!!cam.view?.enabled,yaw:v.podiumView?.yaw??null};}"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), args=browser_args() + ['--use-angle=d3d11'], headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: errors.append(str(e)))
    open_menu(page, URL)
    enter_track(page, 'Stevan Gaipo', story=True)
    page.evaluate(FIXTURE)
    page.wait_for_timeout(2000)
    first = page.evaluate(PODIUM)
    assert first['sprites'] == 0, f"{first['sprites']} sprites still turn on the podium"
    assert first['plates'] == 12 and first['banner'] and first['ribbon'] and first['sign'], first
    assert first['shifted'], 'the lens shift keeps the podium clear of the panel'
    if OUT:
        page.screenshot(path=str(OUT / 'podio_0.png'))
    # Turn the camera with the mouse (a click captures it; moving it back would undo the turn):
    # the middle of the steps stays put on screen, it is the pivot.
    seen = [first['middle']]
    page.mouse.move(150, 400)
    for k in range(3):
        page.mouse.down()
        page.mouse.move(150 + 330 * (k + 1), 400 + 10 * (k + 1), steps=10)
        page.mouse.up()
        page.wait_for_timeout(500)
        now = page.evaluate(PODIUM)
        seen.append(now['middle'])
        if OUT:
            page.screenshot(path=str(OUT / f'podio_{k + 1}.png'))
    assert abs(now['yaw'] - (first['yaw'] or 0)) > 1, 'the drag turned the camera'
    drift = max(max(abs(a[0] - seen[0][0]), abs(a[1] - seen[0][1])) for a in seen)
    assert drift < .02, f'the pivot moves on screen ({drift:.3f})'
    report['podium'] = {**first, 'pivot_drift': round(drift, 4)}
    # Close on the plates of the first three.
    page.evaluate("()=>{const v=fixtureMode.visual.podiumView;v.yaw=0;v.pitch=.25;v.distance=9;}")
    page.wait_for_timeout(600)
    if OUT:
        page.screenshot(path=str(OUT / 'podio_placas.png'))
    # Space goes on to the paddock (the same as the Continuar button).
    page.keyboard.press('Space')
    page.wait_for_timeout(400)
    report['after_space'] = page.evaluate('interlagos.immersiveInfo().phase')
    assert report['after_space'] == 'inspection', report
    assert not page.evaluate('!!fixtureMode.visual.cameraRef.view?.enabled'), 'the lens shift ends with the podium'
    browser.close()

assert not errors, errors[:5]
print(json.dumps(report, ensure_ascii=False))
print('verificar_podio: OK')
