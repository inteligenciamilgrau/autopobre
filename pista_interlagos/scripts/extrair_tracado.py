"""Vector FIA 2025 + registro manual na ortofoto municipal 2020, EPSG:31983."""
import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'_deps'))
import numpy as np
import pymupdf
from scipy.interpolate import CubicSpline
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parents[1]
d=pymupdf.open(R/'fontes/fia_interlagos_mapa_2025.pdf')[1].get_drawings()
p=np.array([[(d[i]['items'][0][1].x+d[i]['items'][0][2].x)/2,(d[i]['items'][0][1].y+d[i]['items'][0][2].y)/2] for i in list(range(0,1880,2))+list(range(1881,2137,2))])
# Pontos de controle sobre o centro do asfalto; coordenadas da imagem de
# inspecao reduzida para 1466 px de largura. Nao sao pontos de levantamento GNSS.
anchors={0:[418,1000],25:[462,1164],50:[517,1199],75:[571,1157],100:[610,1171],125:[661,1186],150:[713,1180],175:[765,1146],200:[804,1078],225:[822,1017],250:[845,940],275:[864,865],300:[890,766],325:[912,685],350:[934,603],375:[941,527],400:[896,487],425:[802,477],450:[717,536],475:[651,621],500:[600,690],525:[539,784],550:[468,788],575:[405,710],600:[392,629],625:[425,601],650:[513,602],675:[507,552],700:[450,484],725:[430,413],750:[454,391],775:[513,451],800:[588,480],825:[650,455],850:[705,375],875:[745,283],900:[642,246],925:[470,284],950:[378,415],975:[357,508],1000:[345,625],1025:[356,738],1050:[388,881]}
anchors.update({855:[713,360],860:[726,340],865:[740,311],870:[746,298],875:[739,278],880:[718,268],890:[685,254],900:[642,241]})
anchors=dict(sorted(anchors.items()))
a=np.load(R/'dados/affine.npy')
q=np.column_stack([p,np.ones(len(p))])@a*1466/2400
ids=list(anchors)+[len(p)]
delta=np.array([anchors[i]-q[i] for i in anchors]);delta=np.vstack([delta,delta[0]])
q+=CubicSpline(ids,delta,bc_type='periodic')(np.arange(len(p)))
pix=q*2400/1466
xy=np.column_stack([326250+pix[:,0]*2/3,7378550-pix[:,1]*2/3])
ds=np.linalg.norm(np.roll(xy,-1,axis=0)-xy,axis=1);s=np.r_[0,np.cumsum(ds)]
cs=CubicSpline(s,np.vstack([xy,xy[0]]),bc_type='periodic')
# Reparametrizacao com espacamento ~2 m. Inicio na linha de largada, identificada
# pela ortofoto (faixa transversal no inicio dos boxes), indice FIA ~1055.
ss=np.arange(0,s[-1],2.0);path=cs(ss)
start=np.argmin(np.linalg.norm(path-xy[1055],axis=1));path=np.roll(path,-start,axis=0)
np.save(R/'dados/centro_utm.npy',path)
(R/'dados/registro_tracado.json').write_text(json.dumps({'source':'FIA mapa 2025, folha 2; GeoSampa ortofoto 2020','crs':'EPSG:31983','ortho_bbox':[326250,7376700,327850,7378550],'control_points_preview_1466px':anchors,'method':'centro da faixa vetorial FIA, deformacao suave por controles visuais na ortofoto; spline periodica, amostras de 2m','length_xy_m':float(np.linalg.norm(np.roll(path,-1,axis=0)-path,axis=1).sum()),'nominal_fia_m':4309},indent=2),encoding='utf-8')
im=Image.open(R/'fontes/ortofoto_2020.jpg');dr=ImageDraw.Draw(im)
dr.line([tuple(x) for x in pix]+[tuple(pix[0])],fill='#ff3344',width=2)
for i in anchors:
 x,y=pix[i];dr.ellipse((x-4,y-4,x+4,y+4),fill='yellow');dr.text((x+4,y),str(i),fill='yellow',stroke_width=1)
im.save(R/'renders/alinhamento_tracado.jpg',quality=94)
print('Tracado',len(path),'amostras, comprimento XY',s[-1])
