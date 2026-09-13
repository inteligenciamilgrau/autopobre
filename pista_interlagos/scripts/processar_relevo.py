"""Extrai perfil e caimento do solo LiDAR municipal. Nao inventa banking por curva."""
import sys,json,csv
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'_deps'))
import numpy as np
from scipy.spatial import cKDTree
from scipy.signal import savgol_filter
from scipy.optimize import brentq
R=Path(__file__).resolve().parents[1]
origin=np.array([327050.,7377625.,720.])
ground=np.load(R/'dados/lidar_solo_2017.npz')['xyz']-origin
xy=np.load(R/'dados/centro_utm.npy')-origin[:2]
tree=cKDTree(ground[:,:2]);n=len(xy)
t=np.roll(xy,-1,axis=0)-np.roll(xy,1,axis=0);t/=np.linalg.norm(t,axis=1)[:,None]
left=np.column_stack([-t[:,1],t[:,0]])
fits=[]
for i,point in enumerate(xy):
 ids=tree.query_ball_point(point,4.0)
 if len(ids)<12:ids=tree.query(point,k=24)[1]
 pts=ground[ids];d=pts[:,:2]-point
 A=np.column_stack([np.ones(len(d)),d@t[i],d@left[i]])
 keep=np.ones(len(d),bool)
 for _ in range(3):
  c=np.linalg.lstsq(A[keep],pts[keep,2],rcond=None)[0]
  residual=pts[:,2]-A@c;mad=np.median(abs(residual[keep]))
  keep=abs(residual)<max(.10,3*mad)
 fits.append([*c,float(np.sqrt(np.mean(residual[keep]**2))),int(keep.sum())])
f=np.array(fits)
z=savgol_filter(f[:,0],15,3,mode='wrap')
bank=savgol_filter(f[:,2],25,2,mode='wrap')
raw_xy=xy.copy()
raw_delta=np.roll(xy,-1,axis=0)-xy
dz=np.roll(z,-1)-z
raw_length=float(np.sqrt(np.sum(raw_delta**2,axis=1)+dz**2).sum())
# Calibracao explicita de escala para a metragem FIA. Preserva o Z medido.
# O mesmo fator e aplicado a todo o terreno; fonte UTM original e preservada.
scale=brentq(lambda k:np.sqrt(np.sum((raw_delta*k)**2,axis=1)+dz**2).sum()-4309,.98,1.02)
xy*=scale;bank/=scale
ds=np.linalg.norm(np.roll(xy,-1,axis=0)-xy,axis=1)
grade=(np.roll(z,-1)-np.roll(z,1))/(ds+np.roll(ds,1))
xyz=np.column_stack([xy,z]);length=float(np.linalg.norm(np.roll(xyz,-1,axis=0)-xyz,axis=1).sum())
s=np.r_[0,np.cumsum(ds[:-1])]
# Largura-base dentro do intervalo municipal. Maior na reta de largada/S do Senna.
# Larguras locais nao sao homologadas: ajuste visual, explicitado no relatorio.
width=np.full(n,12.5);width[(s<450)|(s>s[-1]-250)]=15.0
width=savgol_filter(width,51,2,mode='wrap')
samples=np.column_stack([s,xyz,width,bank,grade,t,left,f[:,3],f[:,4]])
cols=['s_xy_m','x_east_m','y_north_m','z_local_m','width_m','crossfall_left','grade','tx','ty','left_x','left_y','fit_rmse_m','ground_points']
np.savez_compressed(R/'dados/pista_processada.npz',samples=samples,origin=origin)
with open(R/'dados/perfil_pista.csv','w',newline='',encoding='utf-8-sig') as file:
 w=csv.writer(file);w.writerow(cols);w.writerows(np.round(samples,6))
stats={'nominal_fia_m':4309,'raw_3d_length_m':raw_length,'horizontal_scale_to_fia_length':scale,'reconstructed_xy_m':float(ds.sum()),'reconstructed_3d_m':length,'difference_nominal_pct':100*(length/4309-1),'elevation_min_m':float(z.min()+origin[2]),'elevation_max_m':float(z.max()+origin[2]),'elevation_range_m':float(np.ptp(z)),'grade_min_pct':float(100*grade.min()),'grade_max_pct':float(100*grade.max()),'crossfall_min_pct':float(100*bank.min()),'crossfall_max_pct':float(100*bank.max()),'fit_rmse_median_m':float(np.median(f[:,3])),'fit_rmse_p95_m':float(np.percentile(f[:,3],95)),'min_support_ground_points':int(f[:,4].min()),'samples':n,'origin_utm31983':origin.tolist(),'ground_survey_year':2017,'orthophoto_year':2020,'map_year':2025,'caveat':'Reconstrucao para jogo. Registro visual da ortofoto, escala XY calibrada para 4309m e ajuste local do LiDAR; nao equivale a levantamento homologado da superficie atual.'}
(R/'dados/validacao_geometria.json').write_text(json.dumps(stats,indent=2),encoding='utf-8')
print(json.dumps(stats,indent=2),flush=True)
# Terreno em grade 4m, interpolacao IDW dos 8 pontos de solo mais proximos.
gx=np.arange(-800,800.01,4.0);gy=np.arange(-925,925.01,4.0)
xx,yy=np.meshgrid(gx,gy);query=np.column_stack([xx.ravel(),yy.ravel()])
dist,idx=tree.query(query,k=8,workers=4);weights=1/np.maximum(dist,.15)**2
gz=(np.sum(ground[idx,2]*weights,axis=1)/weights.sum(axis=1)).reshape(xx.shape)
gx*=scale;gy*=scale
near_dist,near=cKDTree(xy).query(query*scale)
lateral=np.sum((query*scale-xy[near])*left[near],axis=1)
road_z=z[near]+bank[near]*lateral
blend=np.clip((width[near]/2+10-near_dist)/7,0,1)
visual_z=gz.ravel()*(1-blend)+(road_z-.08)*blend
np.savez_compressed(R/'dados/terreno.npz',x=gx,y=gy,z=gz,visual_z=visual_z.reshape(gz.shape))
# JSON compacto compartilhado pelo teste dirigivel.
(R/'dados/pista.json').write_text(json.dumps({'meta':stats,'columns':cols,'samples':np.round(samples,5).tolist(),'terrain':{'x0':float(gx[0]),'y0':float(gy[0]),'step':4*scale,'nx':len(gx),'ny':len(gy),'z':np.round(gz.ravel(),2).tolist()}},separators=(',',':')),encoding='utf-8')
print('TERRAIN_COMPLETE',gz.shape,flush=True)
