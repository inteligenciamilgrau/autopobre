"""Cars on the ground and their wheels in the browser (contact-shadows.js, car-wheels.js).

A full grid at Interlagos: a contact shadow under the 99 and under every rival (both levels of detail), the
HDR picture's alpha (the occlusion mask, cinematic.js) untouched by them while the ground under the cars
darkens; the shadow's strength by Gráficos level (strongest on Baixo, lettered tyres from Médio up, wheel
blur by Sensação de velocidade); the blur's opacity growing with speed; the shadow gone in the air and on the
car's side or roof; the rivals' wheels blurred in the race.
Usage: verificar_contato_rodas.py [port]   (INTERLAGOS_URL overrides the address; shots go to a temp folder,
or to CONTATO_OUT)."""
import json, os, sys, tempfile
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import browser_config  # noqa: F401  (headless + in-page pointer lock)
from browser_config import GAME_URL, browser_executable, browser_args, open_menu, enter_track, wait_race_start, wait_js
from playwright.sync_api import sync_playwright

PORT = sys.argv[1] if len(sys.argv) > 1 else None
URL = os.environ.get('INTERLAGOS_URL') or (GAME_URL.replace(':8799', ':' + PORT) if PORT else GAME_URL)
OUT = Path(os.environ.get('CONTATO_OUT') or tempfile.mkdtemp(prefix='contato_'))
OUT.mkdir(parents=True, exist_ok=True)
errors, results, checks = [], {}, {}


def check(name, value, detail=None):
    checks[name] = bool(value)
    print(('ok  ' if value else 'FAIL'), name, '' if detail is None else json.dumps(detail, ensure_ascii=False)[:400], flush=True)


INFO = 'interlagosContato.info()'
# The 99 put back on the straight (the pit wall's side), at a speed along its heading, paused.
PLACE = """speed=>{const c=interlagos.car,a=c.data.samples;let i=0;for(let k=0;k<a.length;k++)if(Math.abs(a[k][0]-4150)<Math.abs(a[i][0]-4150))i=k;
 interlagos.reposition(i);c.vx=Math.cos(c.heading)*speed;c.vy=Math.sin(c.heading)*speed;c.awaitingStart=false;return true;}"""
VIEW = """([eye,target,fov])=>{const d=[target[0]-eye[0],target[1]-eye[1],target[2]-eye[2]];interlagos.setCockpitView({eye,yaw:Math.atan2(d[2],d[0]),pitch:Math.atan2(d[1],Math.hypot(d[0],d[2])),fov});return true;}"""
CAMERA = "m=>{const s=document.getElementById('camera');s.value=m;s.dispatchEvent(new Event('change'));return true;}"
# One HDR frame (the film look's own picture): every pixel's alpha bits and the ground's light below the horizon.
HDR = """()=>import('three').then(THREE=>new Promise(resolve=>{
 const proto=THREE.Scene.prototype,old=proto.onAfterRender;
 const half=h=>{const e=(h>>10)&31,f=h&1023,s=h>>15?-1:1;return e===0?s*f*Math.pow(2,-24):e===31?0:s*(1+f/1024)*Math.pow(2,e-15);};
 proto.onAfterRender=function(renderer,scene,camera){const t=renderer.getRenderTarget();
  if(t?.isMainView){proto.onAfterRender=old;const w=t.width,h=t.height,buf=new Uint16Array(w*h*4);renderer.readRenderTargetPixels(t,0,0,w,h,buf);
   let hash=0,light=0;for(let i=0;i<w*h;i++){hash=(hash*31+buf[i*4+3])>>>0;if(Math.floor(i/w)<h*.45)light+=half(buf[i*4])+half(buf[i*4+1])+half(buf[i*4+2]);}
   window.__contatoHdr=window.__contatoHdr||[];window.__contatoHdr.push(buf);
   resolve({w,h,hash,light});}
  old?.call(this,renderer,scene,camera);};}))"""
# The frames without (a, a2) and with (b) the shadows: pixels whose alpha moves anyway (swaying foliage's alpha
# to coverage, people) and 8 px round them are left out; elsewhere the alpha never changes.
ALPHA_DIFF = """w=>{const [a,a2,b]=window.__contatoHdr,h=a.length/4/w,moving=new Uint8Array(w*h),near=new Uint8Array(w*h),R=8,at=[];window.__contatoHdr=null;let m=0,n=0,kept=0;
 for(let i=0;i<w*h;i++)if(a[i*4+3]!==a2[i*4+3]){moving[i]=1;m++;}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(moving[y*w+x])for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<w&&Y<h)near[Y*w+X]=1;}
 for(let i=0;i<w*h;i++){if(near[i])continue;kept++;if(a[i*4+3]!==b[i*4+3]){n++;if(at.length<12)at.push([i%w,Math.floor(i/w)]);}}
 return {alphaChanged:n,compared:kept,movingAnyway:m,changedAt:at};}"""


def frames(page, n=4):
    first = page.evaluate('interlagos.cockpitInfo().renderedFrame')
    wait_js(page, 'n=>interlagos.cockpitInfo().renderedFrame>=n', arg=first + n, timeout=60000)


def level(page, name):
    page.evaluate("v=>{interlagosGraficos.set({level:v,overrides:{dynamicResolution:false}});return true;}", name)
    wait_js(page, '!interlagosGraficos.info().compiling', timeout=60000); frames(page, 3)
    return page.evaluate(INFO)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    context = browser.new_context(viewport={'width': 1280, 'height': 720}, device_scale_factor=1, reduced_motion='no-preference')
    prefs = {'circuit': 'interlagos', 'immersive': False, 'camera': 'chase', 'car': '99', 'carModel': 'opala', 'graphics': {'level': 'alto', 'overrides': {'dynamicResolution': False}}}
    context.add_init_script('if(!sessionStorage.getItem("seeded")){sessionStorage.setItem("seeded","1");localStorage.setItem("opala99-preferences-v1",JSON.stringify(' + json.dumps(prefs) + '));}')
    page = context.new_page(); page.set_default_timeout(180000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and not m.text.startswith('Failed to load resource') else None)
    try:
        open_menu(page, URL + ('&' if '?' in URL else '?') + 'intro=0', timeout=180000)
        enter_track(page, pilot='Piloto contato', timeout=240000)
        page.evaluate('interlagos.skipIntro?.();true'); wait_race_start(page)
        wait_js(page, '!interlagosGraficos.info().compiling', timeout=60000)
        page.keyboard.press('KeyP'); wait_js(page, 'interlagos.state.paused'); frames(page)

        # The grid: a shadow under the 99 and each of the 14 rivals; the 99 on its wheels, no blur at rest.
        grid = page.evaluate(INFO); results['grid'] = grid
        check('shadow_under_every_car_on_the_grid', grid['shadows'] == 15, grid)
        check('player_shadow_whole_on_its_wheels', grid['player']['shade'] == 1 and abs(grid['player']['height']) < .05, grid['player'])
        check('lettered_tyres_on_alto', grid['tyres']['detailed'] and all(grid['tyres']['lettered']), grid['tyres'])

        # Racing behind the pack: the rivals' wheels close by blur too, every car keeps its shadow (the far ones
        # on their distant model).
        page.keyboard.press('KeyP'); wait_js(page, '!interlagos.state.paused')
        page.keyboard.down('KeyW'); page.wait_for_timeout(2600); page.keyboard.press('KeyP'); page.keyboard.up('KeyW'); wait_js(page, 'interlagos.state.paused'); frames(page)
        race = page.evaluate(INFO); results['race'] = race
        check('rivals_wheels_blur', race['discs'] > 4, race)
        check('every_car_keeps_its_shadow_racing', race['shadows'] == 15, race)
        page.screenshot(path=str(OUT / 'contato_pelotao.png'))
        page.evaluate(CAMERA, 'cockpit')
        page.evaluate(VIEW, [[-4.2, 1.3, 3.4], [0.3, 0.3, 0], 50]); frames(page); page.screenshot(path=str(OUT / 'contato_99.png'))

        # The HDR alpha (occlusion mask) is the same with and without the shadows; the ground below darkens.
        # Two frames without them tell what moves anyway (a paused race still has a few animated pixels); only
        # pixels steady there count.
        page.evaluate('interlagosContato.show(false)'); frames(page, 3); off = page.evaluate(HDR); frames(page, 3); page.evaluate(HDR)
        page.evaluate('interlagosContato.show(true)'); frames(page, 3); on = page.evaluate(HDR)
        changed = page.evaluate(ALPHA_DIFF, off['w'])
        results['hdr'] = {'off': off, 'on': on, **changed}
        check('hdr_alpha_untouched', changed['alphaChanged'] == 0 and changed['compared'] > .9 * off['w'] * off['h'], results['hdr'])
        check('ground_under_the_cars_darker', on['light'] < off['light'] * .995, results['hdr'])

        # Per level: strongest on Baixo (no sun shadows), lightest with sun shadows and SSAO; lettering from
        # Médio up; the blur by Sensação de velocidade.
        levels = {}
        for name in ('baixo', 'medio', 'alto', 'ultra'):
            levels[name] = level(page, name)
            if name in ('baixo', 'alto'):
                page.evaluate(VIEW, [[-4.2, 1.3, 3.4], [0.3, 0.3, 0], 50]); frames(page); page.screenshot(path=str(OUT / f'contato_{name}.png'))
        results['levels'] = {k: {'strength': v['strength'], 'blur': v['blur'], 'tyres': v['tyres']['detailed'], 'shadows': v['shadows']} for k, v in levels.items()}
        s = {k: v['strength'] for k, v in levels.items()}
        check('strength_by_level', s['baixo'] > s['medio'] > s['alto'] >= s['ultra'] > .5, s)
        check('plain_tyres_only_on_baixo', not levels['baixo']['tyres']['detailed'] and all(levels[k]['tyres']['detailed'] for k in ('medio', 'alto', 'ultra')), results['levels'])
        check('blur_on_every_level', all(levels[k]['blur'] > .8 for k in levels) and levels['baixo']['blur'] <= levels['alto']['blur'], results['levels'])
        check('every_level_draws_all_shadows', all(v['shadows'] == 15 for v in levels.values()), results['levels'])
        level(page, 'alto')

        # Spin blur grows with the 99's speed: none at a walk, the four discs fully on at racing speed.
        blur = []
        for v in (0, 3, 9, 12, 20, 40):
            page.evaluate(PLACE, v); frames(page, 3); blur.append(page.evaluate(INFO)['player'])
        results['blur'] = blur
        check('no_blur_at_a_walk', blur[0]['discs'] == 0 and blur[1]['discs'] == 0, blur[:2])
        check('blur_grows_with_speed', all(blur[i + 1]['blur'] >= blur[i]['blur'] for i in range(len(blur) - 1)) and 0 < blur[3]['blur'] < 1, blur)
        check('four_discs_at_racing_speed', blur[-1]['discs'] == 4 and blur[-1]['blur'] >= .99, blur[-1])
        page.evaluate(VIEW, [[1.55, 0.42, 1.75], [1.55, 0.3, 0.8], 40]); frames(page); page.screenshot(path=str(OUT / 'contato_roda_veloz.png'))
        page.evaluate(PLACE, 0); frames(page); page.screenshot(path=str(OUT / 'contato_roda.png'))

        # In the air the shadow fades and spreads; a metre up, on its side or on its roof it is gone.
        def pose(js):
            page.evaluate(PLACE, 0); page.evaluate('()=>{const c=interlagos.car;' + js + ';return true;}'); frames(page, 3)
            return page.evaluate(INFO)
        low, high = pose('c.z+=.3'), pose('c.z+=1.2')
        side, roof = pose('c.roll=Math.PI/2'), pose('c.roll=Math.PI;c.z+=1.2')
        back = pose('c.roll=0')
        results['air'] = {'low': low['player'], 'high': high['player'], 'side': side['player'], 'roof': roof['player'], 'back': back['player']}
        check('fades_in_the_air', .1 < low['player']['shade'] < .95 and high['player']['shade'] == 0 and high['shadows'] == 14, results['air'])
        check('gone_on_its_side_or_roof', side['player']['shade'] == 0 and roof['player']['shade'] == 0, results['air'])
        check('back_on_its_wheels', back['player']['shade'] == 1, back['player'])

        check('no_page_errors', not errors, errors[:5])
    finally:
        (OUT / 'resultado.json').write_text(json.dumps({'checks': checks, 'results': results, 'errors': errors}, indent=1, ensure_ascii=False), encoding='utf-8')
        browser.close()
print('shots in', OUT)
failed = [k for k, v in checks.items() if not v]
if failed:
    raise SystemExit('FAILED: ' + ', '.join(failed))
print('verificar_contato_rodas: ok')
