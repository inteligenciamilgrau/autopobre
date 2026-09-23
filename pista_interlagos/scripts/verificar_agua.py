"""Visual QA of the opt-in realistic lake water: default off, remembered after a reload,
planar reflections at the nearest lake, rear-view mirror pass, toggling off, the car driven into
the lake (bed under the water, splash, rings, spray, drag), and Curvelo (no lakes).

The camera is placed on the shore by overriding it just before each screen render."""
from browser_config import GAME_URL, browser_executable, browser_args, wait_js, open_menu, race_options, enter_track, wait_race_start
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('INTERLAGOS_URL', GAME_URL)
KEY = 'opala99-preferences-v1'
report = {'errors': [], 'views': []}


def frames(page, count=4):
    frame = page.evaluate('interlagos.cockpitInfo().renderedFrame')
    wait_js(page, f'interlagos.cockpitInfo().renderedFrame>{frame + count}')


def watch(page):
    """Page errors and failed requests; the audio manifest is optional on plain static servers."""
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' and not m.text.startswith('Failed to load resource') else None)
    page.on('response', lambda r: report['errors'].append(f'{r.status} {r.url}') if r.status >= 400 and not r.url.endswith('tracks.json') else None)


def set_water(page, on):
    """Tick the box in the race settings, as a player would."""
    page.click('#settingsButton' if page.is_visible('#settingsButton') else '#touchMenu' if page.is_visible('#touchMenu') else '#menuButton')
    page.click('#tab-race')
    page.locator('#realisticWater').set_checked(on)
    page.click('#settingsClose')


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
    for mobile, width, height in [(False, 1280, 720), (True, 844, 390)]:
        label = 'mobile' if mobile else 'desktop'
        context = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=mobile, has_touch=mobile, device_scale_factor=1)
        page = context.new_page(); page.set_default_timeout(120000)
        watch(page)
        open_menu(page, URL)
        assert not page.evaluate("document.querySelector('#realisticWater').checked"), 'realistic water must start off'
        set_water(page, True)
        assert json.loads(page.evaluate(f"localStorage.getItem('{KEY}')"))['realisticWater'] is True
        open_menu(page, URL)
        assert page.evaluate("document.querySelector('#realisticWater').checked"), 'the choice must survive a reload'
        race_options(page, immersive=False)
        enter_track(page)
        info = page.evaluate('interlagos.waterInfo()')
        assert info['realistic'] and not info['simpleVisible'] and info['bodies'] >= 2, info
        page.evaluate("""async()=>{const THREE=await import('three');
         THREE.Scene.prototype.onBeforeRender=function(r,s,c,target){const v=window.waterView;if(target||!v)return;c.position.set(...v.eye);c.lookAt(...v.at);c.updateMatrixWorld();};
         interlagos.car.step=()=>{};}""")
        lakes = sorted(info['lakes'], key=lambda lake: -lake['area'])
        for k, lake in enumerate(lakes[:2]):
            # Stand on the bank with the sun behind, looking across the water.
            view = page.evaluate("""([cx,cy,level])=>{const dx=-.68,dy=.73;let x=cx,y=cy;
              for(let s=0;s<400;s+=2){x=cx+dx*s;y=cy+dy*s;if(interlagos.car.sample(x,y).z>level+.6)break;}
              x+=dx*4;y+=dy*4;return {eye:[x,interlagos.car.sample(x,y).z+1.7,-y],at:[cx-dx*40,level-3,-(cy-dy*40)]};}""", [*lake['center'], lake['level']])
            page.evaluate('v=>{window.waterView=v}', view)
            before = page.evaluate('interlagos.waterInfo().reflections')
            frames(page)
            water = page.evaluate('interlagos.waterInfo()')
            assert water['reflections'] > before and abs(water['level'] - lake['level']) < .01, water
            assert water['size'][0] >= 64 and water['size'][0] <= width, water
            path = ROOT / f'renders/agua_realista_{label}_{k}.png'
            page.screenshot(path=str(path))
            report['views'].append({'mobile': mobile, 'lake': lake, 'reflections': water['reflections'], 'size': water['size'], 'render': str(path)})
        # Interior camera: the rear-view mirror renders the scene too; the lakes must stay valid there.
        page.evaluate('()=>{window.waterView=null}')
        near = page.evaluate(f"interlagos.car.sample({lakes[0]['center'][0]},{lakes[0]['center'][1]}).i")
        page.evaluate("i=>{interlagos.reposition(i);const s=document.querySelector('#camera');s.value='cockpit';s.dispatchEvent(new Event('change'))}", near)
        frames(page, 6)
        page.screenshot(path=str(ROOT / f'renders/agua_realista_{label}_cockpit.png'))
        # Switching off brings back the simple water and stops the extra render at once.
        set_water(page, False)
        off = page.evaluate('interlagos.waterInfo()')
        assert not off['realistic'] and off['simpleVisible'], off
        assert json.loads(page.evaluate(f"localStorage.getItem('{KEY}')"))['realisticWater'] is False
        set_water(page, True)
        frames(page)
        assert page.evaluate('interlagos.waterInfo().realistic')
        print('realistic water verified', label, flush=True)
        context.close()
    # Driving into the infield lake: the bed lies under the water (physics and visible terrain),
    # the body splashes, the wheels leave rings and spray, and the water slows the car.
    for mobile, width, height in [(False, 1280, 720), (True, 844, 390)]:
        label = 'mobile' if mobile else 'desktop'
        context = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=mobile, has_touch=mobile, device_scale_factor=1)
        context.add_init_script(f"localStorage.setItem('{KEY}',JSON.stringify({{immersive:false,realisticWater:true}}));")
        page = context.new_page(); page.set_default_timeout(120000)
        watch(page)
        open_menu(page, URL)
        enter_track(page)
        wait_race_start(page)
        page.evaluate("""async()=>{const THREE=await import('three');THREE.Scene.prototype.onBeforeRender=function(r,s,c,t){if(!t)window.waterScene=s;};}""")
        wait_js(page, 'window.waterScene')
        lake = max(page.evaluate('interlagos.waterInfo().lakes'), key=lambda l: l['area'])
        bed = page.evaluate("""level=>{let mesh=null;waterScene.traverse(o=>{if(o.isMesh&&o.material?.userData?.terrain)mesh=o;});
          const pos=mesh.geometry.attributes.position;let wet=0,visible=0,physics=0;
          for(let v=0;v<pos.count;v++){const x=pos.getX(v),y=-pos.getZ(v),w=interlagos.waterAt(x,y);if(!w||w.shore<0)continue;
           wet++;if(pos.getY(v)>w.level-.02)visible++;if(interlagos.car.terrain(x,y)>w.level-.02)physics++;}
          return {wet,visible,physics};}""", lake['level'])
        assert bed['wet'] > 500 and bed['visible'] == 0 and bed['physics'] == 0, bed
        # Start 30 m up the bank, facing the middle of the lake, already at 60 km/h with the throttle held.
        page.evaluate("""([cx,cy])=>{let best=null;for(let a=0;a<Math.PI*2;a+=Math.PI/36){const dx=Math.cos(a),dy=Math.sin(a);let s=0;
           for(;s<300;s++)if(!interlagos.waterAt(cx+dx*s,cy+dy*s))break;if(!best||s<best.s)best={s,dx,dy};}
          const c=interlagos.car,h=Math.atan2(-best.dy,-best.dx);c.x=cx+best.dx*(best.s+30);c.y=cy+best.dy*(best.s+30);c.heading=h;
          c.vx=Math.cos(h)*16.7;c.vy=Math.sin(h)*16.7;c.yaw=0;c.settle();c.stepX=c.x;c.stepY=c.y;}""", lake['center'])
        page.keyboard.down('KeyW')
        wait_js(page, 'interlagos.lakeInfo().inWater', timeout=15000)
        entry = page.evaluate('Math.hypot(interlagos.car.vx,interlagos.car.vy)')
        page.wait_for_timeout(600)
        page.screenshot(path=str(ROOT / f'renders/agua_carro_{label}_respingo.png'))
        page.wait_for_timeout(2600)
        page.screenshot(path=str(ROOT / f'renders/agua_carro_{label}_dentro.png'))
        page.keyboard.up('KeyW')
        lakeinfo = page.evaluate('interlagos.lakeInfo()')
        speed = page.evaluate('Math.hypot(interlagos.car.vx,interlagos.car.vy)')
        assert lakeinfo['inWater'] and lakeinfo['hull'] > .2 and lakeinfo['splashes'] >= 1, lakeinfo
        assert lakeinfo['ripples'] >= 5 and lakeinfo['drops'] >= 100 and lakeinfo['peakDrag'] > 5, lakeinfo
        assert speed < entry * .6, (entry, speed)
        report['drive_' + label] = {'bed': bed, 'entry': entry, 'speed': speed, **lakeinfo}
        print('car in the lake verified', label, flush=True)
        context.close()
    # Curvelo has no lakes: the setting stays on and nothing breaks.
    context = browser.new_context(viewport={'width': 1280, 'height': 720})
    context.add_init_script(f"localStorage.setItem('{KEY}',JSON.stringify({{circuit:'curvelo',immersive:false,realisticWater:true}}));")
    page = context.new_page(); page.set_default_timeout(120000)
    watch(page)
    open_menu(page, URL + '?circuito=curvelo')
    enter_track(page)
    frames(page)
    curvelo = page.evaluate('interlagos.waterInfo()')
    assert curvelo['realistic'] and curvelo['bodies'] == 0, curvelo
    report['curvelo'] = curvelo
    context.close()
    browser.close()
report['passed'] = not report['errors']
(ROOT / 'dados/validacao_agua.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2), flush=True)
assert report['passed']
