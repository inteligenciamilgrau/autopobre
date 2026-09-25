# Auto-Pobre Racing com Stevan Gaipo

Primeira versão jogável do modo imersivo. No menu inicial, clique em **Modo História**; **Modo Corrida** inicia a sessão livre.

A abertura ilustrada com Stevan, o Opala OMP e a torcida brasileira aparece antes dos dois modos. A logo tem fundo transparente. Os [originais e prompts](../geracoes_jogo/v01_abertura/PROMPTS_E_ORIGENS.md) ficam em uma pasta separada; a [prévia do menu](renders/abertura_imersiva_desktop.png) mostra a integração. A arte é uma interpretação cinematográfica, independente do traçado técnico usado no jogo.

## Da vaquinha ao sexto lugar

1. **Torcida:** Stevan começa a pé nos boxes. Toque ou clique na pessoa para se aproximar e conversar, depois na fala para enviá-la. Quem ainda não doou tem um `$`; receber dinheiro encerra o diálogo. Use W/A/S/D para se aproximar de um dos seis torcedores e E para conversar. Cada pessoa dá uma pista sobre o tipo de piada de que gosta. Escolha com os botões ou 1/2/3; uma risada rende contribuição, uma piada que não funciona não paga. Cada torcedor contribui uma vez por tentativa, e é possível tentar outra piada.
2. **Inscrição com a equipe 99:** é feita nos computadores da barraca da equipe, sobre o muro dos boxes. Suba a escadinha (degraus com faixa amarela) ao lado dela e entre no círculo amarelo, que brilha como os marcadores de missão do GTA e tem a placa **INSCRIÇÃO · EQUIPE 99** visível de todo o paddock; E perto do círculo também abre a conversa, e tocar ou clicar no círculo leva o piloto até lá pela escada. A equipe mostra a vaquinha contra os custos: inscrição R$ 100, gasolina R$ 6,50/L (de 2 a 12 L, escolhidos ali mesmo no controle deslizante) e a proteção extra do vidro, opcional, por R$ 30 (reduz o dano por impacto). Com menos de R$ 126 não fecha a inscrição: **Voltar e pedir mais dindin** devolve o piloto à torcida. Com o dinheiro, **Pagar e ir pra partida** (ou Enter) paga tudo e vai direto para a partida no grid. A recomendação é reservar 3–4 L para a corrida (o consumo se ajusta ao número de voltas escolhido), além de margem para patinagem e vazamentos.
3. **Partida, na visão interna:** a câmera entra no cockpit. Primeiro ligue o **IGN** no painel Luizão do alto (L, clique no interruptor do painel ou no botão IGN do cartão); sem ele o motor gira, mas não pega. Depois segure a **PARTIDA** (I, o botão PART do painel ou o botão do cartão) enquanto dosa o acelerador (W) para manter a agulha do medidor na faixa verde **NO PONTO**, de 22% a 65%, por pouco mais de 0,7 s. O medidor mostra também **BAIXO**, **ALTO** e **AFOGA**, e três barras: pegando, afogamento e bateria. A bateria dura quatro segundos de arranque e **não recarrega** entre uma tentativa e outra. O **afogamento** sobe a cada pisada no acelerador sem dar partida (a bomba de aceleração molha a vela), e depressa se o arranque gira com o pé acima de 80%; com a vela molhada o motor demora mais para pegar, e arrancar no ponto ou abaixo dele vai secando. Afogamento cheio ou bateria esgotada chamam o reboque. O som do arranque é a gravação `assets/audio/car_trying_to_start.mp3`, que desacelera conforme a bateria arria.
4. **Corrida:** 3 voltas (padrão; de 1 a 20 em Configurações › Corrida › Voltas) contra 14 adversários com nomes e números das tabelas da Old Stock enviadas pelo usuário. Eles percorrem o traçado e reduzem nas curvas. As carrocerias compartilham a geometria refinada do Opala. Cada uma tem a sua cor, a faixa clara e só o próprio número, nas duas laterais traseiras, no teto e na traseira. Não levam patrocinador, nome, logotipo nem adesivo do 99, nem na pintura nem nos vidros. O HUD mostra a posição na pista, gasolina, condição do carro e do vidro.
5. **Avarias:** sair bastante dos limites em velocidade desgasta os suportes do tanque. Ao cederem, ele cai sob a traseira, arrasta pelas cintas, deixa um rastro e perde combustível. Impactos e excursões também danificam o carro. Peças visíveis podem se desprender de um adversário próximo à frente; há aviso e tempo para mudar de trajetória. Acumular impactos estilhaça o para-brisa, que recebe trincas visíveis nas câmeras internas e externas.
6. **Resgate:** motor afogado, bateria esgotada, pane, vidro estilhaçado ou falta de gasolina interrompem a corrida. O reboque chega automaticamente. A fita tem comprimento fixo de 5 m: quando o caminhão reduz, use S para frear o Opala e impedir que ele avance sobre a folga. A fita pode enroscar na roda dianteira. Desenroscar permite continuar, com desconto de R$ 25 no prêmio. R solicita resgate e abandona a volta neste modo.
7. **Pódio:** vem logo depois da chegada ou do resgate. Stevan está sempre no degrau **6**. O primeiro fica no centro, os pares à esquerda e os ímpares à direita, em degraus descendentes. O prêmio e a sobra da vaquinha entram no saldo uma única vez.
8. **Vistoria:** depois da foto, escolha entre aguardar oito segundos com o juiz ou ir aos boxes. A interface não antecipa a penalidade: ir ao box antes da revisão desclassifica. A imagem de encerramento brinca que a foto no pódio fica para a história, aparece por seis segundos e volta à vaquinha. O prêmio atual é retirado, preservando o saldo anterior e a sobra. Com a vistoria concluída, fica disponível pagar o mecânico.

## O sonho da Blazer

Os prêmios por posição real são R$ 600 / 450 / 300 / 220 / 170 / 120. Quem não termina recebe R$ 40; desclassificação paga zero. Os enroscos são descontados sem criar saldo negativo. O prêmio entra uma única vez por participação.

O dinheiro vai para o fundo da oficina. Ao juntar R$ 900, aparece a possibilidade de pagar o mecânico e liberar a Blazer, visível na cena do pódio. O progresso da oficina, a liberação e o número de participações são salvos no navegador, na chave `opala99-immersive-v1`. Recarregar abre o menu inicial com a pintura e a câmera escolhidas; a oficina permanece salva. “Outra corrida, outra vaquinha” inicia uma nova tentativa preservando esse progresso.

Os valores, adversários, falhas, personagens de apoio e procedimentos são regras fictícias desta comédia de corrida. A Blazer, a torcida, o socorrista e o juiz têm modelos simplificados. A fita usa uma curva de comprimento controlado e uma simulação de folga para o minijogo; não é uma simulação mecânica completa. A animação dos tanques e as trincas são efeitos do jogo. Essas cenas extras são geradas pelo navegador; os arquivos Blender da V4 permanecem a fonte do carro principal.

## Controles adicionais

| Momento | Controles |
|---|---|
| Vaquinha | W/A/S/D para andar; E para conversar/voltar; 1/2/3 para escolher a piada; na barraca da equipe 99, E abre a inscrição e Enter paga e vai para a partida |
| Partida | L liga/desliga o IGN; segure I para a partida; W dosa o acelerador (ou clique no IGN e segure o PART no painel do cockpit) |
| Corrida | Controles existentes; R abandona a volta e chama reboque |
| Reboque | S controla o freio; os botões de câmera continuam disponíveis |
| Vistoria e pódio | Botões do painel lateral |
| Pausa / modo original | P ou Esc; em Config, **Voltar ao Menu Inicial** e depois **Modo Corrida** |

O reconhecimento automático é uma opção da sessão livre. As duas pinturas do Stevan, o piloto animado, celular, áudio, derrapagens e câmeras continuam disponíveis na corrida imersiva.

## Arquivos e validação

- `teste/immersive-state.js`: regras, orçamento, partida, avarias, reboque, vistoria, resultado e fundo da oficina.
- `teste/immersive-mode.js`: interação com o jogo, adversários, projéteis, painéis e persistência.
- `teste/immersive-visuals.js`: torcida, personagem a pé, pódio, oficina, adversários, tanque, vidro e fita.
- `teste/immersive.css`: apresentação do modo opcional.
- `scripts/testar_imersivo.mjs`: regras e transições, incluindo derrota, vitória, desclassificação, comprimento da fita e pagamento único.
- `scripts/verificar_imersivo.py`: navegação inicial real e piadas pela interface, depois cenários controlados de avarias e resultados para conferir a integração e as cenas. Não representa uma corrida inteira conduzida manualmente.
- `scripts/verificar_inscricao.py`: em Interlagos e Curvelo, a subida pela escada até o círculo da equipe 99 (clique na placa), o painel sem dinheiro, a volta à torcida e a compra de gasolina e proteção direto para a partida.
- `scripts/verificar_partida.py`: partida no cockpit com IGN (clique no interruptor e L), PARTIDA segurada, acelerador dosado até pegar, bateria sem recarga, vela molhada ao pisar sem dar partida, afogamento e o som gravado.
- `scripts/conferir_imersivo_final.py`: volta com a física real e controlador de reconhecimento em cenário de teste com adversários atrás, chegada/vistoria, geometria da fita e retorno à sessão original.
- `dados/validacao_imersivo*.json` e `renders/imersivo_*.png`: resultados e capturas.


No celular, jogue na horizontal usando os botões de toque. Direção e pedais aceitam múltiplos dedos. Menus, diálogos e indicadores se adaptam à tela; girar para a vertical pausa a sessão. `scripts/verificar_mobile.py` confere controles, orientação e o encerramento após o pódio em navegador com toque emulado.
