"""Extrai perfil e caimento do solo LiDAR municipal. Nao inventa banking por curva.

Usa o eixo e as larguras de scripts/refinar_tracado.py (ortofoto de 20 cm) e o
pit lane tracado na mesma imagem. Em cada estacao a cada ~2 m ajusta um plano aos
pontos de solo sobre o proprio asfalto (+-2,5 m ao longo, entre as linhas de borda),
com rejeicao robusta de residuos; o plano da a cota central e o caimento transversal.
"""
import sys,json,csv
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'_deps'))
import numpy as np
from scipy.spatial import cKDTree
from scipy.signal import savgol_filter
from scipy.ndimage import uniform_filter1d
from scipy.optimize import brentq
R=Path(__file__).resolve().parents[1]
origin=np.array([327050.,7377625.,720.])
ground=np.load(R/'dados/lidar_solo_2017.npz')['xyz']-origin
tree=cKDTree(ground[:,:2])
E=np.load(R/'dados/eixo_refinado.npz');xy=E['xy']-origin[:2];line_width=E['width'];n=len(xy)
B=np.load(R/'dados/boxes_utm.npz')
# Asphalt reaches a little past the painted edge lines.
width=np.maximum(line_width+.5,8.5)

def frame(p,closed):
 t=(np.roll(p,-1,axis=0)-np.roll(p,1,axis=0)) if closed else np.gradient(p,axis=0)
 t/=np.linalg.norm(t,axis=1)[:,None];return t,np.column_stack([-t[:,1],t[:,0]])

def fit_planes(centre,t,left,lo,hi,along=2.5):
 """Plane z=a+b*along+c*across on ground points over the paved band."""
 out=[]
 for i,point in enumerate(centre):
  reach=float(np.hypot(along,max(abs(lo[i]),abs(hi[i]))))
  ids=tree.query_ball_point(point,reach)
  d=ground[ids,:2]-point if ids else np.zeros((0,2))
  a=d@t[i] if len(d) else d;c=d@left[i] if len(d) else d
  keep_band=(np.abs(a)<=along)&(c>=lo[i]+.2)&(c<=hi[i]-.2) if len(d) else np.zeros(0,bool)
  if keep_band.sum()<12:
   ids=tree.query(point,k=24)[1];d=ground[ids,:2]-point;a=d@t[i];c=d@left[i];keep_band=np.ones(len(ids),bool)
  pts=ground[np.asarray(ids)[keep_band]];a=a[keep_band];c=c[keep_band]
  A=np.column_stack([np.ones(len(a)),a,c]);keep=np.ones(len(a),bool)
  for _ in range(3):
   coef=np.linalg.lstsq(A[keep],pts[keep,2],rcond=None)[0]
   residual=pts[:,2]-A@coef;mad=np.median(abs(residual[keep]))
   keep=abs(residual)<max(.10,3*mad)
  out.append([*coef,float(np.sqrt(np.mean(residual[keep]**2))),int(keep.sum())])
 return np.array(out)

t,left=frame(xy,True)
f=fit_planes(xy,t,left,-width/2,width/2)
z=savgol_filter(f[:,0],13,3,mode='wrap')
bank=savgol_filter(f[:,2],15,2,mode='wrap')
raw_delta=np.roll(xy,-1,axis=0)-xy
dz=np.roll(z,-1)-z
raw_length=float(np.sqrt(np.sum(raw_delta**2,axis=1)+dz**2).sum())
# Calibracao explicita de escala para a metragem FIA. Preserva o Z medido.
# O mesmo fator e aplicado a todo o terreno e ao pit lane; fonte UTM original e preservada.
scale=brentq(lambda k:np.sqrt(np.sum((raw_delta*k)**2,axis=1)+dz**2).sum()-4309,.98,1.02)
xy=xy*scale;bank/=scale;width*=scale
ds=np.linalg.norm(np.roll(xy,-1,axis=0)-xy,axis=1)
grade=(np.roll(z,-1)-np.roll(z,1))/(ds+np.roll(ds,1))
xyz=np.column_stack([xy,z]);length=float(np.linalg.norm(np.roll(xyz,-1,axis=0)-xyz,axis=1).sum())
s=np.r_[0,np.cumsum(ds[:-1])];L=float(ds.sum())
kerb=np.column_stack([E['kerb_right'],E['kerb_left']]).astype(float)
samples=np.column_stack([s,xyz,width,bank,grade,t,left,f[:,3],f[:,4],kerb])
cols=['s_xy_m','x_east_m','y_north_m','z_local_m','width_m','crossfall_left','grade','tx','ty','left_x','left_y','fit_rmse_m','ground_points','kerb_right','kerb_left']

def main_surface(q):
 """Nearest main-track station: s, lateral offset, and the banked road height."""
 k=cKDTree(xy).query(q)[1];p=xy[k];dd=q-p
 along=dd@t[k] if q.ndim==1 else np.sum(dd*t[k],axis=1)
 lat=dd@left[k] if q.ndim==1 else np.sum(dd*left[k],axis=1)
 return k,(s[k]+along)%L,lat,z[k]+grade[k]*along+bank[k]*lat

# --- Pit lane (entrada apos o Cafe, garagens, saida pelo S do Senna ate a Reta Oposta).
pxy=(B['xy']-origin[:2])*scale;ps=B['s']*scale
pt,pl=frame(pxy,False)
lane_lo=B['lane_lo']*scale;lane_hi=B['lane_hi']*scale;fast_hi=B['fast_hi']*scale
entry_open,wall_nose,wall_end=(float(B[k])*scale for k in ('entry_open','wall_nose','wall_end'))
garages=B['garages']*scale
# Distance from the pit lane's track-side line to the main track's edge.
edge=pxy+pl*lane_lo[:,None];k_edge,_,lat_edge,_=main_surface(edge)
gap=np.maximum(0,lat_edge-width[k_edge]/2)
# Along the garages the pit wall platform keeps one width (5.0 m between the
# track edge and the pit lane line on the orthophoto); the line detector can
# jump between the parallel painted lines there, so the edge follows the track.
ramp=lambda x,a,b:np.clip((x-a)/(b-a),0,1)
PLATFORM=5.0
zone=ramp(ps,garages[0]-45,garages[0]-25)*(1-ramp(ps,garages[1]+5,garages[1]+25))
lane_lo=lane_lo+(PLATFORM-gap)*zone;fast_hi=np.maximum(fast_hi,lane_lo+4.5*zone)
edge=pxy+pl*lane_lo[:,None];k_edge,_,lat_edge,_=main_surface(edge)
gap=np.maximum(0,lat_edge-width[k_edge]/2)
# The painted gore (entry) and kerbed merge (exit) are paved up to the track edge.
paved_lo=lane_lo.copy();fill=(ps<wall_nose)|((ps>wall_end)&(gap<6))
paved_lo[fill]-=gap[fill]
paved_hi=lane_hi.copy()
# Room to drive: outside the garages the paved lane is at least 7.5 m wide. The
# painted lines stay where they are; the rest is shoulder, taken toward the track
# only where the gap still leaves room for the wall.
W_MIN=7.5
garage_zone=(ps>=garages[0]-12)&(ps<=garages[1]+4)
full_garages=(ps>=garages[0]+8)&(ps<=garages[1]-8)
need=np.where(full_garages,0,np.maximum(0,W_MIN-(paved_hi-paved_lo)))
free_lo=np.where(fill,0,np.clip(gap-2.4,0,None))
ext_lo=uniform_filter1d(np.minimum(need/2,free_lo),7,mode='nearest');ext_hi=uniform_filter1d(np.maximum(0,need-ext_lo),7,mode='nearest')
paved_lo-=ext_lo;paved_hi+=ext_hi
pf=fit_planes(pxy/scale,pt,pl,paved_lo/scale,paved_hi/scale)
pz=savgol_filter(pf[:,0],11,3,mode='nearest');pbank=savgol_filter(pf[:,2],11,2,mode='nearest')/scale
# Where the lanes touch, the pit lane continues the track's own banked plane.
_,main_s,lat_c,z_main=main_surface(pxy)
end=ps[-1];w_join=np.maximum(1-ramp(ps,entry_open,entry_open+70),ramp(ps,end-90,end-15))
k_c=cKDTree(xy).query(pxy)[1]
pz=pz*(1-w_join)+z_main*w_join;pbank=pbank*(1-w_join)+bank[k_c]*(pt[:,0]*t[k_c,0]+pt[:,1]*t[k_c,1])*w_join
pds=np.linalg.norm(np.diff(pxy,axis=0),axis=1);pgrade=np.gradient(pz,np.r_[0,np.cumsum(pds)])
# Lap distance for timing while on the pit lane: projected where the pit lane runs
# alongside the track (entry, garages, final merge), interpolated through the S.
unwrapped=np.unwrap(main_s,period=L);align=pt[:,0]*t[k_c,0]+pt[:,1]*t[k_c,1]
reliable=(np.abs(lat_c)<25)&(align>.97);reliable[[0,-1]]=True
anchor_s,anchor_u=[],[]
for a,u in zip(ps[reliable],unwrapped[reliable]):
 if not anchor_u or u>anchor_u[-1]+.01:anchor_s.append(a);anchor_u.append(u)
main_s=np.interp(ps,anchor_s,anchor_u)%L
# Speed-limit zone: from before the first garage to past the last one (painted lines).
limit=(float(garages[0]-40*scale),float(garages[1]+15*scale))
def poly(offsets,a,b,thickness):
 m=(ps>=a)&(ps<=b);q=pxy[m]+pl[m]*offsets[m][:,None]
 zp=np.interp(ps[m],ps,pz)+np.interp(ps[m],ps,pbank)*offsets[m]
 return np.column_stack([q,zp,np.broadcast_to(thickness,ps.shape)[m]]).round(3).tolist()
# Pit wall between the track and the pit lane. Along the straight it is the
# concrete platform seen on the orthophoto, filling the gap to 0.6 m of each
# road; where the roads part it narrows to a 0.6 m wall 1.5 m clear of the lane.
gap_p=np.maximum(0,gap-(lane_lo-paved_lo))
clear=.6+.9*ramp(gap_p,6,9)
wall_th=np.where(gap_p<=6,np.maximum(gap_p-1.2,.6),np.clip(4.8-(gap_p-6)*1.4,.6,4.8))
wall_off=paved_lo-clear-wall_th/2
# Box 99 (the team's garage, open) and the Lanchonete da Tia in the bay before it.
bays=max(1,round((garages[1]-garages[0])/(13*scale)));bay=(garages[1]-garages[0])/bays
BOX99=10;s99=garages[0]+(BOX99+.5)*bay;s_cafe=s99-bay;DEPTH=16.0
front=float(np.interp(s99,ps,paved_hi))
def at(sv,d):
 c=np.array([np.interp(sv,ps,pxy[:,0]),np.interp(sv,ps,pxy[:,1])]);n=np.array([np.interp(sv,ps,pl[:,0]),np.interp(sv,ps,pl[:,1])]);n/=np.linalg.norm(n)
 q=c+n*d;return [round(float(q[0]),3),round(float(q[1]),3),round(float(np.interp(sv,ps,pz)+np.interp(sv,ps,pbank)*d),3)]
# Garage walls: forward side, back, café side and the café storefront.
box_walls=[at(s99+bay/2,front+.2),at(s99+bay/2,front+DEPTH+.3),at(s_cafe-bay/2,front+DEPTH+.3),at(s_cafe-bay/2,front+.2),at(s99-bay/2,front+.2)]
# Railing between the garage and the café, with a walkway too narrow for the car.
rail=[[at(s99-bay/2,front+.6),at(s99-bay/2,front+4.3)],[at(s99-bay/2,front+5.7),at(s99-bay/2,front+DEPTH)]]
inside=np.abs(ps-s99)<=bay/2-.45
paved_hi_garage=paved_hi.copy();paved_hi_garage[inside]=front+DEPTH
outer=paved_hi+np.where(garage_zone,.35,1.5)
walls=[{'name':'Muro_boxes','points':poly(wall_off,wall_nose,wall_end,wall_th),'height':1.05,'fence':2.6,'fence_side':-1},
 {'name':'Muro_externo_boxes','points':poly(outer,6,s99-bay/2,.4),'height':1.0,'fence':0},
 {'name':'Muro_externo_boxes','points':poly(outer,s99+bay/2,end-20,.4),'height':1.0,'fence':0},
 {'name':'Box99_paredes','points':[q+[.3] for q in box_walls],'height':5.2,'fence':0},
 *({'name':'Box99_divisoria','points':[q+[.12] for q in r],'height':1.1,'fence':0} for r in rail)]
paved_hi=paved_hi_garage
pit_samples=np.column_stack([ps,pxy,pz,paved_lo,paved_hi,pbank,pgrade,pt,pl,main_s,lane_lo,lane_hi,fast_hi,gap])
pit={'columns':['s','x','y','z','lo','hi','bank','grade','tx','ty','lx','ly','main_s','lane_lo','lane_hi','fast_hi','gap'],
 'samples':np.round(pit_samples,4).tolist(),'length_m':float(end),'entry_open':entry_open,'wall_nose':wall_nose,'wall_end':wall_end,
 'garages':garages.round(2).tolist(),'limit':{'from':limit[0],'to':limit[1],'kmh':60},'walls':walls,
 'box99':{'index':BOX99,'s':float(s99),'bay':float(bay),'cafe_s':float(s_cafe),'front':front,'depth':DEPTH},
 'entry_main_s':float(main_s[0]),'exit_main_s':float(main_s[-1]),
 'source':'Ortofoto GeoSampa 2020 (20 cm) e mapa/desenho do pit lane FIA 2025; cotas do LiDAR PMSP 2017.'}
print('pit lane',round(end,1),'m; entra em s',round(main_s[0],1),'volta em s',round(main_s[-1],1),flush=True)

np.savez_compressed(R/'dados/pista_processada.npz',samples=samples,origin=origin,pit=pit_samples)
with open(R/'dados/perfil_pista.csv','w',newline='',encoding='utf-8-sig') as file:
 w=csv.writer(file);w.writerow(cols);w.writerows(np.round(samples,6))
stats={'nominal_fia_m':4309,'raw_3d_length_m':raw_length,'horizontal_scale_to_fia_length':scale,'reconstructed_xy_m':L,'reconstructed_3d_m':length,'difference_nominal_pct':100*(length/4309-1),'elevation_min_m':float(z.min()+origin[2]),'elevation_max_m':float(z.max()+origin[2]),'elevation_range_m':float(np.ptp(z)),'grade_min_pct':float(100*grade.min()),'grade_max_pct':float(100*grade.max()),'crossfall_min_pct':float(100*bank.min()),'crossfall_max_pct':float(100*bank.max()),'fit_rmse_median_m':float(np.median(f[:,3])),'fit_rmse_p95_m':float(np.percentile(f[:,3],95)),'min_support_ground_points':int(f[:,4].min()),'samples':n,'width_min_m':float(width.min()),'width_max_m':float(width.max()),'kerb_m':float(kerb.sum()*2*scale),'pit_lane_m':float(end),'origin_utm31983':origin.tolist(),'ground_survey_year':2017,'orthophoto_year':2020,'map_year':2025,'centreline':'ortofoto GeoSampa 2020 de 20 cm, linhas de borda (scripts/refinar_tracado.py)','caveat':'Reconstrucao para jogo. Eixo e larguras pelas linhas pintadas da ortofoto, escala XY calibrada para 4309m e ajuste local do LiDAR; nao equivale a levantamento homologado da superficie atual.'}
(R/'dados/validacao_geometria.json').write_text(json.dumps(stats,indent=2),encoding='utf-8')
print(json.dumps(stats,indent=2),flush=True)
# Terreno em grade 4m, interpolacao IDW dos 8 pontos de solo mais proximos.
gx=np.arange(-800,800.01,4.0);gy=np.arange(-925,925.01,4.0)
xx,yy=np.meshgrid(gx,gy);query=np.column_stack([xx.ravel(),yy.ravel()])
dist,idx=tree.query(query,k=8,workers=4);weights=1/np.maximum(dist,.15)**2
gz=(np.sum(ground[idx,2]*weights,axis=1)/weights.sum(axis=1)).reshape(xx.shape)
gx*=scale;gy*=scale;q=query*scale
near_dist,near=cKDTree(xy).query(q)
lateral=np.sum((q-xy[near])*left[near],axis=1)
road_z=z[near]+bank[near]*lateral
blend=np.clip((width[near]/2+10-near_dist)/7,0,1)
# Same collar around the pit lane's paved band.
pd_,pn_=cKDTree(pxy).query(q);plat=np.sum((q-pxy[pn_])*pl[pn_],axis=1)
pout=np.maximum(paved_lo[pn_]-plat,plat-paved_hi[pn_]);pout=np.where(pd_<40,np.maximum(pout,0),99)
pit_z=pz[pn_]+pbank[pn_]*np.clip(plat,paved_lo[pn_],paved_hi[pn_])
pblend=np.clip((6-pout)/5,0,1)*(pd_<40)
# The nearer road shapes the ground: inside the pit lane the pit profile wins
# even within the track's collar (the flat garage lane sits below the straight).
mout=near_dist-width[near]/2
use_pit=(pblend>0)&((pout<mout)|(pblend>blend))
road_z=np.where(use_pit,pit_z,road_z);blend=np.maximum(blend,pblend)
visual_z=gz.ravel()*(1-blend)+(road_z-.08)*blend
np.savez_compressed(R/'dados/terreno.npz',x=gx,y=gy,z=gz,visual_z=visual_z.reshape(gz.shape))
# JSON compacto compartilhado pelo teste dirigivel.
(R/'dados/pista.json').write_text(json.dumps({'meta':stats,'columns':cols,'samples':np.round(samples,5).tolist(),'pit':pit,'terrain':{'x0':float(gx[0]),'y0':float(gy[0]),'step':4*scale,'nx':len(gx),'ny':len(gy),'z':np.round(gz.ravel(),2).tolist()}},separators=(',',':')),encoding='utf-8')
print('TERRAIN_COMPLETE',gz.shape,flush=True)
