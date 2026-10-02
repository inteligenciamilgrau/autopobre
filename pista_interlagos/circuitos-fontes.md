# Cascavel, ECPA Piracicaba e Chapecó — circuitos da Old Stock Race a partir de dados abertos

Os três circuitos entram no seletor da abertura ao lado de Interlagos e Curvelo
(`?circuito=cascavel`, `?circuito=piracicaba`, `?circuito=chapeco`), com os mesmos Opalas, 14 adversários,
Modo Corrida, Modo História, pit stop no Box 99 e recordes separados por circuito.
A Old Stock Race correu em Cascavel na 4ª e na 7ª etapas de 2025. Em 21 e 22/03/2026
abriu a temporada em Brasília, no Autódromo Internacional Nelson Piquet, que ainda
não está no jogo.

## Fontes (baixadas em 27/09/2026)

| Dado | Fonte | Uso | Licença |
|---|---|---|---|
| Traçado, pit lane de Cascavel, vias, matas, edificações | OpenStreetMap via Overpass | eixo inicial, cobertura e prédios | ODbL (© colaboradores do OSM) |
| Imagem aérea (Cascavel 17/08/2025, Piracicaba 01/05/2025, Vantor/Vivid 0,34 m) | Esri World Imagery | medir eixo, larguras, prédio dos boxes; **não é distribuída** | referência visual |
| Relevo de terreno 30 m | ANADEM v1 (ANA/UFRGS), tiles 22J e 23K | perfil da pista e terreno | dado aberto |
| Relevo de superfície 30 m | Copernicus GLO-30 | só para validar o ANADEM | Copernicus |
| Cobertura do solo 10 m | ESA WorldCover 2021 v200 | matas, campo, lavoura, solo exposto | CC BY 4.0 |
| Cor real 10 m | Sentinel-2 L2A (Earth Search/AWS): S2B_22JBT_20260926, S2C_22KHV_20260925, sem nuvem sobre a pista | cor do chão ao longe (`teste/assets/circuitos/*_solo.jpg`) | Copernicus Sentinel |
| Pegadas de edificações | Microsoft Global ML Building Footprints (2026-02-03) | casas e galpões onde o OSM não mapeou | ODbL |

Textos publicados: Wikipédia (Cascavel: 3.058 m, 12 m de largura, anti-horário,
7 curvas, Bacião como curva 1 depois de reta em descida, concreto na reta de chegada,
asfalto refeito em 2022) e ECPA (2.100 m, 9 curvas, horário, anel externo de 1 km,
arquibancada na reta, "subidas e descidas"). As "100 Milhas Piracicaba" em 78 voltas
dão cerca de 2.063 m por volta.

## Como reconstruir

Um venv com `numpy scipy pillow requests pyproj rasterio shapely` (há um em
`Projetos_iA/apps/geo-venv`). Na pasta `scripts/circuitos/`:

```
python baixar_fontes.py cascavel --referencia   # fontes/cascavel/ (gitignored)
python refinar_eixo.py cascavel                 # fontes/cascavel/eixo_refinado.json + .jpg
python gerar_pista.py cascavel                  # dados/pista_cascavel.json, teste/assets/circuitos/cascavel_solo.jpg
python desenhar_planta.py cascavel              # planta de conferência sobre a imagem
```

Depois: `node scripts/testar_circuitos_abertos.mjs`, `node scripts/gerar_referencias_ia.mjs`
e, no navegador, `scripts/verificar_circuitos_abertos.py [porta]`.

## Método

- **Eixo e larguras** (`refinar_eixo.py`): o traçado OSM, ordenado no sentido da corrida,
  vira spline; em transectos a cada 2 m uma programação dinâmica escolhe deslocamento e
  largura da faixa asfaltada, com o limiar de "asfalto" calibrado em cada circuito. Trechos
  distantes na volta que correm lado a lado não podem se fundir. Em Cascavel o pit lane é
  refinado primeiro e fica sempre do lado de dentro; ao lado do prédio ele está sob a
  cobertura e é posicionado pela borda do telhado medida na imagem (faixa de 9 m).
- **Muro dos boxes e a banca do Box 99** (`gerar_pista.py`, `muro_barraca.py`): o muro fica
  entre a pista de boxes e a pista e afina até 0,6 m onde a folga entre elas passa de 6 m
  (Cascavel: ~11 m). A banca da equipe, onde se faz a inscrição no Modo História, é montada
  sobre o muro e precisa de 3,4 m: em volta do Box 99 o muro alarga para o lado da pista
  principal, com a face da pista de boxes intacta, e o alambrado acompanha. Sem isso a banca
  ficava do outro lado do alambrado. `ajustar_muro_barraca.py <id>` aplica a mesma regra a um
  JSON já gerado (idempotente), para quando as fontes não podem ser reprocessadas.
- **Suavização** (`gerar_pista.py`): o rumo do eixo é suavizado de 40 m nas retas a 5 m nas
  curvas e reintegrado, com a deriva devolvida em baixa frequência (desvio médio de 0,8 m do
  eixo medido); estações reamostradas a cada 2 m.
- **Relevo**: o perfil lê o ANADEM suavizado em 2D (~18 m) mais 12 m ao longo da volta. ANADEM
  e Copernicus concordam ao longo da pista (mediana 0,27 m em Cascavel, 0,05 m no ECPA).
  Onde dois trechos correm lado a lado a diferença de altura fica limitada a um talude de 25%.
  O terreno é o ANADEM numa grade de 4 m, colado ao plano da pista perto das vias.
- **Extensão**: Cascavel mede 3.041 m no eixo e foi escalado 0,55% para os 3.058 m oficiais
  (como Interlagos com a FIA). O ECPA mede 1.930 m e ficou assim: esticar 8% deslocaria a
  pista do relevo e dos prédios reais.
- **Nomes dos trechos**: só o Bacião tem nome publicado; os demais descrevem o lugar.

## Aproximações declaradas

Caimento transversal (1% nas retas, até 2,5% nas curvas, 4,5% no Bacião), zebras (pela
geometria das curvas; nessa resolução a imagem não as separa da terra vermelha), muros e
guard-rails, arquibancadas (Cascavel: 7 blocos do lado de fora da reta; ECPA: 3 blocos antes
da chegada), número e largura das garagens, posição do Box 99 e da lanchonete e alturas das
edificações (estimadas pela área) são escolhas de modelagem. No ECPA a faixa dos boxes diante
do paddock é fictícia: o autódromo não tem pit lane mapeado. Lagos pequenos não foram
modelados. A zona de concreto de Cascavel cobre a reta de chegada até 100 m antes do Bacião.

## Chapecó (Autódromo Internacional Márcio Vaccaro) — fontes baixadas em 02/10/2026

Inaugurado em 25/08/2026 na Linha Cachoeira, distrito de Marechal Bormann, a 20 km do centro.
A Old Stock Race está no calendário de lá de 30/10 a 01/11/2026. Projeto de Heinz Jakob Scheuren.

**O que foi publicado** (Prefeitura de Chapecó, NSC, ND Mais, 2025–2026): 4.004 m no sentido
horário, 12 a 15 m de largura, 12 curvas (7 à direita, 5 à esquerda), retas de 837, 634 e 422 m,
a curva 7 "de alta velocidade, com 517 metros e raio aberto constante", desnível máximo de
18,5 m, 32–35 boxes num pit building "fora da área do traçado", torre, 30 mil lugares e três
traçados alternativos (2.520, 1.452 e 2.829 m). O projeto de 2023 falava em 4.057 m, 13 curvas
(8 à direita), retas de 871, 551 e 424 m, curva 8 de 517 m e 23 m de desnível.

**Fontes:** o OSM tem só o contorno da pista (way 1523801531, `leisure=track`, mapeado em
27/05/2026, 66 nós), sem pit lane, prédios nem atalhos. A imagem aérea Esri é de 01/08/2024 e
mostra a terraplanagem (o leito da pista em terra vermelha, que confere com o contorno OSM):
serve só para a planta de conferência. A pista pronta aparece na cena Sentinel-2
S2B_22JCQ_20260923 (10 m, sem nuvem). ANADEM 22J, Copernicus S28W053, WorldCover S30W054 e as
pegadas da Microsoft como nos outros. O Overpass não respondeu: `osm.json` veio da API 0.6 do
OSM (`/map`), que `baixar_fontes.py` agora usa quando nenhum Overpass responde.

**Método, no que difere dos outros dois:**

- **Eixo** (`refinar_eixo.py`, `referencia: 'sentinel2'`): a mesma programação dinâmica, sobre
  o Sentinel-2 reamostrado a 2 m e com os limiares recalibrados, procurando larguras de 12 a
  15 m. Deslocamento médio de 1,8 m em relação ao OSM. A largura medida a 10 m de pixel tende
  ao alto da faixa (média 14,6 m antes da escala).
- **Extensão**: o eixo mede 4.054 m — os 4.057 m do projeto de 2023 — e foi escalado 0,8% para
  os 4.004 m divulgados, como Cascavel.
- **Curvas**: a detecção acha 14 trechos; casados com a numeração oficial, a dobra de 26° no
  meio da reta 2 não conta (assim a reta 2 tem os 634 m até a curva 2) e a de 22° antes da reta
  3 é a curva 4. A varrida longa à esquerda do lado do mato, achada em dois pedaços, é a curva
  7. Fecha 12 curvas, 7 à direita e 5 à esquerda. No projeto de 2023 a dobra da reta 2 contava
  e a varrida era a curva 8, como publicado na época.
- **Relevo** (`desnivel_m`): ANADEM e Copernicus são anteriores à obra. O terreno natural varia
  23,1 m ao longo da pista (os 23 m do projeto de 2023); a terraplanagem baixou os altos e
  aterrou os baixos, e o perfil é comprimido em torno da média até os 18,5 m publicados. Rampas
  de -9,4% a +6,7%. A base de altitude sai só da grade do terreno do jogo (`base_na_grade`):
  o vale do rio a 264 m, 1,5 km ao sul, deixaria a pista a 330 m de altura local.
- **Boxes** (`linha_chegada: 'predio_sentinel2'`): no Sentinel-2 o telhado e o concreto novo
  saturam numa faixa de 340 m do lado de fora da reta principal, começando ~15 m do eixo. A
  linha de chegada fica diante do meio dela e as garagens ocupam essa extensão. O pit lane
  (589 m) é o sintético do ECPA, com entrada logo depois da curva 12 e saída 130 m antes da
  frenagem da curva 1. A plataforma de 4,6 m entre a pista e a faixa leva o muro de 3,4 m sob
  a banca da Equipe 99 (inscrição do Modo História) a 0,6 m do asfalto.
- **Pórtico**: com a linha diante das garagens não há chão livre do lado dos boxes, então o
  poste desse lado fica sobre o muro dos boxes (`gantryPosts`, track-clearance.js).
- **Horizonte** (`horizonte: 'rural'`): lavouras e sítios esparsos, sem o anel de bairros nem
  os prédios da cidade, que fica a 20 km.

**Aproximações declaradas:** pit lane e posição dos boxes dentro do prédio, arquibancadas (8
blocos do lado de dentro da reta principal, de frente para os boxes: não há planta publicada),
caimentos, zebras, muros, largura exata e a distribuição do desnível ao longo da volta. Os
atalhos dos traçados alternativos (visíveis no Sentinel-2) não foram desenhados.

**Nesta máquina:** o controle de aplicativos do Windows bloqueia DLLs do pyproj e de partes do
scipy no `geo-venv`. `projecao.py` faz as projeções pelo GDAL do rasterio e `compat_scipy.py`
traz CubicSpline, cKDTree, brentq e savgol_filter em numpy, usados só quando o import falha; o
ECPA regenerado assim sai idêntico ao JSON publicado.
