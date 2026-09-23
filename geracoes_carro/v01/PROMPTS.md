# Prompts — Opala 99, versão 01

Ferramenta: image_gen integrada. Cinco gerações e duas revisões. Fotos originais preservadas em ../../../carro. As transcrições nos prompts são leituras provisórias, não um cadastro validado de nomes.

## left

Referências (na ordem enviada):
- carro/carro_21_lateral_porta_nomes_apoiadores_porta_motorista_.jpg
- carro/carro_12_perspectiva_lateral.jpg
- carro/carro_3_lateral_da_frente_e_porta_motorista.jpg
- carro/carro_11_perspectiva_tras_piloto.jpg

```text
Use case: product-mockup. Create a faithful high-resolution photographic reconstruction of the SPECIFIC black Brazilian Chevrolet Opala two-door racing coupe number 99 shown in the reference photos, as a usable reference for future 2D and 3D modeling. Preserve exact vehicle identity, period body silhouette, proportions, narrow bright yellow shoulder stripe, black race bodywork, silver five-spoke wheels, slick tires, black mirrors, window safety nets, roll cage, fasteners and sponsor graphics. Isolate ONE complete car on a plain very light gray studio background with subtle contact shadow, neutral diffuse lighting, crisp readable decals, no motion blur, no people, no scenery, no labels or watermark, no collage. Faithful real race car, not stylized, not a modern muscle car. Orthographic projection, no perspective distortion or artistic angle. Reference photos show DIFFERENT livery stages: prioritize the high-resolution handwritten supporter door photos for the latest doors; use track photos ONLY to complete body geometry and other areas. Do NOT put big SEIVA graphics on the doors over the handwritten supporters. Never mirror text. Small undecipherable markings should retain their reference shapes instead of made-up new slogans. Output highest practical resolution, target 3840 pixels long edge.
VIEW: Exact LEFT / DRIVER SIDE elevation, nose facing LEFT, rear facing RIGHT. Camera perpendicular to door, level, both wheel centers on same horizontal line, entire car in frame with 6% margin, 3:2 landscape canvas. No front grille face or roof plane visible.
INPUT ROLES: image 1 is PRIMARY authoritative driver door lettering and window close-up. Image 2 reference for complete left silhouette and rear-quarter sponsor placement ONLY; image 3 reference front left fender sponsor shapes; image 4 reference rear quarter and roofline.
Driver door: copy the dense fine yellow HANDWRITTEN names exactly from image 1, preserving line order and small scale on black panel; large bottom handwritten "LAIS TE AMO" followed by THREE yellow hearts, and below "FÁBIO FELMANN, WILLIAM LAU". Names visible include:
"MARCELO R. BECHER, ALEXANDRE R. NEVES, MÁRIO C. CARDOSO, NICOLAS MAIA"
"HUGO M. MENDONÇA, LEONARDO ANDROCIOLLI, HUELTON NUNES, JOÃO ISAAC RESENDE"
"KAUAN CRUZ, MATHEUS PROENCIO, MARCELO ZAUPA, ANDERSON J. DA SILVA, LUCAS MOURA"
"WAGNER DA SILVA, LUIS OTÁVIO TONON, SIDNEY AMERICO, ANDERSON GONDORECK, PAULO DE SÁ"
"CÉSAR LEMOS, WILKER GUSTAVO, ARIAN ALBUQUERQUE, DAVI SCHENKEL, LUIZA EVANGELISTA"
"ANDRÉ LUIZ NUNES, LUIZ GIRONCE, JEAN MENEZES, KLEBER ELETRIC, JEFERSON PILON".
Let actual lettering in primary reference take precedence over this transcription if it differs. Match faint names along yellow stripe too.
Roof rail above side net: "EDU NEVES A+" forward, "STEVAN GAIPO O-" rearward. Front fender "MAN•PEC", small "PECOM", yellow "NIPO IMPORT", blue/white "RAMP UP", yellow "GR5". Behind door preserve RR IMPORT monogram, "invent" with red/yellow v and small "software", large white "99" on rear quarter, C-pillar "JESUS" above blue "TÁ ON". Quarter window sticker cluster faithful to refs. No replacing door with Seiva logo.
```

## right

Referências (na ordem enviada):
- carro/carro_21_lateral_porta_nomes_apoiadores_porta_passageiro_.jpg
- carro/carro_15_lateral_carona.JPG
- carro/carro_18_adesivos_lateral_traseira_foco.JPG
- carro/carro_20_lateral_porta_nomes_apoiadores.JPG
- geracoes_carro/v01/01_lateral_motorista.png

```text
Use case: product-mockup. Create a faithful high-resolution photographic reconstruction of the SPECIFIC black Brazilian Chevrolet Opala two-door racing coupe number 99 shown in the reference photos, as a usable reference for future 2D and 3D modeling. Preserve exact vehicle identity, period body silhouette, proportions, narrow bright yellow shoulder stripe, black race bodywork, silver five-spoke wheels, slick tires, black mirrors, window safety nets, roll cage, fasteners and sponsor graphics. Isolate ONE complete car on a plain very light gray studio background with subtle contact shadow, neutral diffuse lighting, crisp readable decals, no motion blur, no people, no scenery, no labels or watermark, no collage. Faithful real race car, not stylized, not a modern muscle car. Orthographic projection, no perspective distortion or artistic angle. Reference photos show DIFFERENT livery stages: prioritize the high-resolution handwritten supporter door photos for the latest doors; use track photos ONLY to complete body geometry and other areas. Do NOT put big SEIVA graphics on the doors over the handwritten supporters. Never mirror text. Small undecipherable markings should retain their reference shapes instead of made-up new slogans. Output highest practical resolution, target 3840 pixels long edge.
VIEW: Exact RIGHT / PASSENGER SIDE elevation, nose facing RIGHT, rear facing LEFT. Camera perpendicular to door, level, full car in frame with 6% margins, 3:2 landscape. Match proportions, wheels and neutral studio treatment to image 5, which is the reconstructed opposite side. This is a SEPARATELY reconstructed right side, never a mirrored left livery.
INPUT ROLES: image 1 authoritative right passenger door lettering, net, rail; image 2 actual right front fender; image 3 actual right rear quarter window details; image 4 actual right door and rear quarter context; image 5 left-side generated companion ONLY for overall geometry/lighting and silhouette.
Reproduce the dense fine yellow handwritten right-door text exactly, line order, handwritten style, avoiding paraphrase:
"LUCAS F. DA SILVA, MAURO CATTO JR., BRUNO A. SEVERO, THIAGO CMOLO,"
"MARCUS STOCK, WALLISON S. SILVA, EDUARDO F. CURTY, HIGOR TRETANDO,"
"LÉO MASCARENHAS, BRUNNO S. DA COSTA, JOHNNY O. VIEIRA, GUSTAVO COELHO,"
"VINÍCIUS DAVERSA, LUIZ CARLOS MONTEIRO, RODRIGO O. RAMIRES,"
"INÁCIO ARTUR, VINÍCIUS FIAMENGHI, TIAGO PRATA DIAS, JOSÉ SIDNEY"
"GABRIEL CAMARGOS, JOÃO PEDRO FIGUEIREDO, GLAUBER ALVES,"
"TS FERREIRA PEÇAS, GABRIEL M. RODRIGUES, FERNANDO C. LEITE,"
"MECÂNICA ROCHA".
The actual reference lettering takes precedence over transcription. No LAIS TE AMO on this side. Above net at roof rail, "STEVAN GAIPO O-" to left/rear, "EDU NEVES A+" to right/front. Front right fender has white "DINIZ PNEUS", yellow "NIPO IMPORT", small rectangular PECOM logo, "RACE MAKERS" and yellow "OMP" below, yellow "GR5" near front bumper. The right quarter window has TWO silver circular fuel filler ports side by side low in window, slanted oval air opening at rearward end, distinct stickers "OPALA RESENHA", "Opala Clássicos", heart sign "#VIDAS IMPORTAM", oval "OPALENDA74", small E and triangle signs. Preserve C-pillar "JESUS / TÁ ON" and round sticker. Rear-quarter sponsor RR IMPORT is faint in image 4; keep subtle dark ghosted treatment near back of door, retain rear-quarter invent software and 99 as inferred from consistent overall livery but do not copy left-door graphics. Plain yellow shoulder stripe with red upward safety arrow near left/rear of door. Whole car, no other vehicles.
```

## front

Referências (na ordem enviada):
- carro/carro_4_frente_longe.jpg
- carro/carro_16_frente_reflexo.JPG
- carro/carro_1_perspectiva_frente.jpg
- carro/carro_3_lateral_da_frente_e_porta_motorista.jpg
- geracoes_carro/v01/01_lateral_motorista.png

```text
Use case: product-mockup. Create a faithful high-resolution photographic reconstruction of the SPECIFIC black Brazilian Chevrolet Opala two-door racing coupe number 99 shown in the reference photos, as a usable reference for future 2D and 3D modeling. Preserve exact vehicle identity, period body silhouette, proportions, narrow bright yellow shoulder stripe, black race bodywork, silver five-spoke wheels, slick tires, black mirrors, window safety nets, roll cage, fasteners and sponsor graphics. Isolate ONE complete car on a plain very light gray studio background with subtle contact shadow, neutral diffuse lighting, crisp readable decals, no motion blur, no people, no scenery, no labels or watermark, no collage. Faithful real race car, not stylized, not a modern muscle car. Orthographic projection, no perspective distortion or artistic angle. Reference photos show DIFFERENT livery stages: prioritize the high-resolution handwritten supporter door photos for the latest doors; use track photos ONLY to complete body geometry and other areas. Do NOT put big SEIVA graphics on the doors over the handwritten supporters. Never mirror text. Small undecipherable markings should retain their reference shapes instead of made-up new slogans. Output highest practical resolution, target 3840 pixels long edge.
VIEW: Strict straight-on FRONT orthographic elevation, camera centered on car longitudinal axis, level horizon, zero yaw, no 3/4 perspective; complete vehicle including both mirrors, tires and roof, 10% margin, 3:2 landscape. Enough neutral studio light to read black grille, no headlights glare.
INPUT ROLES: image 1 the foreground #99 car is authoritative overall front, ignore background #42 car completely. Image 2 primary windshield detail; image 3 primary front fascia and hood graphic styling; image 4 left fender/hood details; image 5 companion generation for consistent geometry, materials.
Two ROUND headlights total, one at each end of wide rectangular black grille, NOT four headlights. Small stacked amber corner lamps. Black front apron, narrow black bumper, small red downward towing arrow, no number plate. Black windshield banner with "invent" (red/yellow V) and tiny "software"; on viewer LEFT windshield "EDU / STEVAN" above large white-outline "99". No driver/person in car, only race seat and roll cage. The leading vertical hood edge has the reference's large silver outlined geometric racing logo resembling "ERIC": trace its actual shape from photos, no invented embellishments. Hood upper face bears yellow "DANILO" and "VEÍCULOS" under a yellow stylized car outline, side small blue sponsor marks, metal hood pins. Do not add hood scoops, vents or extra decals. Yellow stripe appears only along the upper outer fenders, not as a broad yellow stripe across the grille. Replicate actual front body shape exactly.
```

## rear

Referências (na ordem enviada):
- carro/carro_6_traseira.jpg
- carro/carro_11_perspectiva_tras_piloto.jpg
- geracoes_carro/v01/01_lateral_motorista.png

```text
Use case: product-mockup. Create a faithful high-resolution photographic reconstruction of the SPECIFIC black Brazilian Chevrolet Opala two-door racing coupe number 99 shown in the reference photos, as a usable reference for future 2D and 3D modeling. Preserve exact vehicle identity, period body silhouette, proportions, narrow bright yellow shoulder stripe, black race bodywork, silver five-spoke wheels, slick tires, black mirrors, window safety nets, roll cage, fasteners and sponsor graphics. Isolate ONE complete car on a plain very light gray studio background with subtle contact shadow, neutral diffuse lighting, crisp readable decals, no motion blur, no people, no scenery, no labels or watermark, no collage. Faithful real race car, not stylized, not a modern muscle car. Orthographic projection, no perspective distortion or artistic angle. Reference photos show DIFFERENT livery stages: prioritize the high-resolution handwritten supporter door photos for the latest doors; use track photos ONLY to complete body geometry and other areas. Do NOT put big SEIVA graphics on the doors over the handwritten supporters. Never mirror text. Small undecipherable markings should retain their reference shapes instead of made-up new slogans. Output highest practical resolution, target 3840 pixels long edge.
VIEW: Strict straight-on REAR orthographic elevation, camera centered on longitudinal axis, zero yaw and level horizon. ONE complete vehicle rear view including mirrors and tires, 10% margins, 3:2 landscape.
INPUT ROLES: image 1 PRIMARY rear bodywork reference, use ONLY the foreground black/yellow #99 car, ignore blue car completely; image 2 elevated rear-quarter reference for trunk logo and window geometry; image 3 companion generated left-side for same dimensions and paint.
Four circular red taillights total, two at each side of the black horizontal rear panel, metallic dark/chrome circular rims. Bold italic white "99" OFFSET LEFT of center on rear panel between left pair of lights and central small round black cap. Preserve asymmetry. Under panel simple black race valance, a small red/white right-pointing tow arrow at viewer left and tow fixture, understated exposed exhaust low under body; no license plate, chrome road bumper, spoiler or diffuser. Trunk top has orange shield/lion icon and orange "RTJ", smaller orange "CORRETORA DE SEGUROS". Only show top graphics where naturally visible from straight rear, do not relocate graphics to vertical panel. Rear window dark clear polycarbonate with TWO small oval holes high, THREE horizontal oval slots along bottom and riveted edge, interior metal roll cage visible, green/white oval D sticker upper viewer-left. Narrow yellow shoulder stripe wraps to outer rear shoulders as photo, do not add yellow horizontal stripe across taillight panel. Exact classic coupe roofline, lower tire stance consistent with reference.
```

## top

Referências (na ordem enviada):
- carro/carro_11_perspectiva_tras_piloto.jpg
- carro/carro_16_frente_reflexo.JPG
- carro/carro_6_traseira.jpg
- carro/carro_4_frente_longe.jpg
- geracoes_carro/v01/01_lateral_motorista.png

```text
Use case: product-mockup. Create a faithful high-resolution photographic reconstruction of the SPECIFIC black Brazilian Chevrolet Opala two-door racing coupe number 99 shown in the reference photos, as a usable reference for future 2D and 3D modeling. Preserve exact vehicle identity, period body silhouette, proportions, narrow bright yellow shoulder stripe, black race bodywork, silver five-spoke wheels, slick tires, black mirrors, window safety nets, roll cage, fasteners and sponsor graphics. Isolate ONE complete car on a plain very light gray studio background with subtle contact shadow, neutral diffuse lighting, crisp readable decals, no motion blur, no people, no scenery, no labels or watermark, no collage. Faithful real race car, not stylized, not a modern muscle car. Orthographic projection, no perspective distortion or artistic angle. Reference photos show DIFFERENT livery stages: prioritize the high-resolution handwritten supporter door photos for the latest doors; use track photos ONLY to complete body geometry and other areas. Do NOT put big SEIVA graphics on the doors over the handwritten supporters. Never mirror text. Small undecipherable markings should retain their reference shapes instead of made-up new slogans. Output highest practical resolution, target 3840 pixels long edge.
VIEW: True 90-degree overhead TOP orthographic projection, lens directly vertically above car, no tilt, no perspective foreshortening. Long car axis VERTICAL, FRONT/Nose at TOP of canvas and REAR at BOTTOM. Portrait 2:3 composition, complete car and both mirrors with 8% margin. No front grille face, no rear taillight face, no side door faces visible. Preserve the narrow long classic coupe footprint and relative hood/roof/trunk lengths seen in reference.
INPUT ROLES: image 1 authoritative elevated original photo of #99 for roof number orientation, hood layout, trunk logo and panel proportions; image 2 original hood/windshield detail; image 3 original back window/trunk details, ignore blue car; image 4 original front/hood markings; image 5 generated companion left-side for geometry only. Original photos take priority.
Black hood is long and flat, with physical hood pins, central yellow stylized car outline above yellow "DANILO" / "VEÍCULOS", small blue brand marks flanking it as photos. Trace their actual shapes, do not invent extra brands. Front hood lip silver geometric outline logo from original. Windshield top black banner reads "invent" (red/yellow v), small "software"; passenger half has white-outline 99 and "EDU / STEVAN" (in TOP view with nose up, passenger half is viewer RIGHT). Dark windows, empty interior with cage and seat, no people. Black roof has ONLY one large WHITE 99 in correct actual orientation: read from the driver side, so with front of car at canvas TOP, the tops of both digits point toward canvas RIGHT and their baseline faces canvas LEFT, according to the elevated left-side reference. Never change number into 66. No invented roof sponsor. Rear window has the same two upper oval and three lower oblong vent openings and green/white D marking near driver side. Short black trunk carries orange shield/lion + "RTJ", smaller "CORRETORA DE SEGUROS", oriented readable from behind vehicle (bottom of canvas). Thin yellow stripes along outer left/right shoulder edges, NO central yellow racing stripes. No spoiler, no scoop, no sunroof. Areas not visible in originals reconstruct conservatively. Clean studio overhead reference, natural photographic materials.
```

## top_fix

Referências (na ordem enviada):
- geracoes_carro/v01/rascunhos/05_topo_inicial.png
- carro/carro_16_frente_reflexo.JPG
- carro/carro_11_perspectiva_tras_piloto.jpg
- carro/carro_4_frente_longe.jpg

```text
Use case: precise-object-edit. Edit image 1, the overhead studio reconstruction of black/yellow Opala #99. Image 2 is the original windshield reference. Image 3 is the original elevated car photo showing the real roof and hood; image 4 original front for hood sponsors. Preserve exact overhead composition, front pointing UP, background, car silhouette, main sideways white roof 99, rear window, trunk RTJ, colors, wheels.
CRITICAL targeted correction: the small outlined "99" and "EDU / STEVAN" currently wrongly appear on the BLACK SOLID ROOF at upper right below the windshield. REMOVE these from the roof completely. Put that SAME small outlined 99 and EDU / STEVAN INSIDE the transparent windshield glass, on its passenger half (viewer RIGHT of center), ABOVE the invent band in the current top-view image, naturally foreshortened to fit the glass. Keep invent banner within upper edge of windshield as it is. The roof must only carry ONE large sideways white 99; no other roof texts except narrow edge driver names. Keep main large roof number orientation unchanged.
SECOND precise correction: do not use repeated RAMP UP logos on the hood unless visible in source. Reproduce the two small blue hood emblems from original photos by their visual shapes; viewer-left small angular blue sports emblem, viewer-right angular blue NIPO-style emblem, as actually seen. Preserve yellow DANILO VEÍCULOS and its thin car outline. Remove the fabricated twin rows of oval vents on the HOOD near windshield; restore smooth black hood there with only genuine panel seams/fasteners. DO NOT remove the actual five ventilation holes in rear window. No other changes.
```

## front_fix

Referências (na ordem enviada):
- geracoes_carro/v01/03_frente.png
- carro/carro_8_piloto_dentro_edu_neves.jpg

```text
Use case: precise-object-edit. Image 1 is the edit target, the front studio view of the black/yellow Opala #99. Image 2 is original race-seat closeup. Make exactly one targeted correction: replace the inaccurate white "sparco" word on the visible black racing seat headrest behind the driver-side windshield (viewer RIGHT) with the exact lower-case white brand "sgarbi", preserving its size, subtle embroidered look, perspective and location. Follow the spelling visible on the actual seat in image 2. Preserve all other pixels/details as closely as possible: same entire front-view car, windshield invent, EDU / STEVAN, 99, all hood decals, headlamps, tow arrow, background, framing, colors, light. Do not add a person.
```

