"""Fixed camera shots of the race and story modes, for judging the game's look between rounds.

Uso: python scripts/fotografar_cinematico.py <pasta_saida> [porta] [cinema: full|lite|off]
Grava <pasta_saida>/NN_nome.png e <pasta_saida>_mosaico.jpg (servidor local em execucao; padrao 8799).
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_config import GAME_URL, browser_executable, browser_args, open_menu, race_options, enter_track, wait_race_start, wait_js

OUT = Path(sys.argv[1]).resolve()
PORT = sys.argv[2] if len(sys.argv) > 2 else '8799'
CINEMA = sys.argv[3] if len(sys.argv) > 3 else ''
URL = GAME_URL.replace(':8799', ':' + PORT) + '?circuito=interlagos' + (f'&cinema={CINEMA}' if CINEMA else '')
OUT.mkdir(parents=True, exist_ok=True)
# Car poses on the track: (name, s, lateral offset, turn from the track heading, camera mode).
RACE = [
    ('reta_chegada', 4035, -3, 0, 'chase'),
    ('arquibancada', 4170, -5.5, -1.35, 'chase'),
    ('muro_boxes', 30, 5.5, .12, 'chase'),
    ('s_senna', 330, 0, 0, 'chase'),
    ('reta_oposta', 1150, 0, 0, 'chase'),
    ('ferradura', 1900, 0, 0, 'chase'),
    ('mergulho', 3450, 0, 0, 'chase'),
    ('juncao', 3650, 0, 0, 'chase'),
    ('cockpit_reta', 4035, -3, 0, 'cockpit'),
    ('cockpit_curva', 1900, 0, 0, 'cockpit'),
    ('aerea', 4150, -4, 0, 'aerial'),
]
CAMERA = "m=>{const s=document.getElementById('camera');s.value=m;s.dispatchEvent(new Event('change'));}"
PLACE = """([s,d,turn])=>{const car=interlagos.car,data=car.data;const a=data.samples,p=a.reduce((b,q)=>Math.abs(q[0]-s)<Math.abs(b[0]-s)?q:b,a[0]);
 const x=p[1]+p[9]*d,y=p[2]+p[10]*d,heading=Math.atan2(p[8],p[7])+turn;
 car.x=x;car.y=y;car.heading=heading;car.vx=car.vy=car.yaw=0;car.index=car.nearest(x,y,true).i;car.surface=car.sample(x,y);car.settle?.();return car.surface.onRoad;}"""
shots, errors = [], []
# Only the 3D view: the shots judge the picture, not the interface.
HIDE_UI = 'body *{visibility:hidden!important} #view{visibility:visible!important}'



def shoot(page, name):
    path = OUT / f'{len(shots):02d}_{name}.png'
    page.screenshot(path=str(path))
    shots.append(path)


def watch(page):
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), args=browser_args() + ['--use-angle=d3d11'], headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    watch(page)
    open_menu(page, URL)
    race_options(page, camera='chase')
    enter_track(page, 'Piloto cinema')
    wait_race_start(page)
    # Hide the HUD: the shots judge the picture, not the interface.
    page.add_style_tag(content=HIDE_UI)
    for name, s, d, turn, mode in RACE:
        page.evaluate(CAMERA, mode)
        page.evaluate(PLACE, [s, d, turn])
        page.wait_for_timeout(1400)
        shoot(page, name)
    page.evaluate(CAMERA, 'chase')
    # A moving car: the automatic lap for a few seconds.
    page.evaluate('interlagos.reposition(0)')
    page.evaluate('interlagos.setTour(true)')
    page.wait_for_timeout(9000)
    shoot(page, 'volta_automatica')
    # Broadcast camera following the automatic lap.
    page.evaluate(CAMERA, 'tv')
    for k in range(3):
        page.wait_for_timeout(3500)
        shoot(page, f'tv_{k}')
    info_tv = page.evaluate('interlagos.tvInfo()')
    info = page.evaluate('({sky:interlagos.sceneryInfo?.().sky,calls:interlagos.state.drawCalls,cinema:interlagos.cinematicInfo?.()})')
    page.close()
    # Story mode: on foot among the fans beside the paddock Opala.
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    watch(page)
    open_menu(page, URL)
    enter_track(page, 'Piloto cinema', story=True)
    page.add_style_tag(content=HIDE_UI)
    page.wait_for_timeout(2500)
    shoot(page, 'historia_torcida')
    for key, name in (('KeyA', 'historia_olhar_esq'), ('KeyD', 'historia_olhar_dir')):
        page.keyboard.down(key)
        page.wait_for_timeout(900)
        page.keyboard.up(key)
        page.wait_for_timeout(700)
        shoot(page, name)
    page.mouse.move(640, 360)
    browser.close()

# Mosaic: 4 columns of half-size shots.
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
print(json.dumps({'shots': len(shots), 'errors': errors[:8], 'tv': info_tv, 'info': info}, ensure_ascii=False))
