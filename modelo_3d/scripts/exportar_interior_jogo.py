"""Export the game's cockpit interior (pista_interlagos/teste/cockpit*.js) to a GLB for Blender, without touching the game.

Needs a Python with Playwright (the project's browser checks use the venv in %TEMP%\\pwv) and Edge. Usage, from the project root:
 python modelo_3d/scripts/exportar_interior_jogo.py [saida.glb]

A private static server maps /teste/ to pista_interlagos/teste/ and serves the export page from memory; the game
server is not used (it whitelists files and blocks in-page evaluation). cockpit.js is patched in memory only:
- its per-material merge (mergeStatic) is skipped, so every part stays a node the V06 build can sort;
- materials get names ('Int_<key>') and each mesh is named after the source line that built it.
The cockpit is exported as the game shows it inside the V06 body (cockpit.js setView, its default): lowered onto
the V06 cabin floor, dash top at the windscreen base, switch bank and mirror under the windscreen cage tube, and
without the classic box interior and the game's own cabin floor and walls (the V06 structure takes their place).
Frame: three.js car body (+X forward, +Y up, -Z driver side); the Blender glTF importer turns it into +X, +Z up,
+Y driver side, the car frame of the .blend.
"""
import http.server,json,os,re,sys,threading
from pathlib import Path
R=Path(__file__).resolve().parents[2]
GAME=R/'pista_interlagos/teste'
OUT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else R/'modelo_3d/v06_pecas_separadas/interior_jogo.glb'
EDGE=os.environ.get('INTERLAGOS_BROWSER',r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')

def patched(name,text):
 """Source edits, each asserted, so a change in the game fails loudly instead of exporting something else."""
 def sub(old,new):
  nonlocal text;assert old in text,(name,old);text=text.replace(old,new,1)
 if name=='cockpit.js':
  sub('function mergeStatic(parent){','function mergeStatic(parent){return;')
  sub('const m=createInteriorMaterials(renderer);',
   "const m=createInteriorMaterials(renderer);for(const [k,v] of Object.entries(m))if(v&&v.isMaterial)v.name='Int_'+k;")
  sub('const kit={','for(const [k,v] of Object.entries({silver,chrome,steel,red,yellow,bezel,paintBoth,paintSatin}))v.name=\'Int_\'+k;const kit={')
  # Name every mesh after the first stack frame outside the helpers: file and line of the statement that built it.
  sub('function mesh(g,material,p,parent=root){const o=new THREE.Mesh(g,material);',
   'function mesh(g,material,p,parent=root){const o=new THREE.Mesh(g,material);o.name=globalThis.__origin(new Error().stack);')
 return text

PAGE='''<!doctype html><meta charset="utf-8"><title>export</title>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<canvas id="c" width="64" height="64"></canvas>
<script type="module">
import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
const HELPERS=/\\b(mesh|box|bar|padding|seatPart|decal|cable|tube|coil)\\b/;
globalThis.__origin=stack=>{
 // Frames look like "at box (http://host/teste/cockpit.js:43:120)": skip the kit helpers and keep file:line.
 for(const line of stack.split('\\n').slice(2)){
  const m=line.match(/at (?:(\\S+) )?\\(?.*\\/teste\\/([\\w-]+)\\.js:(\\d+):\\d+\\)?/);
  if(m&&!(m[1]&&HELPERS.test(m[1])))return `${m[2]}_L${m[3]}`;
 }
 return 'desconhecido';
};
const log=[];window.__log=log;
try{
 const {createCockpit}=await import('./cockpit.js');
 const renderer=new THREE.WebGLRenderer({canvas:document.getElementById('c')});
 const cockpit=createCockpit(renderer),root=cockpit.root;root.visible=true;
 // Only the V06 placement goes out: the classic box interior and the game's cabin shell stay in the game.
 for(const name of ['Casca_classica','Cabine_piso_paredes'])root.getObjectByName(name).removeFromParent();
 root.traverse(o=>{o.visible=true;});
 // Wait for every image the materials use (scanned maps, the banner PNG); canvases are already drawn.
 const textures=new Set();
 root.traverse(o=>{if(!o.isMesh)return;for(const mat of [o.material].flat())for(const v of Object.values(mat))if(v&&v.isTexture)textures.add(v);});
 const ready=t=>t.isRenderTargetTexture||t.isDataTexture||(t.image&&(t.image.complete===undefined||t.image.complete)&&(t.image.width>0));
 for(let i=0;i<600&&![...textures].every(ready);i++)await new Promise(r=>setTimeout(r,100));
 const missing=[...textures].filter(t=>!ready(t));if(missing.length)throw Error('texturas sem carregar: '+missing.length);
 // JPEG sources stay JPEG in the GLB (PNG would triple the size). The mirror's render target cannot be exported:
 // it becomes a plain mirror material named like the car's own (Espelho).
 for(const t of textures)if(t.image&&t.image.src&&/\\.jpe?g$/i.test(t.image.src))t.userData.mimeType='image/jpeg';
 root.traverse(o=>{if(o.isMesh&&o.material.map&&o.material.map.isRenderTargetTexture){o.material=new THREE.MeshStandardMaterial({color:0xdde3e8,metalness:1,roughness:.04});o.material.name='Espelho';o.name='Espelho_retrovisor_interno';}});
 const unnamed=new Map();
 root.traverse(o=>{if(!o.isMesh)return;for(const mat of [o.material].flat())if(!mat.name){const c=mat.color?mat.color.getHexString():'x';const key=`Int_${mat.type.replace('Mesh','').replace('Material','').toLowerCase()}_${c}`;mat.name=key;}});
 const glb=await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:false,maxTextureSize:2048});
 let meshes=0,tris=0;root.traverse(o=>{if(o.isMesh){meshes++;const g=o.geometry;tris+=(g.index?g.index.count:g.attributes.position.count)/3;}});
 await fetch('/upload',{method:'POST',body:glb});
 window.__done={bytes:glb.byteLength,meshes,tris:Math.round(tris),textures:textures.size};
}catch(e){window.__done={error:String(e&&e.stack||e)};}
</script>'''

class Handler(http.server.SimpleHTTPRequestHandler):
 extensions_map={**http.server.SimpleHTTPRequestHandler.extensions_map,'.js':'text/javascript','.mjs':'text/javascript'}
 def log_message(self,*a):pass
 def send_text(self,body,kind):
  data=body.encode('utf-8');self.send_response(200);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
 def do_GET(self):
  path=self.path.split('?')[0]
  if path=='/teste/export.html':return self.send_text(PAGE,'text/html')
  if not path.startswith('/teste/'):return self.send_error(404)
  f=(GAME/path[len('/teste/'):]).resolve()
  if GAME not in f.parents or not f.is_file():return self.send_error(404)
  if f.suffix=='.js':return self.send_text(patched(f.name,f.read_text(encoding='utf-8')),'text/javascript')
  data=f.read_bytes();self.send_response(200);self.send_header('Content-Type',self.guess_type(str(f)));self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_POST(self):
  if self.path!='/upload':return self.send_error(404)
  data=self.rfile.read(int(self.headers['Content-Length']));OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_bytes(data)
  self.send_response(200);self.send_header('Content-Length','0');self.end_headers()

def main():
 from playwright.sync_api import sync_playwright
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
 url=f'http://127.0.0.1:{server.server_port}/teste/export.html'
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=EDGE if Path(EDGE).is_file() else None,headless=True,args=['--use-angle=d3d11','--enable-webgl','--ignore-gpu-blocklist'])
  page=browser.new_page();errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(url)
  page.wait_for_function('window.__done',timeout=180000)
  done=page.evaluate('window.__done');browser.close()
 server.shutdown()
 if 'error' in done or errors:raise SystemExit(f'export failed: {done} {errors}')
 print('INTERIOR_GLB',OUT,json.dumps(done),flush=True)
if __name__=='__main__':main()
