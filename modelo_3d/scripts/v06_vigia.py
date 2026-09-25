"""V06 stickers of the quarter glasses (carro_18, carro_44 passenger side, carro_45 driver side).

V05 carried one small photo crop per glass (240 x 122 and 102 x 124 texels, the dark glass round the stickers
included) over its front half. Each sticker is drawn here as flat shapes and lettering, at the size and place the
photos give (measured against the post, the belt and the two fuel fillers), and laid on one transparent sheet over
the whole glass. The fillers sit where carro_44 and carro_18 have them: 0.12 m apart, the front one 0.10 m behind
the glass's front edge (V05's were 0.18 apart and 0.07 further back)."""
import bpy,math
import numpy as np
from mathutils import Vector
from v06_comum import *
from v06_lateral import masks,refit_decal,xf,zb,zt

PX=2500                                   # texels per metre (a 0.1 m sticker gets 250)
BOX=(-.262,-.836,.905,1.216)              # x front, x rear, z bottom, z top: the quarter glass behind its post
                                          # (further forward the sheet would reach the door's rear seam)
FILLERS=((-.36,('Bocal_combustivel','Tampa_bocal')),(-.47,('Bocal_combustivel.001','Tampa_bocal.001')))
WHITE,BLACK,RED=(246,246,244),(22,22,24),(206,36,40)

def heart(cx,cy,w,n=48):
 k=w/32;return [(cx+k*16*math.sin(t)**3,cy+k*(13*math.cos(t)-5*math.cos(2*t)-2*math.cos(3*t)-math.cos(4*t))) for t in np.linspace(0,2*math.pi,n,endpoint=False)]
def car(cx,cy,L,shrink=1.):
 """Opala coupe seen from the side, nose to the right: long hood, fastback roof, L long."""
 P=[(-.50,.07),(-.48,.14),(-.28,.16),(-.12,.27),(.12,.27),(.26,.17),(.47,.15),(.50,.09),(.49,.06)]
 return [(cx+L*x*shrink,cy+L*(y-.15)*shrink+L*.015*(1-shrink)) for x,y in P]
def arc(cx,cy,r0,r1,a0,a1,n=24):
 a=np.radians(np.linspace(a0,a1,n));return [(cx+r1*math.cos(t),cy+r1*math.sin(t)) for t in a]+[(cx+r0*math.cos(t),cy+r0*math.sin(t)) for t in a[::-1]]
def segment(cx,cy,r,y0,n=32):
 """Part of the disc (cx,cy,r) below the line y=y0."""
 h=max(-r,min(r,y0-cy));t=math.acos(h/r);a=np.linspace(-math.pi/2-(math.pi-t),-math.pi/2+(math.pi-t),n)
 return [(cx+r*math.cos(v),cy+r*math.sin(v)) for v in a]

class Sheet:
 """RGBA texels (sRGB, straight alpha) over w x h metres, origin at the centre, y up; row 0 is the top."""
 def __init__(self,w,h):self.w,self.h=w,h;self.a=np.zeros((int(h*PX),int(w*PX),4),np.float32)   # as masks() sizes its renders
 def paint(self,items):
  """items: (shape or [shapes], sRGB colour) painted in order; shapes as masks() takes them."""
  for m,(_,c) in zip(masks([i if isinstance(i,list) else [i] for i,_ in items],self.w,self.h,PX),items):over(self.a,np.clip(m,0,1),np.array(c,np.float32)/255)
  return self
 def paste(self,other,cx,cy,deg=0.):
  """other's texels centred at (cx,cy), turned deg counter-clockwise (bilinear)."""
  H,W=self.a.shape[:2];h,w=other.a.shape[:2];c,s=math.cos(math.radians(deg)),math.sin(math.radians(deg))
  px,py=W/2+cx*PX,H/2-cy*PX;R=math.hypot(w,h)/2+2
  x0,x1=max(0,int(px-R)),min(W,int(px+R)+1);y0,y1=max(0,int(py-R)),min(H,int(py+R)+1)
  X,Y=np.meshgrid(np.arange(x0,x1)+.5-px,np.arange(y0,y1)+.5-py)
  u=c*X-s*Y+w/2-.5;v=s*X+c*Y+h/2-.5            # image rows grow downwards: turning counter-clockwise on the car
  i0,j0=np.floor(u).astype(int),np.floor(v).astype(int);fu,fv=(u-i0)[...,None],(v-j0)[...,None]
  pad=np.zeros((h+2,w+2,4),np.float32);pad[1:-1,1:-1]=other.a
  g=lambda j,i:pad[np.clip(j+1,0,h+1),np.clip(i+1,0,w+1)]
  src=(g(j0,i0)*(1-fu)+g(j0,i0+1)*fu)*(1-fv)+(g(j0+1,i0)*(1-fu)+g(j0+1,i0+1)*fu)*fv
  inside=((u>-1)&(u<w)&(v>-1)&(v<h))[...,None];src=src*inside
  a=src[...,3:];dst=self.a[y0:y1,x0:x1]
  pre=src[...,:3]*a+dst[...,:3]*dst[...,3:]*(1-a);alpha=a+dst[...,3:]*(1-a)
  dst[...,:3]=np.where(alpha>1e-4,pre/np.maximum(alpha,1e-4),dst[...,:3]);dst[...,3:]=alpha
  return self

def over(dst,m,col):
 a=m[...,None];out=a+dst[...,3:]*(1-a)
 dst[...,:3]=np.where(out>1e-4,(col*a+dst[...,:3]*dst[...,3:]*(1-a))/np.maximum(out,1e-4),dst[...,:3]);dst[...,3:]=out

# ---------------------------------------------------------------- the stickers
def vidas():
 """#VIDAS IMPORTAM (carro_44, 45): white rounded square with a thin black border, a black heart, #VIDAS up the left
 edge and IMPORTAM along the bottom; 0.125 m."""
 S=Sheet(.125,.125).paint([(('poly',rounded_rect(0,0,.125,.125,.016,6)),WHITE),(('poly',rounded_rect(0,0,.115,.115,.011,6)),BLACK),
  (('poly',rounded_rect(0,0,.109,.109,.008,6)),WHITE),(('poly',heart(.010,.014,.066)),BLACK),
  (('text','IMPORTAM','bahnschrift.ttf',(.080,.0145),(.012,-.041),0),BLACK)])
 return S.paste(Sheet(.062,.0145).paint([(('text','#VIDAS','bahnschrift.ttf',(.062,.0145),(0,0),0),BLACK)]),-.041,.012,90)
def classicos():
 """Opala Classicos (carro_44, 45): black badge with a white rim, the grey monkey in sunglasses over a red band, the
 name in white on black and a small red car under it; 0.095 x 0.10 m."""
 g=(74,74,78);skin=(226,198,166)
 return Sheet(.095,.10).paint([(('poly',ellipse(0,0,.0475,.05,64)),WHITE),(('poly',ellipse(0,0,.0440,.0465,64)),BLACK),
  (('poly',segment(0,0,.0405,-.004)),RED),([('poly',ellipse(-.029,.013,.009,.010,24)),('poly',ellipse(.029,.013,.009,.010,24)),('poly',ellipse(0,.012,.029,.031,48))],g),
  ([('poly',ellipse(0,-.004,.019,.014,36)),('poly',ellipse(0,.017,.021,.012,36))],skin),
  ([('poly',rounded_rect(-.0115,.014,.020,.012,.004)),('poly',rounded_rect(.0115,.014,.020,.012,.004)),('poly',rounded_rect(0,.017,.012,.003,.001))],BLACK),
  (('poly',rounded_rect(0,-.009,.012,.0025,.001)),(90,50,40)),
  (('poly',rounded_rect(0,-.030,.078,.018,.006)),BLACK),(('text','Opala Clássicos','segoeuib.ttf',(.066,.0095),(0,-.030),0),WHITE),
  (('poly',car(0,-.043,.022)),RED)])
def resenha():
 """Opala e Resenha (carro_44, 45): cream disc in a dark ring, a black Opala over OPALA, e RESENHA, and a red band
 at the bottom; 0.083 m."""
 cream=(238,229,200);dark=(44,30,26)
 return Sheet(.083,.083).paint([(('poly',ellipse(0,0,.0415,.0415,72)),dark),(('poly',ellipse(0,0,.0385,.0385,72)),cream),
  (('poly',segment(0,0,.0385,-.024)),RED),([('poly',car(0,.021,.046)),('poly',ellipse(-.013,.0145,.0048,.0048,16)),('poly',ellipse(.013,.0145,.0048,.0048,16))],BLACK),
  (('text','OPALA','georgiab.ttf',(.058,.0165),(0,.0005),0),dark),(('text','e RESENHA','georgiab.ttf',(.046,.0085),(0,-.0145),0),(150,30,30)),
  (('text','DESDE 2020','arialbd.ttf',(.024,.004),(0,-.030),0),cream)])
def encontro():
 """VIII ENCONTRO poster (carro_18, 44), mostly under #VIDAS and the monkey: blue card with green and yellow bands;
 0.06 x 0.085 m."""
 return Sheet(.06,.085).paint([(('poly',rounded_rect(0,0,.06,.085,.003)),(120,196,214)),(('poly',rounded_rect(0,.030,.056,.018,.002)),(46,140,92)),
  (('text','VIII ENCONTRO','arialbd.ttf',(.048,.006),(0,.030),0),WHITE),(('text','OPALA','impact.ttf',(.040,.016),(0,.004),0),(246,206,40)),
  (('poly',rounded_rect(0,-.030,.052,.012,.002)),(236,196,40))])
def figura():
 """Small cut-out figure of a man in black (carro_44): white border; 0.022 x 0.04 m."""
 body=[(-.0065,.0065),(.0065,.0065),(.0055,-.008),(.0035,-.017),(.0005,-.017),(0,-.009),(-.0005,-.017),(-.0035,-.017),(-.0055,-.008)]
 return Sheet(.022,.04).paint([(('poly',rounded_rect(0,0,.022,.04,.005)),WHITE),([('poly',ellipse(0,.0125,.0045,.0052,20)),('poly',body)],BLACK),
  (('poly',rounded_rect(0,-.0185,.014,.002,.001)),(140,140,140))])
def disco_e():
 """E on a white disc with a red rim (carro_44): 0.038 m."""
 return Sheet(.038,.038).paint([(('poly',ellipse(0,0,.019,.019,48)),RED),(('poly',ellipse(0,0,.0165,.0165,48)),WHITE),
  (('text','E','arialbd.ttf',(.0125,.0165),(0,0),0),RED)])
def triangulo():
 """Blue triangle with a white edge and a red flash (carro_44): 0.035 x 0.03 m."""
 T=lambda k:[(0,.015*k),(.0175*k,-.015*k),(-.0175*k,-.015*k)]
 bolt=[(.002,.009),(-.004,-.002),(0,-.002),(-.003,-.012),(.005,.001),(.001,.001)]
 return Sheet(.036,.032).paint([(('poly',T(1)),WHITE),(('poly',[(x,y-.0012) for x,y in T(.84)]),(36,64,168)),(('poly',[(x,y-.002) for x,y in bolt]),(226,50,80))])
def opalenda():
 """#OPALENDA.74 (carro_18, 44): white oval with a thin black line, an Opala drawn in outline, the tag in red;
 0.115 x 0.038 m."""
 return Sheet(.115,.038).paint([(('poly',rounded_rect(0,0,.115,.038,.019,10)),WHITE),(('poly',rounded_rect(0,0,.111,.034,.017,10)),BLACK),
  (('poly',rounded_rect(0,0,.107,.030,.015,10)),WHITE),([('poly',car(0,.006,.064)),('poly',ellipse(-.019,-.0006,.005,.005,16)),('poly',ellipse(.019,-.0006,.005,.005,16))],BLACK),
  (('poly',car(0,.006,.064,.9)),WHITE),(('text','#OPALENDA.74','arialbd.ttf',(.070,.0075),(0,-.0085),0),RED)])
def senhora():
 """Nossa Senhora Aparecida (carro_45): the dark mantle widening down to a round hem, gold trim, crown and face,
 on a white border; 0.067 x 0.123 m."""
 def mantle(k):return [(0,.050*k),(.010*k,.045*k),(.014*k,.030*k),(.022*k,.0*k),(.030*k,-.040*k),(.031*k,-.050*k),(.026*k,-.057*k),(.0,-.060*k),
  (-.026*k,-.057*k),(-.031*k,-.050*k),(-.030*k,-.040*k),(-.022*k,.0*k),(-.014*k,.030*k),(-.010*k,.045*k)]
 gold=(232,190,56)
 return Sheet(.067,.123).paint([(('poly',[(x*1.05,y*1.0+.0) for x,y in mantle(1.02)]),WHITE),(('poly',mantle(.96)),gold),(('poly',mantle(.90)),(30,30,44)),
  (('poly',[(-.0025,.030),(.0025,.030),(.004,-.050),(-.004,-.050)]),gold),(('poly',ellipse(0,.034,.0045,.0055,20)),(96,62,44)),
  (('poly',[(-.007,.047),(-.005,.056),(-.0025,.051),(0,.058),(.0025,.051),(.005,.056),(.007,.047)]),gold)])
def carro_redondo():
 """Round club sticker (carro_45): white disc in a red ring, a black Opala and a red band; 0.073 m."""
 return Sheet(.073,.073).paint([(('poly',ellipse(0,0,.0365,.0365,64)),RED),(('poly',ellipse(0,0,.031,.031,64)),WHITE),
  ([('poly',car(0,.006,.050)),('poly',ellipse(-.014,-.0005,.0052,.0052,16)),('poly',ellipse(.014,-.0005,.0052,.0052,16))],BLACK),
  (('poly',rounded_rect(0,-.017,.036,.008,.002)),RED)])
def xadrez():
 """Two crossed chequered flags round a white disc with a gear knob (carro_45): 0.069 x 0.048 m."""
 S=Sheet(.069,.048)
 for side in (-1,1):
  F=Sheet(.028,.022).paint([(('poly',rounded_rect(0,0,.028,.022,.001)),WHITE),([('poly',rounded_rect(-.0105+i*.007,.0075-j*.0075,.007,.0075,.0002)) for i in range(4) for j in range(3) if (i+j)%2==0],BLACK)])
  S.paste(F,side*.019,.006,side*-18)
 return S.paint([(('poly',ellipse(0,-.004,.0135,.0135,40)),WHITE),(('poly',ellipse(0,-.004,.0120,.0120,40)),BLACK),(('poly',ellipse(0,-.004,.0105,.0105,40)),WHITE),
  ([('poly',ellipse(0,.0005,.0042,.0042,20)),('poly',[(-.0012,.001),(.0012,.001),(.0012,-.012),(-.0012,-.012)])],BLACK)])
def arco_iris():
 """Round badge with a rainbow arc (carro_45): 0.059 x 0.072 m."""
 cols=[(214,48,44),(244,164,36),(80,170,70),(44,110,200)]
 items=[(('poly',rounded_rect(0,0,.059,.072,.018,8)),WHITE)]+[(('poly',arc(0,.004,.020-.0035*k,.0235-.0035*k,0,180)),c) for k,c in enumerate(cols)]
 return Sheet(.059,.072).paint(items+[(('poly',ellipse(0,-.004,.010,.012,32)),(170,172,176)),(('poly',rounded_rect(0,-.026,.040,.007,.002)),(40,120,200))])

# Each glass as seen from outside (for the driver side the car's nose is to the left), stickers listed bottom first:
# (sticker, x, z, degrees counter-clockwise), x and z on the car.
LAYOUT={'Passageiro':[(encontro,-.405,1.145,0),(classicos,-.466,1.125,0),(vidas,-.347,1.11,33),(resenha,-.558,1.088,0),
  (figura,-.512,1.034,0),(disco_e,-.46,1.03,0),(triangulo,-.352,1.025,0),(opalenda,-.582,.951,0)],
 'Motorista':[(senhora,-.3025,1.038,0),(carro_redondo,-.365,1.107,0),(classicos,-.465,1.14,0),(resenha,-.44,1.053,0),
  (xadrez,-.298,.945,0),(arco_iris,-.364,.952,0),(vidas,-.488,.985,-8)]}

def move_fillers():
 """The two fillers (and their caps) of the passenger glass to where carro_44 and carro_18 have them, along the glass."""
 O=bpy.data.objects;T=bvh(O['Vigia_lateral_Passageiro'])
 for x_new,names in FILLERS:
  W=world_verts(O[names[0]]);c=(W.min(0)+W.max(0))/2;dx=x_new-c[0]
  y0,y1=(T.ray_cast(Vector((x,-1.5,c[2])),Vector((0,1,0)))[0].y for x in (c[0],x_new))
  for n in names:
   W=world_verts(O[n]);W[:,0]+=dx;W[:,1]+=y1-y0;set_world_verts(O[n],W)

def build():
 O=bpy.data.objects;move_fillers();cache={}
 for side,s in (('Motorista',1),('Passageiro',-1)):
  low=side.lower();sheet=Sheet(BOX[0]-BOX[1],BOX[3]-BOX[2]);mid=((BOX[0]+BOX[1])/2,(BOX[2]+BOX[3])/2)
  for fn,x,z,deg in LAYOUT[side]:
   st=cache.get(fn) or cache.setdefault(fn,fn())
   # on the passenger side the nose is on the right of the sheet, on the driver side on its left
   sheet.paste(st,(x-mid[0])*-s,z-mid[1],deg)
  rgba=sheet.a.copy();cov=rgba[...,3]>.01
  if cov.any():rgba[~cov,:3]=rgba[cov,:3].mean(0)   # colour under the clear texels, so filtering never darkens edges
  img=image_from_array(f'vidro_{low}_v06.png',rgba)
  o=refit_decal(O['Adesivos_vigia_'+low],BOX,side,s,img,off=.002,surfaces=[O['Vigia_lateral_'+side]])
  # The glass is one plane (v06_lateral.flat_mesh): the whole sheet lies 2 mm out from it, also where its edges pass
  # beyond the glass outline (there refit_decal's rays miss and would leave the sheet standing out).
  G=world_verts(O['Vigia_lateral_'+side]);k=np.linalg.lstsq(np.c_[np.ones(len(G)),G[:,2],G[:,0]],G[:,1],rcond=None)[0]
  W=world_verts(o);W[:,1]=k[0]+k[1]*W[:,2]+k[2]*W[:,0]+s*.002;set_world_verts(o,W)
  m=o.data.materials[0];nt=m.node_tree;tex=next(n for n in nt.nodes if n.type=='TEX_IMAGE');p=next((n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'),None)
  if p is not None and not p.inputs['Alpha'].is_linked:nt.links.new(tex.outputs['Alpha'],p.inputs['Alpha'])
  print(f'V06 quarter glass stickers {side}: {len(LAYOUT[side])} stickers, {img.size[0]}x{img.size[1]} texels',flush=True)
