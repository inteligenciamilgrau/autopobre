"""Download only EPT octree cells intersecting Interlagos from the PMSP viewer."""
import sys,json,time,hashlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0,str(Path(__file__).parent/'_deps'))
import requests,numpy as np,laspy

ROOT=Path(__file__).resolve().parents[1]
BASE='https://ept-m3dc-pmsp.s3-sa-east-1.amazonaws.com/'
CACHE=ROOT/'fontes'/'lidar_ept'; CACHE.mkdir(exist_ok=True)
meta=json.loads((ROOT/'fontes'/'ept.json').read_text())
minimum=np.array(meta['bounds'][:3]); span=np.array(meta['bounds'][3:])-minimum
BBOX=[326250,7376700,680,327850,7378550,880]
lo=np.array(BBOX[:3]); hi=np.array(BBOX[3:])

def intersects(key):
    depth,x,y,z=map(int,key.split('-'))
    size=span/2**depth; a=minimum+np.array([x,y,z])*size
    return bool(np.all(a<=hi) and np.all(a+size>=lo))

def fetch(kind,key,ext):
    path=CACHE/(kind+'_'+key+'.'+ext)
    if path.exists():return path
    url=BASE+kind+'/'+key+'.'+ext
    for attempt in range(3):
        try:
            r=requests.get(url,timeout=45);r.raise_for_status();path.write_bytes(r.content);return path
        except Exception:
            if attempt==2:raise
            time.sleep(1)

nodes={};pending=['0-0-0-0'];seen=set()
with ThreadPoolExecutor(max_workers=6) as pool:
    while pending:
        current=[k for k in pending if k not in seen]; pending=[]; seen.update(current)
        for path in pool.map(lambda k:fetch('ept-hierarchy',k,'json'),current):
            for key,count in json.loads(path.read_text()).items():
                if not intersects(key):continue
                if count==-1:
                    if key not in seen:pending.append(key)
                elif count>0:nodes[key]=count
        print('Hierarchy',len(seen),'pages,',len(nodes),'intersecting nodes',flush=True)
    print('Points before crop',sum(nodes.values()),flush=True)
    ground=[];all_points=0
    for i,path in enumerate(pool.map(lambda k:fetch('ept-data',k,'laz'),sorted(nodes))):
        cloud=laspy.read(path)
        xyz=np.column_stack((cloud.x,cloud.y,cloud.z))
        mask=np.all(xyz>=lo,axis=1)&np.all(xyz<=hi,axis=1)&(np.asarray(cloud.classification)==2)
        ground.append(xyz[mask]);all_points+=len(cloud.points)
        if i%20==0:print('Downloaded',i+1,'/',len(nodes),'ground',sum(len(a) for a in ground),flush=True)
points=np.concatenate(ground)
np.savez_compressed(ROOT/'dados'/'lidar_solo_2017.npz',xyz=points)
report={'source':BASE,'source_linked_from':'https://visualizador-laz-web.s3-sa-east-1.amazonaws.com/index.html',
        'survey_year':2017,'classification':2,'bbox_utm31983':BBOX,'ept_nodes':len(nodes),
        'downloaded_points':all_points,'ground_points_in_bbox':len(points),
        'bounds_ground':[points.min(axis=0).tolist(),points.max(axis=0).tolist()]}
(ROOT/'dados'/'lidar_proveniencia.json').write_text(json.dumps(report,indent=2))
print('LIDAR_COMPLETE',json.dumps(report),flush=True)
