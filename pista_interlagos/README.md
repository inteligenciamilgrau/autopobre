# Interlagos — pista de testes do Opala 99

Versão 1 · 13/09/2026. Pista 3D editável, com o Opala 99, e teste dirigível local no navegador.

**Modo opcional: [Auto-Pobre Racing com Stevan Gaipo](VERSAO_IMERSIVA.md).** Marque “Versão Imersiva opcional” no menu para jogar a vaquinha com piadas, uma corrida contra 14 adversários, combustível e avarias, resgate com controle do freio, vistoria e o pódio eterno em sexto. Os prêmios ajudam a tirar a Blazer da oficina. A sessão livre continua disponível com a opção desmarcada.

O carro foi atualizado para a [V4 com assoalho e fechamentos corrigidos](../modelo_3d/v04_fechamentos/README.md), nas duas pinturas. O assoalho contínuo, suas uniões com as soleiras e os anteparos fecham os vãos que deixavam a pista aparecer por dentro do carro. As chapas receberam espessura; a estrutura permanece visível também na câmera interna. A lateral refinada da V3 foi mantida.

O teste no navegador agora usa asfalto texturizado, com granulação em escala métrica, rugosidade, variações de desgaste, juntas discretas e borracha nas frenagens. Os detalhes fixos no chão ajudam a perceber o deslocamento e a velocidade. A [textura e seu registro de geração](teste/assets/texturas/README.md) estão incluídos localmente.

A câmera **Interna** tem um cockpit 3D baseado na foto [carro_14_interna.JPG](../carro/carro_14_interna.JPG), complementada pela [foto do piloto no interior](../carro/carro_8_piloto_dentro_edu_neves.jpg). Inclui painel escuro, conta-giros e instrumentos auxiliares, volante de três raios com faixa amarela, suporte inferior, visor vermelho, câmbio em H com coifa e padrão de marchas na manopla, freio de mão hidráulico, pedais suspensos com apoio para o pé esquerdo, gaiola, redes laterais, interruptores superiores e retrovisor panorâmico. O enquadramento aproxima a posição da câmera embarcada da referência, ligeiramente à direita do piloto.

Os materiais do interior usam texturas fotoescaneadas CC0 em escala real: painel moldado em couro granulado, suporte dos instrumentos em fibra de carbono envernizada, forros de porta em alumínio escovado com rebites, piso em chapa xadrez com tapete de borracha na pedaleira, túnel emborrachado, teto e anteparos em tinta preta acetinada e gaiola pintada com espumas de proteção perto do capacete. O banco concha tem casco de fibra, centros em camurça, reforços laterais em couro, suportes de alumínio e bordado "AUTO-POBRE 99"; o volante também é de camurça, com cubo de engate rápido. Os mostradores têm fundo preto com escala, faixa vermelha, aro cromado e vidro com reflexo; o velocímetro é um LCD de sete segmentos com os segmentos apagados visíveis. Há etiquetas nos interruptores (com capa na ignição e botão de partida), corta-corrente com o adesivo de vistoria e extintor com rótulo, manômetro e cintas. Metais, vidros e cromados refletem a própria cabine (interior escuro com janelas claras), que gira junto com o carro; só o capô reflete o céu. O casco e a gaiola projetam sombra, então o sol entra apenas pelas janelas. As peças fixas são fundidas por material, e a vista interna usa menos chamadas de desenho do que antes. Origem e licença das texturas: [creditos.txt](teste/assets/texturas/interior/creditos.txt); materiais, mostradores e adesivos em `teste/cockpit-materials.js`.

O suporte na parte inferior do volante agora tem o **celular do piloto**, com tela de mensagens no lugar do “99”. Após quatro segundos na câmera interna, chega **“Buscar filha na escola”**, enviada pela esposa. Depois aparecem recados fictícios de família, escola e tarefas de casa em intervalos de 48–75 segundos, sem repetir o recado anterior. Cada notificação fica na tela por 18 segundos, acompanhada de uma vibração visual curta e um toque que respeita o volume e o silêncio do jogo. Olhar para baixo com o mouse permite examinar a tela. O relógio das notificações congela na pausa e nas câmeras externas; a troca de pintura preserva a mensagem e reposicionar reinicia a sequência. Os textos e a tela estão em `teste/family-phone.js`; os testes estão em `scripts/testar_celular.mjs` e `scripts/verificar_celular.py`.

O **herói 99** pilota o carro nas duas pinturas, com macacão vermelho OMP/OLI e luvas pretas do [visual aprovado](../geracoes_piloto/v01_omp_oli/LEIA-ME.md). Agora usa capacete integral preto com grafismos vermelhos e balaclava clara, baseado na [nova foto do piloto](../carro/piloto_capacete_bala_clava.jpg). O capacete tem queixeira, abertura dos olhos, bordas emborrachadas, viseira levantada, pivôs laterais e faixa oval clara na testa. A foto original é usada diretamente na região dos olhos e da balaclava; o cabelo e a barba ficam cobertos. O piloto aparece na câmera interna e através das janelas nas vistas externas.

As mãos acompanham o volante compartilhado; cotovelos, ombros e joelhos são articulados mantendo o comprimento dos membros. O câmbio continua automático na física, mas o piloto troca como uma pessoa: pelo giro do motor ele antecipa a troca e leva a mão direita à manopla, pisa a embreagem com o pé esquerdo, alivia o acelerador e passa a alavanca pela grade em H (1-3-5 à frente, 2-4-R atrás, cruzando sempre pelo ponto morto) antes de voltar ao volante; nas reduções em sequência a mão fica na alavanca. O pé direito pivota no calcanhar entre acelerador e freio, e os pedais afundam conforme a pressão; parado e engrenado, o pé esquerdo segura a embreagem, que é solta aos poucos na saída. Com Espaço (ou o botão do celular), a mão direita puxa o freio de mão hidráulico ao lado do câmbio, e a embreagem entra na manobra em velocidade; um toque rápido ainda aparece como um puxão. O tronco inclina para dentro da curva, fazendo força contra o empurrão para fora, com um pequeno atraso e rebote. A cabeça inclina um pouco mais para manter o horizonte, olha para a saída da curva antes de o volante girar, balança na frenagem e na aceleração, sacode na grama e é jogada para frente nas batidas. Em momentos calmos o piloto olha o retrovisor, o espelho esquerdo e os instrumentos, e confere o celular quando chega mensagem. Na reta, o corpo retorna ao centro; parado, esterçar não inclina o corpo. A coreografia dos comandos está em `teste/driver-controls.js`, e a dinâmica do corpo, em `teste/driver-rig.js`. A amplitude do volante visual é limitada para a pegada das mãos; o esterçamento e a física das rodas mantêm os valores da condução.

## Abrir e dirigir

Execute **INICIAR_TESTE.cmd** nesta pasta. O servidor abre o navegador e atende apenas em `127.0.0.1:8799`. Mantenha a janela do servidor aberta durante o teste; feche-a para encerrar. Não precisa instalar extensões nem acessar serviços externos para jogar. A biblioteca Three.js e as duas pinturas estão incluídas.

- **W / ↑**: acelerar; **S / ↓**: frear; **A/D / ←/→**: direção.
- **Q**: ré; **Espaço**: freio de mão, freia e reduz a aderência traseira.
- **W + Espaço**, parado no asfalto: segura o carro e faz as rodas traseiras patinarem, com fumaça, som e borracha no chão. Solte **Espaço** mantendo **W** para sair cantando pneu.
- **W + Espaço + A/D**: faz zerinho para a esquerda/direita. A combinação tem assistência de manobra em baixa velocidade; **S** segura a rotação do carro. Soltar o acelerador deixa a fumaça se dissipar.
- **C**: alternar perseguição, capô, **interna**, câmera aérea e **órbita 360°**.
- **Interna**: botão direto na pista ou opção do menu. O volante acompanha A/D, o visor indica a velocidade e o retrovisor mostra a pista atrás. A câmera fica presa ao interior do carro e acompanha as inclinações da pista.
- **Clique na pista** para capturar o mouse (Pointer Lock). Mova o mouse sem segurar botão: nas vistas externas ele controla a órbita; na interna e no capô, permite olhar para os lados mantendo a câmera escolhida. **Scroll** aproxima/afasta na órbita.
- Após **3 segundos em movimento sem mexer no mouse**, a câmera retorna suavemente: atrás do carro na órbita, para a frente na interna/capô. O retorno só começa acima de 7,2 km/h; parado, o enquadramento fica livre. Mover o mouse interrompe o retorno e reinicia a espera.
- O botão **Órbita 360°** alterna entre órbita e perseguição. A câmera acompanha o carro e respeita a altura do solo. Em tela de toque, ou sem suporte a Pointer Lock, o arraste continua disponível; no toque, dois dedos fazem zoom.
- **R**: reposicionar no centro do trecho mais próximo e reiniciar a sessão.
- **P / Esc**: liberar o mouse e pausar/abrir opções. Perder o foco da janela também libera e pausa. Para capturar novamente, retome a sessão e clique na pista.
- **M**: silenciar/reativar os sons. O controle **Volume** fica nas opções e salva sua preferência no navegador. O áudio começa ao clicar em Entrar na pista ou Reconhecimento e silencia na pausa ou ao perder o foco.
- No menu, escolha **Assinaturas · OMP** ou **Seiva · Danilo Veículos**.
- O botão **Pintura**, ao lado das câmeras na pista, alterna entre as duas skins sem pausar. **V** faz a mesma troca com o mouse capturado. O botão mostra a pintura atual e aguarda o carregamento antes de permitir outra troca; o seletor do menu acompanha a seleção.
- **Volta de reconhecimento automática** conduz pelo circuito usando a mesma física. W/A/S/D permitem assumir o volante.

O cronômetro conta voltas após passar pelos 20 setores de controle na ordem do percurso. Uma saída além dos limites invalida a volta para o melhor tempo. A sessão não tem tráfego nem rede.

O áudio inclui motor e escapamento com giro e carga variáveis, ruído mecânico nas subidas/reduções de marcha e chiado de pneus ligado ao mesmo deslizamento que desenha as marcas de borracha. O conta-giros e a marcha do HUD compartilham os valores usados pelo som. A troca automática tem uma pequena faixa de tolerância para não repetir o efeito quando a velocidade oscila no limite entre marchas. Na câmera interna, o motor fica mais abafado; na aérea, mais distante. São sons sintetizados localmente por Web Audio, com caráter de seis cilindros em linha; não são gravações do Opala real. A marcha e o RPM continuam sendo uma representação audiovisual, sem mudar a física de tração.

`scripts/testar_audio.mjs` verifica marchas, tolerância dos limites, pausa, ré, reposicionamento e ativação dos pneus. `scripts/verificar_audio.py` confere a saída real de áudio no navegador, os controles, a persistência do volume e renderiza o grafo de áudio offline para conferir sinal, variação de frequência e ausência de saturação. Resultado em `dados/validacao_audio.json`.

Abra **interlagos_opala99.blend** para editar no Blender. O carro está na largada, orientado com a rampa e o caimento locais. A cena contém câmeras de perseguição, planta e visão geral. O Blender é o arquivo de edição; a condução está no teste do navegador.

## Arquivos principais

| Arquivo | Conteúdo |
|---|---|
| `interlagos_opala99.blend` | Cena editável em metros; pista, terreno, cenário e Opala OMP |
| `exports/interlagos_pista.glb` | Pista e cenário com textura incorporada, para outras engines |
| `exports/interlagos_colisao.glb` | Apenas a faixa do asfalto, para colisão estática |
| `teste/` | Aplicação Three.js, biblioteca local e carros nas duas pinturas |
| `dados/perfil_pista.csv` | Centro, largura, rampa, caimento e zebras das 2.148 seções |
| `dados/pista.json` | Mesma superfície e terreno usados pela simulação, com o bloco `pit` do pit lane |
| `teste/interlagos-pit.js` | Pit lane de Interlagos: asfalto, pinturas, muro dos boxes com alambrado, muros da saída e garagens |
| `teste/pit-lane.js` | Superfície do pit lane, muros com colisão e zona de limite de velocidade |
| `dados/validacao_boxes.json` | Pit lane no navegador: superfície, HUD e capturas `renders/boxes_*.png` |
| `dados/validacao_geometria.json` | Métricas finais e fator de calibração |
| `dados/validacao_fisica.json` | Teste de duas voltas e efeito da gravidade |
| `dados/validacao_capotagem.json` | Rodadas, contraesterço, saltos, capotagens, fiscais e saídas de pista no relevo real |
| `dados/validacao_browser.json` | Carregamento e controles testados no Edge |
| `dados/validacao_orbita.json` | Órbita, zoom, obstáculos e esterçamento das duas pinturas |
| `dados/validacao_asfalto.json` | Material WebGL, textura e condução nas câmeras de perseguição, capô e órbita |
| `dados/validacao_cockpit.json` | Câmera interna, texturas do interior, reflexos da cabine, banco, volante, visor, pinturas e retorno às câmeras externas |
| `dados/validacao_pointer_lock.json` | Captura nativa, olhar livre, retorno automático e liberação do mouse |
| `teste/cockpit.js` | Interior 3D e instrumentos reconstruídos das fotos locais |
| `teste/cockpit-materials.js` | Materiais do interior, reflexo da cabine, mostradores, LCD, etiquetas e adesivos |
| `teste/driver.js` e `teste/driver-rig.js` | Herói sentado, mãos no volante e animação do corpo |
| `dados/validacao_piloto.json` | Pegada, braços, curvas dos dois lados, troca de marcha pela mão, pedais, freio de mão, pinturas e reset |
| `renders/` | Visão geral, carro na largada, teste e gráficos |
| `fontes/` | Mapa FIA, ortofoto, metadados e recorte dos dados LiDAR oficiais |
| `scripts/` | Código de extração, processamento, criação e verificação |

## Fontes oficiais

1. **FIA — mapa do GP de São Paulo de 2025**, edição de 06/11/2025, folha 2 do PDF: traçado, sentido, numeração T1–T15, comprimento nominal e o percurso do pit lane (entrada “PE” antes da T15, saída na Reta Oposta); folha 3: desenho do pit lane com linhas de entrada, garagens e saída. [Documento da FIA](https://www.fia.com/system/files/decision-document/2025_sao_paulo_grand_prix_-_event_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_quarantine_zone_and_red_zones_map.pdf). Cópia em `fontes/fia_interlagos_mapa_2025.pdf`.
2. **Prefeitura de São Paulo — Pista Oficial**: extensão de 4.309 m e largura de 12–15 m. A página também cita aproximadamente 56 m de desnível. [Página do autódromo](https://autodromodeinterlagos.prefeitura.sp.gov.br/pistaoficial).
3. **Prefeitura / GeoSampa — levantamento LiDAR 2017**: utilizado o solo, classificação LAS 2. [Metadados municipais](https://metadados.geosampa.prefeitura.sp.gov.br/geonetwork/srv/resources/datasets/6f659d23-762a-4e16-9506-e0bd4f535417), [visualizador público](https://visualizador-laz-web.s3-sa-east-1.amazonaws.com/index.html), [índice EPT público indicado pelo visualizador](https://ept-m3dc-pmsp.s3-sa-east-1.amazonaws.com/ept.json). Instruções oficiais de uso: [tutorial GeoSampa](https://geoinfo-smdu.github.io/tutorial-GeoSampa/).
4. **GeoSampa — ortofoto RGB 2020**, camada `ORTO_RGB_2020`, usada para registrar o centro do asfalto e como textura do terreno. [Serviço raster WMS](https://raster.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wms?service=WMS&request=GetCapabilities). Recorte em EPSG:31983: `[326250, 7376700, 327850, 7378550]`, imagem de 2.400 × 2.775 px, aproximadamente 0,667 m/px. Para o eixo, as larguras, as zebras e o pit lane foram usados blocos de 400 × 400 m a **0,2 m/px** da mesma camada (`fontes/orto_20cm/`, baixados por `scripts/refinar_tracado.py`).
5. **Formula 1 — características de Interlagos**: referência independente de cerca de 43 m de variação de altitude. [Artigo oficial da F1](https://www.formula1.com/en/latest/article/5-reasons-we-love-the-brazilian-grand-prix.37v8PT899Wnp7v6y51sUMf).

As fontes foram consultadas em 13/09/2026. Os links são públicos, sem contato com terceiros ou uso de credenciais.

## Como a superfície foi construída

O desenho da FIA contém uma faixa vetorial triangulada. Extraí seu eixo e o registrei sobre a ortofoto municipal usando pontos de controle visuais. O mapa da FIA é esquemático: a conferência na ortofoto foi necessária principalmente na Junção. Os controles e o método estão em `dados/registro_tracado.json`; `renders/alinhamento_tracado.jpg` mostra a sobreposição. Não são pontos de controle GNSS levantados em campo.

Foram obtidos 1.458 nós EPT, com 60.037.880 pontos antes do recorte. O processamento reteve **4.580.960 pontos classificados como solo** dentro da área de interesse. A fonte e as contagens estão em `dados/lidar_proveniencia.json`; as coordenadas originais estão em `dados/lidar_solo_2017.npz`.

**Refinamento de 23/09/2026.** O registro inicial usava uma imagem reduzida (~1,1 m/px) e deixava o eixo até 10 m fora do centro do asfalto em alguns trechos: sobre a zebra na T2, sobre a linha de borda antes da Ferradura e na borda leste depois da T15. `scripts/refinar_tracado.py` retifica a ortofoto de 20 cm ao longo do eixo, em transectos a cada 0,5 m, e escolhe por programação dinâmica o centro e a largura que encaixam nas duas linhas brancas de borda, penalizando grama, terra, zebra e a pintura verde-água das áreas de escape. São duas passadas: a segunda corre ao longo do eixo já corrigido, para não distorcer os transectos nos grampos. O deslocamento do eixo ficou em 3,3 m na mediana, 7,5 m no percentil 90 e 10,3 m no máximo. Onde o pit lane encosta na pista (entrada e retorno), as linhas das duas faixas se confundem; ali a borda da pista é ligada suavemente entre as estações vizinhas, e o eixo é suavizado em ~20 m (ajuste cúbico, que preserva os grampos), para que ruído de pintura não vire curva falsa na reta. As larguras passaram a ser medidas entre as linhas: 9,2–20,1 m, com 0,25 m de asfalto além de cada linha. As zebras são marcadas onde a faixa de 0,3–1,1 m fora da linha mostra blocos pintados alternados: 1,7 km no total, só nas curvas. Método, pontos de controle e estatísticas em `dados/registro_tracado.json`.

Ao longo do centro, a cada aproximadamente 2 m, ajustei um plano aos pontos de solo sobre o próprio asfalto: ±2,5 m ao longo e entre as linhas de borda, com rejeição robusta de resíduos. O plano fornece a altura central e a inclinação transversal; o caimento não foi calculado a partir do raio das curvas. Foram suavizados o perfil longitudinal em uma janela de 13 amostras e o transversal em 15 amostras, para reduzir ruído de levantamento. Todos os pontos finais tiveram pelo menos 28 pontos de suporte. O RMSE mediano dos ajustes locais ficou em 0,047 m; **isso mede o ajuste aos pontos locais, não a precisão absoluta da reconstrução**. Com o eixo sobre o asfalto, o caimento deixou de misturar os taludes vizinhos: a T1 ficou 1,2 m mais baixa e a T15 mostra o caimento de −12% para dentro da curva.

Com o eixo refinado, o percurso bruto em 3D ficou em **4.299,47 m**, 0,22% abaixo do nominal (antes, 4.291,37 m e 0,41%). Apliquei um fator horizontal explícito de **1,002220109** a toda a cena, ao pit lane e ao terreno para obter **4.309,00 m no eixo 3D**, preservando as alturas medidas. O eixo em planta mede 4.304,66 m. Esta é uma calibração para o jogo, não uma alegação de que a digitalização produziu exatamente o comprimento homologado. As coordenadas UTM originais foram preservadas separadamente.

O terreno usa uma grade de cerca de 4 m, interpolada dos pontos de solo. Um colar visual próximo à faixa de asfalto foi ajustado para ligar o terreno à superfície suavizada e evitar interseções. O relevo original está preservado no campo `z` de `dados/terreno.npz`; o campo `visual_z` contém esse ajuste de apresentação. A ortofoto foi aplicada ao terreno inteiro com o mesmo fator horizontal.

## Medidas do modelo final

| Medida | Resultado |
|---|---:|
| Comprimento do eixo 3D, calibrado ao nominal FIA | 4.309,00 m |
| Desnível entre maior e menor altura central | 42,94 m |
| Menor / maior cota na base LiDAR | 739,71 / 782,65 m |
| Maior descida / subida no perfil suavizado | −13,71% / +10,11% |
| Caimento transversal assinado | −16,48% a +9,91% |
| Seções do asfalto | 2.148 |
| Largura entre as linhas de borda, mais 0,25 m de cada lado | 9,2–20,1 m |
| Zebras identificadas na ortofoto | 1,70 km (direita 0,76 km, esquerda 0,94 km) |
| Pit lane, da linha de entrada ao retorno | 1.197 m |

O sinal do caimento é positivo quando o lado esquerdo, olhando no sentido de corrida, está mais alto. São resultados da reconstrução e do tratamento dos dados, não números publicados pela FIA.

O desnível extraído concorda aproximadamente com os **43 m** citados pela F1. A página municipal cita **56 m**; mantive o resultado do levantamento no percurso, sem esticar o eixo vertical para forçar esse outro valor.

As larguras e as zebras vêm das linhas pintadas na ortofoto de 2020. O intervalo municipal de 12–15 m é uma média: a pista tem trechos mais estreitos (cerca de 9 m entre as linhas antes da Ferradura) e mais largos (a saída da T15). **Não foi obtida uma tabela oficial de largura ou superelevação por estaca**. Os muros, os boxes, a arquibancada e o pórtico são representações simplificadas, não um levantamento das instalações atuais.

## Pit lane (boxes)

O percurso segue o mapa e o desenho do pit lane da FIA (2025), traçado na ortofoto de 20 cm e com cotas do LiDAR de 2017:

- **Entrada**, 70 m depois do Café (s = 3.912 m): uma linha transversal abre uma faixa de ~7 m à esquerda da pista, separada por uma linha contínua, com uma tracejada guiando a entrada. Cerca de 50 m depois começa o zebrado verde-água com chevrons, que se alarga até o bico do muro dos boxes.
- Uma **chicane** leve e uma subida de ~6% levam ao nível das garagens. O pit lane das garagens é **plano** (60,5–60,6 m em 280 m), enquanto a reta principal ao lado sobe de 58,4 para 62,5 m, como no local.
- **Garagens**: faixa rápida de ~5 m, área de trabalho diante das portas e 24 boxes. O bloco tem ~8 m e a cobertura de membrana fica a ~13,5 m, alturas medidas nos pontos de edificação do LiDAR. O muro dos boxes é a plataforma de concreto de ~5 m entre a pista e o pit lane, com alambrado do lado da pista.
- **Box 99**, no meio das garagens, fica **aberto**: o carro entra de frente (16 m de fundo, piso de epóxi com o 99 pintado, luzes, pneus e carrinho de ferramentas). Parado no retângulo amarelo, abre o pitstop do jogo: gasolina, reparos e o passeio a pé. O box ao lado é a **Lanchonete da Tia**, separada da garagem por uma grade com passagem só para quem está a pé. Os outros boxes ficam fechados.
- **Limite de 60 km/h** entre as linhas pintadas antes do primeiro e depois do último box. Não há limitador: o carro mantém toda a potência e a responsabilidade é do piloto. Passar da zona acima de 62 km/h (60 mais 2 de tolerância) invalida a volta, como cortar a pista; o HUD avisa `EXCESSO DE VELOCIDADE NOS BOXES · VOLTA INVÁLIDA` e a linha da volta mostra a velocidade registrada. Dentro da zona o HUD mostra `PIT LANE · MÁX. 60 km/h`. Quem sai dos boxes entra na Reta Oposta, onde os rivais passam em velocidade de corrida.
- **Saída**: depois das garagens, a faixa desce a −12% junto com a pista, passa sob a passarela, faz uma curva de ~117° com zebras e segue por uma via murada por dentro do S do Senna e da Curva do Sol.
- **Espaço para pilotar**: fora das garagens, o asfalto tem pelo menos 7,5 m (acostamento além das linhas pintadas) e as muretas ficam a 1,5 m da borda. O corredor tem ~10,5 m entre muros na saída; só no bico e no fim do muro dos boxes o asfalto fica em ~6,6 m. O **retorno** é na Reta Oposta (s = 864 m), onde só zebras separam o pit lane da pista. A ortofoto mostra também uma faixa mais curta que volta logo depois da T2; como não é a saída do mapa FIA, não foi modelada.

Na física, o pit lane tem superfície própria (cota, rampa e caimento), fundida ao plano da pista onde as duas se tocam. Muros e fachadas têm colisão, e a volta continua sendo cronometrada pelo pit lane: passar pelos boxes não invalida a volta. O guardrail esquerdo da reta principal foi substituído pelo muro dos boxes. `scripts/testar_boxes.mjs` confere o traçado, as emendas, a largura, o afastamento das muretas, a punição por excesso de velocidade (sem limitador), o muro, a entrada no Box 99, a grade da lanchonete e uma volta completa pelos boxes. `scripts/verificar_boxes.py` confere superfície, HUD, minimapa e o pitstop do Box 99 no navegador.

## Limites e física do teste

Esta versão é uma base de jogo apoiada em dados oficiais de épocas diferentes: solo de 2017, imagem de 2020 e mapa de 2025. Mudanças posteriores de pavimento e infraestrutura não estão garantidas. Não é uma pista homologada, um laser scan atual dedicado ao asfalto ou uma reprodução arquitetônica completa.

A condução usa um corpo rígido de 1.250 kg com centro de massa a 0,52 m do chão, entre-eixos de 2,667 m (1,55 m até o eixo dianteiro e 1,117 m até o traseiro) e suspensão nas quatro rodas. Cada roda lê o chão sob o próprio ponto de contato (pista, pit lane ou terreno LiDAR), com 7 cm de curso estático, batentes e barras estabilizadoras. Assim o carro tem altura, rolagem e arfagem próprias: acompanha as ondulações, fica leve nas lombadas, decola ao pegar um barranco em velocidade e volta a cair sobre as molas. Na câmera externa as rodas descem quando a suspensão estica no ar; na interna, a vista gira com o carro.

Os pneus trabalham por eixo, cada um com seu limite de atrito dividido entre frear, acelerar e fazer a curva. O freio é mais forte na frente, então frear forte em curva faz o carro sair de frente. Quando a traseira passa do limite (freio de mão, potência demais em primeira, perda de carga), o pneu que desliza agarra menos e a dianteira continua girando o carro: sem contraesterço, ele roda. Com a traseira fora, o volante ganha curso para contraesterçar e o cáster já puxa as rodas para o lado da derrapagem. A carroceria (para-choques, soleiras, laterais, teto e assoalho) encosta no chão com atrito: pode raspar, cravar o bico num barranco, tombar e capotar em sequência. A grama tem cerca de dois terços da aderência do asfalto e só um pouco mais de resistência ao rolamento; não há freio artificial nela. O que atrasa quem corta pela grama é o próprio terreno: menos tração, ondulações que tiram carga das rodas, rampas e barrancos. Subindo um morro, o peso passa para as rodas traseiras e a tração aumenta. A carroceria segue as medidas do modelo (ângulos de ataque e de saída de cerca de 19° e 15°, assoalho a 16 cm do chão), então o carro só raspa ou encalha em quebras de relevo realmente bruscas. A grama é previsível: fora do asfalto a traseira guarda mais margem, o pneu que traciona crava a banda no solo e mantém a mordida lateral, e um pneu deslizando de lado ara a terra e freia o deslize. Por isso, acelerar em curva na grama faz o carro sair de frente em vez de rodar. A aderência acompanha as variações de carga com um pequeno atraso, como um pneu real, então um solavanco curto não tira o carro da linha. Deslizar de lado acima de uns 80 km/h, porém, faz os pneus cavarem até tropeçar o carro. Um carro parado de lado ou de teto é desvirado pelos fiscais depois de 3 s, no mesmo lugar e com a mesma direção. Aterrissagens duras e batidas da carroceria contam como impacto (som, avarias e o tranco no piloto), e os rivais usam a mesma física. Os números de marcha são indicativos. Não há deformação da carroceria, quebra de suspensão nem o acerto real do carro de competição.

O burnout é uma assistência de jogo ativada por acelerador e freio de mão juntos, no asfalto e abaixo de 43,2 km/h. Ela segura o carro quando alinhado, permite que a traseira escorregue para fora ao esterçar e calcula um giro traseiro independente. Ao soltar o freio de mão, a patinagem diminui progressivamente na arrancada. Essa combinação representa a manobra de forma simplificada; não é uma simulação mecânica do freio de mão bloqueando o mesmo eixo tracionado.

O giro excedente alimenta o som dos pneus, o RPM, as marcas no ponto de contato e a fumaça. As derrapagens em movimento também soltam fumaça conforme a intensidade. `teste/tyre-smoke.js` mantém até 256 partículas em uma única chamada de desenho; elas crescem e desaparecem no espaço da pista, congelam na pausa e são removidas ao reposicionar. Os testes estão em `scripts/testar_burnout.mjs` e `scripts/verificar_burnout.py`, com relatórios `dados/validacao_burnout*.json` e capturas `renders/burnout_*.png`.

A aderência nas curvas considera a posição do eixo traseiro, 1,117 m atrás da origem do carro, e a força necessária para acompanhar a mudança de direção. Isso evita que a traseira deslize por atraso da resposta em manobras lentas. A aderência também compensa a gravidade transversal dentro do seu limite, evitando escorregar parado apenas por causa do caimento. O freio de mão reduz a aderência lateral e mantém a possibilidade de derrapagem. As marcas e o chiado distinguem o movimento normal de curva do deslizamento; o efeito visual de frenagem cresce progressivamente acima de aproximadamente 29 km/h.

`scripts/testar_aderencia.mjs` verifica curvas lentas dos dois lados, ré, repouso em caimento, embalo sem acelerar, passos de simulação de 1/60 a 1/240 s e derrapagem com freio de mão. A comparação inicial está em `dados/aderencia_antes.json` e o resultado atual em `dados/aderencia_depois.json`. `scripts/verificar_aderencia.py` confere direção, frenagem, marcas e som no navegador.

`scripts/testar_capotagem.mjs` cobre o comportamento além do limite. Verifica a rodada com freio de mão a 90 km/h e a recuperação com contraesterço, o sobre-esterço de potência em primeira, a frenagem forte em curva sem rodar e a curva no limite sem escorregar. Na grama, confere que curva acelerando, acelerador a fundo com o volante virado e alívio no meio da curva não rodam o carro. Na parte de saltos, confere a rampa que lança o carro e o devolve às quatro rodas (igual em passos de 1/60 a 1/240 s), a lombada que não tira do chão um carro lento mas faz um rápido flutuar, a rampa sob um lado só, que capota, e o deslize lateral rápido na grama, que tropeça o carro enquanto o lento não. Também verifica os fiscais, a ausência de marcas de pneu no ar, saídas de pista a 160 km/h em todo o relevo real (decolam, algumas capotam, nenhum valor inválido), o carro parado no barranco sem tremer e o piloto automático se virando depois de rodar. Resultado em `dados/validacao_capotagem.json`. `scripts/verificar_capotagem.py` repete no navegador um salto num barranco real, a capotagem e o resgate, conferindo que o modelo desenhado segue a pose da física, que as rodas ficam penduradas no ar e os avisos do HUD. Resultado em `dados/validacao_capotagem_browser.json` e capturas em `renders/capotagem_*.png`.

O GLB de colisão inclui apenas o asfalto. Ao integrar em outra engine, configure-o como corpo estático com colisão côncava/triangular e acrescente colisores ao terreno e às instalações conforme necessário. A física do navegador consulta o mesmo perfil em JSON, não depende de uma colisão escondida ou de uma pista plana.

## Coordenadas e reprodução

Blender: **X = leste, Y = norte, Z = cima**, em metros. Origem dos dados: E 327050, N 7377625, Z 720, SIRGAS 2000 / UTM 23S, EPSG:31983. Para converter coordenadas horizontais do modelo de volta para a base original, divida X/Y pelo fator 1,002220109 e some a origem. Para Z, some 720. O glTF usa Y para cima; a conversão é `(X, Z, −Y)`.

Scripts, na ordem: `baixar_lidar.py` (só se precisar obter novamente a fonte), `extrair_tracado.py` (registro inicial do mapa FIA), `refinar_tracado.py` (ortofoto de 20 cm: eixo, larguras, zebras e pit lane), `processar_relevo.py` e `criar_blender.py`, este executado pelo Blender. Sem o modelo do carro em `../modelo_3d`, o Blender exporta os GLBs e salva a cena sem o Opala. Dependências Python locais estão em `scripts/_deps`. Para o teste pronto não é necessário instalar essas bibliotecas: basta o Python existente, os arquivos entregues e um navegador com WebGL2.

O carro vem dos dois `.blend` editáveis em `../modelo_3d/v04_fechamentos/`. O [README do modelo](../modelo_3d/v04_fechamentos/README.md) explica como editá-los e exportar os GLBs de `teste/assets/`. A verificação no navegador está em `scripts/verificar_fechamentos.py`, com resultado em `dados/validacao_fechamentos_browser.json` e capturas `renders/fechamento_*.png`.

## Verificação

As derrapadas deixam marcas dinâmicas de borracha na trajetória dos pneus, com bordas suaves e intensidade proporcional ao deslizamento. **Espaço** aciona o freio de mão e marca primeiro os pneus traseiros; **S / seta para baixo**, em velocidade, também deixa marcas de frenagem. As quatro rodas podem marcar durante uma derrapagem. As faixas acompanham o relevo e o caimento do asfalto, sem pintar a grama ou deixar riscos com o carro parado. As marcas permanecem ao reposicionar com R e ao trocar a pintura; recarregar a página limpa a sessão. O limite de 8.192 segmentos substitui os mais antigos e usa um único objeto de renderização. O efeito é visual, baseado na física simplificada de condução, sem acrescentar um modelo de desgaste dos pneus.

`scripts/testar_derrapadas.mjs` confere aderência ao relevo, largura dos pneus, ativação, limite de memória e interrupção ao reposicionar. `scripts/verificar_derrapadas.py` testa os comandos no Edge e salva as capturas em `renders/derrapadas_*.png`.

- Duas voltas completas com o controlador de reconhecimento e a mesma física de condução: nenhuma saída do asfalto; afastamento lateral máximo de 1,68 m e mais de 43 m de variação de altura percorrida.
- Teste de embalo: o carro ganhou velocidade na descida e perdeu na subida, sem acelerar.
- Edge com WebGL: carregamento sem erros de JavaScript, aceleração, frenagem, direção, troca de câmera e carregamento das duas pinturas. Quatro pivôs de roda identificados.
- Órbita no Edge: quatro quadrantes por arraste, vista superior, zoom, acompanhamento em movimento, reposicionamento e troca das câmeras. A câmera aproxima antes de obstáculos como o pórtico da largada.
- Esterçamento conferido pelos eixos das rodas dos GLBs: A aponta as dianteiras para a esquerda do carro, D para a direita; as traseiras permanecem alinhadas. Verificação nas duas pinturas e em cinco fases de rotação, incluindo marcha à ré, sem inversão ou inclinação lateral causada pelo giro.
- Arquivo Blender salvo, renders produzidos e exports GLB separados para cena e colisão. Relatórios e imagens de conferência estão em `dados/` e `renders/`.

O teste automatizado de navegador usou renderização por software, portanto seus tempos de captura não representam o desempenho de uma GPU. Em computadores mais lentos, a simulação reduz o avanço por quadro para manter estabilidade.

O cockpit é uma reconstrução visual para o navegador, com medidas aproximadas. O conta-giros e o shift light usam uma estimativa baseada na velocidade e nas marchas indicativas do teste; os instrumentos de óleo/temperatura são ilustrativos. O retrovisor renderiza a cena traseira em 768 × 192 a cada quadro da câmera interna, usando a posição atual do carro. A passagem do retrovisor reutiliza as sombras e só roda na visão interna. O teste `scripts/verificar_retrovisor.py` confere a sincronização em movimento, nas trocas de câmera e após reposicionar o carro. O interior detalhado está no módulo do jogo; os arquivos Blender anteriores continuam disponíveis para edição e referência.

O controle do mouse usa a [API Pointer Lock documentada pela MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestPointerLock), acionada por clique, com tratamento de `pointerlockchange` e `pointerlockerror`. O temporizador do retorno usa tempo real, enquanto a rotação usa interpolação suave. `scripts/testar_retorno_camera.mjs` verifica os limites de tempo, pausa, parada e interrupção por movimento do mouse; `scripts/verificar_pointer_lock.py` verifica a integração no Edge.

O piloto é um modelo de jogo com proporções aproximadas e articulação por partes; não é uma digitalização corporal. Seu modelo e animação estão nos módulos do navegador. O capacete acompanha a cabeça e sua compensação nas curvas, com espaço abaixo do teto. As partes não visíveis na foto foram completadas por aproximação e simetria. A referência original sem capacete continua disponível nos arquivos de imagens. `scripts/testar_piloto.mjs` verifica o alcance dos braços nas combinações extremas de volante e inclinação, a grade em H, a antecipação e o tempo de cada troca no carro simulado (subidas e reduções), pedais, freio de mão, ré, cabeça e olhar. `scripts/verificar_capacete.py` confere a integração nas duas pinturas e gera vistas interna, externa e detalhes do capacete em `renders/capacete_*.png`.
