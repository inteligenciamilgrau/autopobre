"""Refina o eixo do circuito e traca o pit lane sobre a ortofoto GeoSampa 2020 de 20 cm.

Entrada: dados/pista.json (eixo anterior, registrado em imagem de ~1 m/px).
Saidas (EPSG:31983, metros, sem o fator de escala do jogo):
  dados/eixo_refinado.npz  eixo a cada 2 m, largura entre as linhas de borda
  dados/boxes_utm.npz      eixo, bordas pintadas e area pavimentada do pit lane
  dados/registro_tracado.json  metodo, pontos de controle e estatisticas

Metodo: a imagem e retificada ao longo do eixo (transectos a cada 0,5 m, 0,1 m por
amostra). Um indice de "linha branca continua" e um indice de "nao asfalto" (grama,
terra, pintura verde-agua das areas de escape, zebra amarela) alimentam uma
programacao dinamica que escolhe, estacao a estacao, deslocamento do centro e
largura, com continuidade. Duas passadas: a segunda corre ao longo do eixo ja
corrigido para evitar distorcao dos transectos nos grampos.
O pit lane parte de pontos de controle lidos na mesma ortofoto (lista abaixo) e
passa pelo mesmo ajuste; a area de trabalho diante das garagens e a entrada, onde
a faixa ainda encosta na pista, sao acrescentadas explicitamente.
"""
import sys,json,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'_deps'))
import numpy as np
from PIL import Image
from scipy.interpolate import CubicSpline
from scipy.ndimage import map_coordinates,uniform_filter1d,maximum_filter1d,median_filter
from scipy.signal import savgol_filter
R=Path(__file__).resolve().parents[1]
TILES=R/'fontes'/'orto_20cm'
WMS='https://raster.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wms'
X0,Y0,X1,Y1,PX=326250,7376700,327850,7378700,.2
DD,DS=.1,.5
Image.MAX_IMAGE_PIXELS=None

def tiles():
 """Blocos 400 x 400 m a 0,2 m/px da camada ORTO_RGB_2020."""
 TILES.mkdir(parents=True,exist_ok=True)
 import requests
 for x in range(X0,X1,400):
  for y in range(Y0,Y1,400):
   f=TILES/f't_{x}_{y}.jpg'
   if f.exists() and f.stat().st_size>0:continue
   params=dict(service='WMS',version='1.3.0',request='GetMap',crs='EPSG:31983',styles='',format='image/jpeg',layers='ORTO_RGB_2020',width=2000,height=2000,bbox=f'{x},{y},{x+400},{y+400}')
   r=requests.get(WMS,params=params,timeout=180);r.raise_for_status();f.write_bytes(r.content)
 cache=TILES/'mosaico.npy'
 if not cache.exists():
  m=np.zeros((int((Y1-Y0)/PX),int((X1-X0)/PX),3),np.uint8)
  for f in TILES.glob('t_*.jpg'):
   _,x,y=f.stem.split('_');c=int((int(x)-X0)/PX);r=int((Y1-int(y)-400)/PX)
   m[r:r+2000,c:c+2000]=np.asarray(Image.open(f).convert('RGB'))
  np.save(cache,m)
 return np.load(cache,mmap_mode='r')

M=None
def rgb(u):
 p=np.asarray(u).reshape(-1,2);col=(p[:,0]-X0)/PX-.5;row=(Y1-p[:,1])/PX-.5
 out=np.stack([map_coordinates(M[...,k],[row,col],order=1,mode='nearest') for k in range(3)],-1)
 return out.reshape(*np.shape(u)[:-1],3)

def features(img):
 f=img.astype(np.float32);r,g,b=f[...,0],f[...,1],f[...,2]
 lum=(r+g+b)/3;sat=f.max(-1)-f.min(-1)
 white=np.clip((lum-150)/50,0,1)*np.clip((50-sat)/25,0,1)
 teal=(b>r+22)&(g>r+22);veg=(g>r+4)&(g>b+10)&(sat>18);bare=(r>g+6)&(r>b+20)&(sat>22);kerb=(r>b+60)&(g>b+40)
 return white,np.clip(teal+veg+bare+kerb,0,1).astype(np.float32)

def frames(cs,ss):
 P=cs(ss);T=cs(ss,1);T/=np.linalg.norm(T,axis=1)[:,None];return P,np.column_stack([-T[:,1],T[:,0]])

def edges(P,N,closed,omax,wmin,wmax,hi_max=None):
 """Programacao dinamica sobre (deslocamento, largura) por estacao."""
 dmax=omax+wmax/2+2;d=np.arange(-dmax,dmax+1e-9,DD)
 white,nonroad=features(rgb(P[:,None,:]+d[None,:,None]*N[:,None,:]))
 mode='wrap' if closed else 'nearest'
 line=maximum_filter1d(uniform_filter1d(white,9,axis=0,mode=mode),3,axis=1)
 line=np.clip(line-.6*np.maximum(np.roll(line,6,1),np.roll(line,-6,1)),0,1)
 nr=uniform_filter1d(nonroad,5,axis=0,mode=mode);cum=np.concatenate([np.zeros((len(nr),1),np.float32),np.cumsum(nr,1)],1)
 os_=np.arange(-omax,omax+1e-9,DD);ws=np.arange(wmin,wmax+1e-9,DD);O,W=np.meshgrid(os_,ws,indexing='ij')
 cl=np.clip(np.round((O-W/2+dmax)/DD).astype(int),0,len(d)-1);cr=np.clip(np.round((O+W/2+dmax)/DD).astype(int),0,len(d)-1)
 il=np.clip(cl+4,0,len(d));ir=np.clip(cr-4,0,len(d));cnt=np.maximum(ir-il,1)
 n=len(P);shape=O.shape;back=np.zeros((n,)+shape,np.int8);moves=[(i,j) for i in (-1,0,1) for j in (-1,0,1)]
 # A closed lap runs twice, so the first station has a settled history.
 order=np.r_[np.arange(n),np.arange(n)] if closed else np.arange(n)
 for k,r in enumerate(order):
  e=-(line[r,cl]+line[r,cr])+2.2*(cum[r,ir]-cum[r,il])/cnt
  if hi_max is not None and np.isfinite(hi_max[r]):e=e+np.where(O+W/2>hi_max[r]+.15,5.,0.)
  if k==0:D=e.astype(np.float32);continue
  Dp=np.pad(D,1,constant_values=np.inf);best=np.full(shape,np.inf,np.float32);arg=np.zeros(shape,np.int8)
  for m,(i,j) in enumerate(moves):
   c=Dp[1-i:1-i+shape[0],1-j:1-j+shape[1]]+.05*(abs(i)+abs(j));better=c<best;best[better]=c[better];arg[better]=m
  D=best+e;D-=D.min()
  if not closed or k>=n:back[r]=arg
 idx=np.unravel_index(np.argmin(D),shape);path=np.zeros((n,2),int)
 for r in range(n-1,-1,-1):
  path[r]=idx
  if r>0 or closed:i,j=moves[back[r][idx]];idx=(idx[0]-i,idx[1]-j)
 return os_[path[:,0]],ws[path[:,1]]

def periodic(c):
 s=np.r_[0,np.cumsum(np.linalg.norm(np.roll(c,-1,0)-c,axis=1))];return CubicSpline(s,np.vstack([c,c[0]]),bc_type='periodic'),s[-1]

# Pontos de controle do pit lane (UTM - 326000 / 7377000), lidos na ortofoto de 20 cm:
# entrada logo apos o Cafe (linha transversal em N 7377945), chicane antes das
# garagens, faixa rapida, passagem sob a passarela, curva com zebras, via murada
# por dentro do S do Senna e da Curva do Sol e retorno na Reta Oposta.
PIT_CONTROL=[(641.6,946),(641.0,938),(638.0,900),(638.5,860),(642.0,830),(651.0,800),(657.0,770),(661.0,740),(665.5,710),
 (671.0,680),(678.5,650),(686.0,620),(693.3,590),(697.6,560),(704.9,530),(712.2,500),(719.5,470),(726.8,440),
 (734.1,410),(740.5,380),(747,350),(754,320),(763,300),(770,283),(782.2,272.2),(806.7,284.4),(828.9,296.7),
 (851.1,312.2),(864.4,322.2),(884.4,333.5),(906.7,334),(928.9,325.6),(962.2,311.1),(993,301.3),(1033,302.7),
 (1073,313),(1100,330.7),(1116,354.7),(1118,380),(1122,400),(1130,427),(1138,453),(1144,475)]
# Trechos lidos na imagem retificada (metros ao longo dos pontos de controle):
PIT_ENTRY_OPEN=54     # ate aqui a faixa encosta na pista: vai da linha continua a borda leste
PIT_WALL_NOSE=173     # bico do muro dos boxes (defensa curva pintada)
GARAGES=(353,663)     # area de trabalho diante das garagens, 4 m alem da faixa rapida
WORK_LANE=4.0
PIT_WALL_END=1103     # dali em diante so zebras separam o pit lane da pista

def main():
 global M
 M=tiles();t0=time.time()
 J=json.loads((R/'dados/pista.json').read_text());A=np.array(J['samples']);K=J['meta']['horizontal_scale_to_fia_length'];O=np.array(J['meta']['origin_utm31983'][:2])
 old=A[:,1:3]/K+O;start=old[0].copy()
 cs,L=periodic(old);ss=np.arange(0,L,DS);P,N=frames(cs,ss)
 off,wid=edges(P,N,True,13.,8.,20.)
 print('passada 1',round(time.time()-t0),'s; desvio mediano',round(float(np.median(abs(off))),2),'m',flush=True)
 c=P+N*off[:,None];c=np.column_stack([savgol_filter(c[:,k],21,2,mode='wrap') for k in range(2)])
 cs,L=periodic(c);c=cs(np.arange(0,L,2.));cs,L=periodic(c);ss=np.arange(0,L,DS);P,N=frames(cs,ss)
 off2,wid2=edges(P,N,True,4.,8.,21.)
 lo,hi=off2-wid2/2,off2+wid2/2
 print('passada 2',round(time.time()-t0),'s',flush=True)
 # Pit lane: pontos de controle, ajuste e acrescimos explicitos.
 pc=np.array(PIT_CONTROL)+[326000,7377000];seg=np.linalg.norm(np.diff(pc,axis=0),axis=1);sp=np.r_[0,np.cumsum(seg)]
 pcs=CubicSpline(sp,pc);ps=np.arange(0,sp[-1],DS);PP,PN=frames(pcs,ps)
 po,pw=edges(PP,PN,False,8.,4.5,10.)
 plo=savgol_filter(po-pw/2,21,2);phi=savgol_filter(po+pw/2,21,2)
 open_=ps<=PIT_ENTRY_OPEN;phi[open_]=np.maximum(phi[open_],0.)
 ramp=lambda x,a,b:np.clip((x-a)/(b-a),0,1)
 work=WORK_LANE*ramp(ps,GARAGES[0]-8,GARAGES[0]+8)*(1-ramp(ps,GARAGES[1]-8,GARAGES[1]+8))
 fast_hi=phi.copy();phi=phi+work
 pcen=PP+PN*((plo+phi)/2)[:,None]
 # Main track at the pit entry and at the final merge: the painted lines of the two
 # lanes run together and the detected track edge jumps between them, which bent
 # the centre line sideways (a false S on the straights). There the track edge is
 # bridged from the stations on either side; track and pit lane overlap a little.
 edge_lo=PP+PN*plo[:,None]
 merge=np.zeros(len(P),bool)
 for i in range(len(P)):
  rel=edge_lo-P[i];a=rel@N[i];t=rel@np.array([N[i,1],-N[i,0]])
  near=np.abs(t)<1.5
  if near.any():merge[i]=np.any(np.abs(a[near]-hi[i])<3)
 merge=maximum_filter1d(merge,61,mode='wrap')
 idx=np.arange(len(P));hi=np.where(merge,np.interp(idx,idx[~merge],hi[~merge],period=len(P)),hi)
 print('estacoes da borda ligadas nas juncoes do pit lane',int(merge.sum()),flush=True)
 # Smooth each painted edge on its own, then the centre line over ~20 m (a cubic
 # fit keeps the hairpins) so 0.2 m of line noise cannot read as steering.
 smooth=lambda v:uniform_filter1d(median_filter(v,9,mode='wrap'),11,mode='wrap')
 lo=smooth(lo);hi=smooth(hi)
 cen=P+N*((lo+hi)/2)[:,None];w=uniform_filter1d(hi-lo,21,mode='wrap')
 cen=np.column_stack([savgol_filter(cen[:,k],41,3,mode='wrap') for k in range(2)])
 # Resample to 2 m from the control line kept at the previous timing position.
 s=np.r_[0,np.cumsum(np.linalg.norm(np.roll(cen,-1,0)-cen,axis=1))];L=s[-1]
 ccs=CubicSpline(s,np.vstack([cen,cen[0]]),bc_type='periodic');wcs=CubicSpline(s,np.r_[w,w[0]],bc_type='periodic')
 dense=ccs(np.arange(0,L,.05));s0=np.argmin(np.linalg.norm(dense-start,axis=1))*.05
 out_s=(s0+np.arange(0,L,2.))%L;centre=ccs(out_s);width=wcs(out_s)
 # Kerbs: 0.3-1.1 m outside each edge line, painted blocks alternate along the
 # track, so the mean brightness step between 0.2 m samples is high.
 t=np.roll(centre,-1,0)-np.roll(centre,1,0);t/=np.linalg.norm(t,axis=1)[:,None];nrm=np.column_stack([-t[:,1],t[:,0]])
 across=np.arange(.3,1.15,.1);along=np.arange(-3,3.01,.2);kerb=np.zeros((len(centre),2))
 for k,side in enumerate((-1,1)):
  off=side*(width[:,None,None]/2+across[None,None,:])
  pts=centre[:,None,None,:]+along[None,:,None,None]*t[:,None,None,:]+off[...,None]*nrm[:,None,None,:]
  lum=rgb(pts).astype(np.float32).mean(-1).mean(-1)
  kerb[:,k]=np.abs(np.diff(lum,axis=1)).mean(1)*(lum.mean(1)>110)
 flags=np.zeros_like(kerb,bool)
 for k in range(2):
  v=uniform_filter1d((kerb[:,k]>9).astype(float),3,mode='wrap')>.5
  # close gaps shorter than 8 m, then drop runs shorter than 10 m
  v=uniform_filter1d(v.astype(float),5,mode='wrap')>0;v=uniform_filter1d(v.astype(float),5,mode='wrap')>.99
  runs=np.flatnonzero(np.diff(np.r_[0,v,0]));starts,ends=runs[::2],runs[1::2]
  for a,b in zip(starts,ends):
   if b-a<5:v[a:b]=False
  flags[:,k]=v
 print('zebras detectadas: direita %.0f m, esquerda %.0f m'%(flags[:,0].sum()*2,flags[:,1].sum()*2),flush=True)
 np.savez_compressed(R/'dados/eixo_refinado.npz',xy=centre,width=width,length=L,kerb_right=flags[:,0],kerb_left=flags[:,1])
 # Pit lane at 2 m, with the painted lane, the paved area and markings.
 m=np.arange(0,ps[-1],2.)
 cen_p=np.column_stack([np.interp(m,ps,pcen[:,k]) for k in range(2)])
 half_lo=np.interp(m,ps,plo-(plo+phi)/2);half_hi=np.interp(m,ps,phi-(plo+phi)/2);fast=np.interp(m,ps,fast_hi-(plo+phi)/2)
 np.savez_compressed(R/'dados/boxes_utm.npz',xy=cen_p,s=m,lane_lo=half_lo,lane_hi=half_hi,fast_hi=fast,
  entry_open=PIT_ENTRY_OPEN,wall_nose=PIT_WALL_NOSE,wall_end=PIT_WALL_END,garages=np.array(GARAGES,float))
 moved=np.linalg.norm(centre-old[np.argmin(np.linalg.norm(old[None,:,:]-centre[:,None,:],axis=2),axis=1)],axis=1)
 report={'source':'GeoSampa ORTO_RGB_2020, 0,2 m/px (WMS), EPSG:31983','previous':'eixo do mapa FIA registrado em ortofoto reduzida (~1,1 m/px)',
  'method':'linhas brancas de borda e indice de nao-asfalto em transectos a cada 0,5 m; programacao dinamica de centro e largura em duas passadas',
  'length_xy_m':float(L),'previous_length_xy_m':float(np.linalg.norm(np.roll(old,-1,0)-old,axis=1).sum()),
  'centre_shift_m':{'median':float(np.median(moved)),'p90':float(np.percentile(moved,90)),'max':float(moved.max())},
  'width_between_lines_m':{'min':float(width.min()),'median':float(np.median(width)),'max':float(width.max())},
  'pit_lane':{'control_points_utm_minus_326000_7377000':PIT_CONTROL,'length_m':float(m[-1]),'entry_open_m':PIT_ENTRY_OPEN,'wall_nose_m':PIT_WALL_NOSE,'garages_m':GARAGES,'work_lane_m':WORK_LANE,'wall_end_m':PIT_WALL_END},
  'caveat':'Registro visual automatico com revisao manual das imagens; nao e levantamento topografico.'}
 (R/'dados/registro_tracado.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
 print(json.dumps({k:report[k] for k in ['length_xy_m','previous_length_xy_m','centre_shift_m','width_between_lines_m']},indent=1),flush=True)

if __name__=='__main__':main()
