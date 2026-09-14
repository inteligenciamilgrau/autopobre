# Circuito Oval de Curvelo — primeira versão jogável

O segundo circuito usa os mesmos Opalas, 14 adversários, controles, áudio,
marcas de pneus e modos de corrida de Interlagos. A seleção fica na abertura,
é lembrada no navegador e também pode ser compartilhada com `?circuito=curvelo`.
A troca carrega o circuito escolhido. Durante uma corrida a seleção fica oculta;
ao voltar ao menu principal, volta a estar disponível. A corrida normal mantém
3 voltas e a imersiva, 1 volta. Os recordes são separados por circuito e modalidade.
Recordes antigos, sem circuito gravado, continuam associados a Interlagos.

## Fontes primárias consultadas em 14/09/2026

- [CBA — bastidores do primeiro circuito oval, 09/08/2024](https://www.cba.org.br/noticias/noticiasinfo/2824/conheca-os-ldquo-bastidores-rdquo-do-primeiro-circuito-oval-do-brasil):
  desenho do traçado, extensão de 1.250 metros e descrição da adaptação da pista
  de testes, com uma nova curva e prolongamento de reta.
  O centro do asfalto foi aproximado a partir da imagem de projeto publicada pela CBA.
- [NASCAR Brasil — calendário 2026](https://www.nascarbrasil.com.br/calendario2026/):
  1.250 metros e duas curvas para Curvelo.
- [Circuito dos Cristais — autódromo](https://www.circuitodoscristais.com.br/autodromo/):
  oval com duas curvas, uma delas com sobrelevação de 16%, outra com área de escape
  e caixa de brita. A descrição arredonda a extensão para 1,2 km; a escala desta
  reconstrução segue os 1.250 metros publicados pela NASCAR e CBA.
- [NASCAR Brasil — formato de Curvelo, 12/09/2025](https://www.nascarbrasil.com.br/2025/09/12/etapa-de-curvelo-traz-formato-historico-com-100-voltas-no-tracado-oval/):
  confirma a curva plana com escape asfaltado e brita, em contraste com a curva inclinada.

## Fidelidade e aproximações

O traçado assimétrico possui 626 amostras, com espaçamento próximo de 2 metros,
e perímetro de 1.250 metros. O sentido adotado é anti-horário. A curva mais aberta
tem caimento transversal progressivo até 0,16: **16% equivalem a cerca de 9,09°,
não a 16 graus**. A parte externa fica mais alta. As rodas, carroceria, asfalto,
zebras e barreiras usam a mesma superfície. A curva plana possui escape externo
e barreira mais afastada, com o mesmo afastamento na física de colisão.

Não foi encontrado levantamento topográfico executivo com coordenadas,
cotas longitudinais, raios e larguras para o oval. Portanto, o desenho é uma
aproximação do projeto publicado, não uma certificação do traçado construído.
A largura de 14 metros, raios suavizados, transições da inclinação, comprimento
das zonas de escape e posição da linha de largada são escolhas de modelagem.
A linha central fica nivelada; não inventamos subidas oficiais. O mostrador de
altitude fica sem valor em Curvelo por não haver cotas verificadas.

Terreno, vegetação de cerrado, boxes, torre, arquibancadas e anúncios são cenário
aproximado para o jogo. Não se importaram os 4,4 km e o desnível do circuito misto:
ele é uma pista diferente dentro do mesmo complexo.

O acesso ao pitstop, Box 99 e Lanchonete da Tia no interior da reta principal
são extensões fictícias de jogabilidade. O ramal se liga progressivamente à pista
e atravessa a mesma linha de cronometragem; entrar no box não invalida a volta.
Ele não pretende representar a posição ou as dimensões dos boxes reais de Curvelo.

Geometria e cenário são gerados pelos módulos `teste/curvelo-data.js` e
`teste/curvelo-scene.js`, sem carregar imagens de terceiros durante o jogo.
As fotografias de pesquisa permanecem fora do pacote público.
