# Auto-Pobre Racing com Stevan Gaipo

Primeira versão jogável do modo imersivo, opcional no menu do teste de Interlagos. Na primeira visita, **Versão Imersiva opcional** já vem marcada. Clique em **Entrar na pista**. Depois, o jogo lembra a última escolha; desmarcar mantém a sessão livre também nas próximas visitas.

A abertura ilustrada com Stevan, o Opala OMP e a torcida brasileira aparece nos dois modos, com a opção imersiva ligada ou desligada. A logo tem fundo transparente. Os [originais e prompts](../geracoes_jogo/v01_abertura/PROMPTS_E_ORIGENS.md) ficam em uma pasta separada; a [prévia do menu](renders/abertura_imersiva_desktop.png) mostra a integração. A arte é uma interpretação cinematográfica, independente do traçado técnico usado no jogo.

## Da vaquinha ao sexto lugar

1. **Torcida:** Stevan começa a pé. Use W/A/S/D para se aproximar de um dos seis torcedores e E para conversar. Cada pessoa dá uma pista sobre o tipo de piada de que gosta. Escolha com os botões ou 1/2/3; uma risada rende contribuição, uma piada que não funciona não paga. Cada torcedor contribui uma vez por tentativa, e é possível tentar outra piada.
2. **Preparação:** a inscrição custa R$ 100; o combustível, R$ 6,50/L. Com R$ 126 na vaquinha, abre-se a preparação. Escolha de 2 a 12 L; a recomendação é reservar 3–4 L para uma volta, além de margem para patinagem e vazamentos. A proteção extra do vidro custa R$ 30 e reduz o dano por impacto.
3. **Partida:** dê toques em W para manter o acelerador na faixa verde, de 22% a 65%. I ou o botão de partida aciona o motor de arranque. É preciso sustentar a faixa por pouco mais de 0,7 s. Excesso de acelerador durante a partida afoga; insistir por quatro segundos sem conseguir ligar esgota a bateria. Ambos chamam o reboque.
4. **Corrida:** uma volta completa contra cinco adversários fictícios. Eles percorrem o traçado e reduzem nas curvas. As carrocerias compartilham a geometria refinada do Opala, com cores e identificadores próprios. O HUD mostra a posição na pista, gasolina, condição do carro e do vidro.
5. **Avarias:** sair bastante dos limites em velocidade desgasta os suportes do tanque. Ao cederem, ele cai sob a traseira, arrasta pelas cintas, deixa um rastro e perde combustível. Impactos e excursões também danificam o carro. Peças visíveis podem se desprender de um adversário próximo à frente; há aviso e tempo para mudar de trajetória. Acumular impactos estilhaça o para-brisa, que recebe trincas visíveis nas câmeras internas e externas.
6. **Resgate:** motor afogado, bateria esgotada, pane, vidro estilhaçado ou falta de gasolina interrompem a corrida. O reboque chega automaticamente. A fita tem comprimento fixo de 5 m: quando o caminhão reduz, use S para frear o Opala e impedir que ele avance sobre a folga. A fita pode enroscar na roda dianteira. Desenroscar permite continuar, com desconto de R$ 25 no prêmio. R solicita resgate e abandona a volta neste modo.
7. **Vistoria:** ao terminar a corrida ou voltar de reboque, o carro é levado ao parque fechado. Pare e aguarde os oito segundos de revisão do juiz. O botão de levar ao box antes da revisão, ou dirigir até a zona dos boxes antes da liberação, causa desclassificação — inclusive após uma vitória.
8. **Pódio:** Stevan aparece fisicamente no degrau **6**, sempre. O resultado distingue sua posição real na corrida, a situação da vistoria e o sexto lugar da foto. Ganhar, quebrar, ficar sem gasolina e até ser desclassificado levam ao mesmo degrau.

## O sonho da Blazer

Os prêmios por posição real são R$ 600 / 450 / 300 / 220 / 170 / 120. Quem não termina recebe R$ 40; desclassificação paga zero. Os enroscos são descontados sem criar saldo negativo. O prêmio entra uma única vez por participação.

O dinheiro vai para o fundo da oficina. Ao juntar R$ 900, aparece a possibilidade de pagar o mecânico e liberar a Blazer, visível na cena do pódio. O progresso da oficina, a liberação e o número de participações são salvos no navegador, na chave `opala99-immersive-v1`. Recarregar abre o menu com a última escolha de modo, pintura e câmera; a oficina permanece salva. “Outra corrida, outra vaquinha” inicia uma nova tentativa preservando esse progresso.

Os valores, adversários, falhas, personagens de apoio e procedimentos são regras fictícias desta comédia de corrida. A Blazer, a torcida, o socorrista e o juiz têm modelos simplificados. A fita usa uma curva de comprimento controlado e uma simulação de folga para o minijogo; não é uma simulação mecânica completa. A animação dos tanques e as trincas são efeitos do jogo. Essas cenas extras são geradas pelo navegador; os arquivos Blender da V4 permanecem a fonte do carro principal.

## Controles adicionais

| Momento | Controles |
|---|---|
| Vaquinha | W/A/S/D para andar; E para conversar/voltar; 1/2/3 para escolher a piada |
| Partida | W dosa acelerador; I aciona o motor de arranque |
| Corrida | Controles existentes; R abandona a volta e chama reboque |
| Reboque | S controla o freio; os botões de câmera continuam disponíveis |
| Vistoria e pódio | Botões do painel lateral |
| Pausa / modo original | P ou Esc; desmarque a versão imersiva e retome a sessão livre |

O reconhecimento automático é uma opção da sessão livre. As duas pinturas do Stevan, o piloto animado, celular, áudio, derrapagens e câmeras continuam disponíveis na corrida imersiva.

## Arquivos e validação

- `teste/immersive-state.js`: regras, orçamento, partida, avarias, reboque, vistoria, resultado e fundo da oficina.
- `teste/immersive-mode.js`: interação com o jogo, adversários, projéteis, painéis e persistência.
- `teste/immersive-visuals.js`: torcida, personagem a pé, pódio, oficina, adversários, tanque, vidro e fita.
- `teste/immersive.css`: apresentação do modo opcional.
- `scripts/testar_imersivo.mjs`: regras e transições, incluindo derrota, vitória, desclassificação, comprimento da fita e pagamento único.
- `scripts/verificar_imersivo.py`: navegação inicial real e piadas pela interface, depois cenários controlados de avarias e resultados para conferir a integração e as cenas. Não representa uma corrida inteira conduzida manualmente.
- `scripts/conferir_imersivo_final.py`: volta com a física real e controlador de reconhecimento em cenário de teste com adversários atrás, chegada/vistoria, geometria da fita e retorno à sessão original.
- `dados/validacao_imersivo*.json` e `renders/imersivo_*.png`: resultados e capturas.
