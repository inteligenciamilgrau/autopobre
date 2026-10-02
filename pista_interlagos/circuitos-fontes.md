# Cascavel e ECPA Piracicaba — circuitos da Old Stock Race a partir de dados abertos

Os dois circuitos entram no seletor da abertura ao lado de Interlagos e Curvelo
(`?circuito=cascavel`, `?circuito=piracicaba`), com os mesmos Opalas, 14 adversários,
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
