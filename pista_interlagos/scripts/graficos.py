from pathlib import Path
import sys,os
R=Path(__file__).resolve().parents[1]
os.environ['MPLCONFIGDIR']=str(R/'dados/mpl_cache')
sys.path.insert(0,str(Path(__file__).parent/'_deps'))
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
A=np.load(R/'dados/pista_processada.npz')['samples']
xyz=A[:,1:4];ds=np.linalg.norm(np.roll(xyz,-1,axis=0)-xyz,axis=1);s=np.r_[0,np.cumsum(ds[:-1])]/1000
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False,'axes.labelcolor':'#46544e','text.color':'#172b25','xtick.color':'#46544e','ytick.color':'#46544e'})
fig=plt.figure(figsize=(15,9),facecolor='#f8faf7');gs=fig.add_gridspec(3,2,width_ratios=[.9,1.55],hspace=.40,wspace=.3,left=.05,right=.96,bottom=.12,top=.82)
ax=fig.add_subplot(gs[:,0]);points=A[:,1:3];seg=np.stack([points,np.roll(points,-1,axis=0)],axis=1)
lc=LineCollection(seg,cmap='viridis',linewidth=4);lc.set_array(A[:,3]+720);ax.add_collection(lc);ax.autoscale();ax.set_aspect('equal');ax.set_axis_off();ax.plot(*points[0],'o',color='#e87035',ms=8);ax.annotate('Largada',points[0],xytext=(-60,0),textcoords='offset points',fontsize=10,ha='right')
cb=fig.colorbar(lc,ax=ax,orientation='horizontal',fraction=.05,pad=.03);cb.set_label('Cota na base LiDAR (m)')
for i,(v,label,color) in enumerate([(A[:,3]+720,'Cota (m)','#25816b'),(A[:,6]*100,'Rampa longitudinal (%)','#b9782d'),(A[:,5]*100,'Caimento transversal (%)','#586fba')]):
 ax=fig.add_subplot(gs[i,1]);ax.set_facecolor('#f8faf7');ax.plot(s,v,lw=1.8,color=color);ax.set_xlim(0,4.309);ax.set_ylabel(label);ax.grid(alpha=.15);ax.set_axisbelow(True)
 if i==0:
  ax.fill_between(s,v,v.min()-2,alpha=.10,color=color);ax.set_ylim(v.min()-2,v.max()+4)
  for j,text in [(v.argmax(),'máx. 783,18 m'),(v.argmin(),'mín. 739,58 m')]:ax.annotate(text,(s[j],v[j]),xytext=(8,7),textcoords='offset points',fontsize=9)
 else:ax.axhline(0,lw=.7,color='#718079',alpha=.5)
 if i==2:ax.set_xlabel('Distância percorrida no eixo 3D (km)')
fig.text(.05,.94,'INTERLAGOS  /  RELEVO RECONSTRUÍDO',fontsize=23,fontweight='bold')
fig.text(.05,.898,'4.309 m calibrados   ·   43,60 m de desnível   ·   2.144 seções   ·   alturas sem exagero vertical',fontsize=12,color='#496257')
fig.text(.05,.053,'Fontes: FIA 2025 · GeoSampa LiDAR 2017 / ortofoto 2020. Extração e suavização locais; escala XY × 1,004116838.',fontsize=9,color='#607068')
fig.text(.05,.029,'Reconstrução para jogo. O caimento positivo indica o lado esquerdo mais alto no sentido de corrida. Não é um levantamento homologado atual.',fontsize=9,color='#607068')
fig.savefig(R/'renders/perfil_topografico.png',dpi=160);fig.savefig(R/'renders/perfil_topografico.svg');plt.close(fig)
print('GRAFICOS_COMPLETE')
