# Auto-Pobre Racing com Stevan Gaipo

Jogo de corrida para navegador com Opala 99 em **Interlagos e no Oval de Curvelo**, duas pinturas e versão imersiva opcional. A abertura ilustrada aparece nos dois modos.

Escolha o circuito na abertura. Curvelo tem 1.250 metros, duas curvas e inclinação transversal de até 16% na curva mais aberta, com traçado baseado no projeto publicado pela CBA. Largura, transições e cenário são aproximações: veja [fontes e limites da reconstrução](pista_interlagos/curvelo-fontes.md). A seleção é lembrada, o minimapa acompanha a pista e os recordes são separados por circuito e modalidade. Ao terminar, **Voltar ao menu principal** permite escolher outra pista ou outro modo. As duas pistas têm três voltas na corrida normal e uma na imersiva, com 15 carros no grid.

**Pitstop de Curvelo:** siga o P no minimapa e pare no retângulo amarelo do Box 99. O acesso e a lanchonete são uma extensão fictícia para o jogo. Você pode abastecer, reparar seis componentes ou sair do carro para tomar café com pão de queijo e doce de leite na Lanchonete da Tia. O piloto caminha até o balcão e volta ao carro; o cronômetro e os adversários continuam. Pausar o jogo também pausa o serviço.

Motor e câmbio danificados reduzem a potência; freios pioram a frenagem; pneus e suspensão afetam aderência, direção e estabilidade; tanque danificado vaza. Batidas atingem componentes de acordo com a região do impacto; sair do asfalto desgasta suspensão, pneus e tanque, e burnout desgasta pneus. O reparo completo recupera 100%. A gambiarra recupera 45% do dano restante, limitada a 78% de condição. Valores e duração aparecem antes de contratar; a melhora e o abastecimento são graduais. Sair durante o serviço preserva o trabalho feito e devolve o valor proporcional não usado. As seis peças começam íntegras em uma nova corrida; reposicionar o carro não repara danos.

Na corrida normal há R$ 450 de verba de equipe por prova, exclusivos do pitstop. Na imersiva, os serviços usam primeiro a sobra da vaquinha e depois o saldo acumulado. O café custa R$ 12 e pode ser tomado enquanto o mecânico trabalha. Os recordes de Curvelo passam a incluir o tempo gasto no box. Validação em `testar_pitstop.mjs` e `verificar_pitstop.py`.

Na primeira visita, a versão imersiva vem selecionada. Depois, o jogo lembra a última escolha de modo, pintura e câmera, inclusive alterações feitas pelos botões e atalhos durante a sessão. Volume e silêncio também são lembrados. As preferências ficam neste navegador, por endereço do site; limpar os dados do site restaura os padrões. O menu continua aparecendo antes de iniciar a sessão.

O celular funciona na horizontal, com direção, acelerador, freio, ré e freio de mão por toque simultâneo. Os botões de câmera, pintura, resgate e configurações ficam na tela; as conversas aceitam toque direto. Ao girar para a vertical, a partida pausa e pede para virar o aparelho. A resolução e as sombras são reduzidas automaticamente em dispositivos de toque.

O pódio vem antes da vistoria, com o primeiro no centro e os pares à esquerda. Levar o carro ao box antes da revisão mostra por seis segundos a cena “Desclassificado. Mas a foto no pódio fica pra história”, depois recomeça a vaquinha. Apenas o prêmio dessa corrida é retirado; o saldo anterior e a sobra ficam guardados.

## Preparar e publicar

Nos dois modos, os 15 carros largam atrás da linha. A primeira passagem não conta como volta completa nem como volta inválida. As zebras verde e amarela e o guardrail percorrem as duas bordas do circuito. Os motores adversários ficam mais presentes na mistura de efeitos, com atenuação pela distância e posição estéreo.

Depois das três voltas válidas na corrida livre, a tela “Fim de corrida” mostra a classificação e o tempo, toca a música do resultado e permite correr novamente. A partida encerrada não pode ser retomada. Se uma volta for rejeitada, o aviso permanece por dez segundos após a linha. `verificar_final_corrida.py` simula a corrida inteira e verifica o encerramento, o reinício e as músicas de vitória/derrota.

A corrida normal tem **3 voltas**; a imersiva tem **1 volta**. O HUD mostra volta/total, posição entre os 15 carros, tempo, combustível e velocidade. A câmera da corrida normal começa atrás do carro. Ao pausar, **Voltar à pista** retoma a sessão; ao completar as três voltas, o menu mostra a classificação e permite iniciar uma nova corrida. As instruções de teclado e os dados técnicos ficam fora da tela de corrida.

Na abertura do celular, **Tela cheia** entra e sai desse modo quando o navegador oferece suporte. Durante a compra de gasolina, arraste o dedo ou o mouse na pista para olhar o carro ao redor; o painel de compra continua utilizável. A publicação inclui versões nos módulos e estilos para evitar misturar arquivos antigos do cache com a atualização.

No celular, acelerador e freio dividem um **slider vertical à direita**: 60% do curso para acelerar, 10% de zona morta e 30% para frear. A resposta é progressiva e soltar zera os dois pedais; ré e freio de mão ficam ao lado. Toques perto dos controles e novos arrastos enquanto se dirige não movem a câmera. A direção fica à **esquerda**, em um controle deslizante maior e progressivo, com zona morta central e resposta suave perto do centro e com esterço máximo nas pontas, que permite trocar o sentido sem tirar o dedo e centraliza ao soltar. O freio de mão alterna entre travado e solto a cada toque, com indicação no botão; a trava permanece ao pausar e é liberada ao iniciar outra corrida. O painel do reboque ocupa a lateral, deixando o centro livre. Sair da pista por si só não invalida a volta: a regra compara o trecho avançado no circuito com a distância percorrida fora dele, tolerando pequenas excursões. Cortes relevantes ou checkpoints pulados impedem que a volta conte para a chegada. `testar_voltas.mjs` e `verificar_hud_corrida.py` cobrem essas regras e a interface.

**Configurações** abre uma tela com Corrida, Áudio e Controles. Volume global, música e efeitos são independentes e ficam salvos. O controle de efeitos toca uma prévia. A música começa depois da primeira interação, muda conforme a cena e silencia ao sair da aba.

As faixas ficam em [`pista_interlagos/teste/assets/audio/`](pista_interlagos/teste/assets/audio/README.md): `intro.mp3` na abertura, `patrocinio.mp3` na vaquinha, `race.mp3` na corrida, `turbo.mp3` na vitória e `hojenaodeu.mp3` na derrota. `energia.mp3` toca nos menus e substitui qualquer faixa ausente. Se também faltar, há cinco composições originais sintetizadas no navegador. O build descobre e copia somente os nomes permitidos. As cópias otimizadas usam 128 kbps estéreo; `audios_originais/` preserva os originais fora da publicação e do Git.

Os dois modos têm 14 adversários, contato entre carrocerias com reação à velocidade e ao ângulo da batida, e fragmentos que saltam e caem na pista. No modo imersivo, a vaquinha acontece a pé nos boxes, com câmera atrás do piloto e carros estacionados. Clique no torcedor para se aproximar e conversar; clique na fala para enviá-la, com o balão junto da pessoa. W/S anda, A/D gira o piloto, e braços e pernas alternam. Na compra de gasolina, a câmera já fica atrás do Opala com os adversários aquecendo os motores à frente. Partida, torcida, impactos, vidro, combustível, reboque, juiz e resultados têm efeitos próprios; motor, pneus e marchas continuam acompanhando a condução.

Quem ainda não contribuiu tem um `$` sobre a cabeça. Ao receber a doação, o diálogo fecha e o piloto fica livre para procurar outra pessoa. A sobra da vaquinha é transferida ao saldo acumulado no resultado, inclusive em derrota ou desclassificação. O medidor de combustível mostra litros e reserva nos dois modos; no modo normal, R reposiciona e reabastece. O minimapa mostra o 99 e os 14 adversários, que têm ritmo mais forte e procuram espaço para ultrapassar.

Validação: `testar_eventos_audio.mjs`, `testar_colisoes.mjs`, `testar_saldo.mjs`, `verificar_trilha.py`, `verificar_mp3.py` e `verificar_corrida_boxes.py` e `verificar_mobile.py`, em `pista_interlagos/scripts/`. Os testes do navegador precisam de Playwright e do servidor local iniciado.

### GitHub Pages

Em **Settings → Pages → Build and deployment → Source**, selecione **GitHub Actions**. O fluxo [Publicar Auto-Pobre Racing](.github/workflows/pages.yml) instala a dependência pelo lock, testa as preferências, gera `dist/` e publica somente esse conteúdo. Cada envio para `main` atualiza o jogo; também é possível executá-lo manualmente pela aba **Actions → Publicar Auto-Pobre Racing → Run workflow**.

Endereço do jogo: **https://inteligenciamilgrau.github.io/autopobre/**. Aguarde o fluxo concluir com sucesso antes de abrir. Não selecione a raiz de `main` em “Deploy from a branch”: ela contém o código-fonte, e o jogo precisa da etapa de geração.

No GitHub Pages, a CSP incorporada no HTML protege o carregamento do jogo. O arquivo `_headers` é destinado a outros provedores; não configura cabeçalhos personalizados no Pages.

### Gerar para outra hospedagem ou testar o pacote

Requisitos: Python 3.10+ e Node.js/npm no PATH. Na raiz do projeto:

```sh
npm ci --prefix pista_interlagos/teste --ignore-scripts
python pista_interlagos/scripts/preparar_publicacao.py
```

Publique **somente o conteúdo de `dist/`** em uma hospedagem estática com HTTPS. O jogo abre pelo `index.html`, inclusive quando hospedado em uma subpasta. Não há servidor de aplicação, conta ou segredo necessário para jogar.

A pasta é gerada com uma lista explícita de arquivos: código, imagens usadas, carros GLB, pista GLB/JSON e módulos necessários do Three.js com sua licença. Não copie a raiz do projeto para o servidor. `dist/` é um resultado do build e fica fora do Git; a hospedagem deve executar os comandos acima ou receber essa pasta pronta.

O build cria `_headers` com CSP e outros cabeçalhos. Em provedores que suportam esse formato, ele é aplicado diretamente; nos demais, configure os mesmos cabeçalhos no servidor/CDN. A CSP também está no HTML, mas a proteção contra enquadramento em outros sites depende dos cabeçalhos HTTP. Habilite HTTPS na hospedagem.

## Rodar localmente

```sh
python pista_interlagos/scripts/servidor.py
```

No Windows, também é possível executar `pista_interlagos/INICIAR_TESTE.cmd`. Ele usa `python` do PATH, ou o executável definido por você em `INTERLAGOS_PYTHON`. O servidor de prévia atende somente no loopback e só entrega os arquivos permitidos. Não use esse servidor Python como serviço público de produção.

## O que entra no Git

Código do jogo e scripts, documentação, `package.json`/`package-lock.json`, as imagens em `teste/assets/`, a pista em `dados/pista.json` e `exports/interlagos_pista.glb`.

O `.gitignore` mantém fora do repositório segredos/configurações locais, dependências, caches, relatórios de testes, fotos originais, gerações intermediárias, arquivos Blender e levantamentos brutos. As pastas de trabalho continuam no disco; mantenha um backup separado dos originais. As cópias necessárias ao jogo permanecem versionáveis.

Repositório: [inteligenciamilgrau/autopobre](https://github.com/inteligenciamilgrau/autopobre). Antes de cada commit, confira `git status` e os arquivos preparados para commit. O `.gitignore` não remove arquivos de um histórico Git existente.

Veja [a revisão de segurança](SEGURANCA.md) e [as regras do modo imersivo](pista_interlagos/VERSAO_IMERSIVA.md).

O asfalto usa os mapas de cor, normal OpenGL e rugosidade em 2K de [Clean Asphalt, de Dimitrios Savva / Poly Haven](https://polyhaven.com/a/clean_asphalt), sob CC0. O shader acrescenta borracha na linha de corrida, remendos, juntas e desgaste nas bordas, com uma camada de grãos maiores e manchas contrastadas para leitura em velocidade. Essas marcas decorativas não representam um levantamento do asfalto real de Interlagos. Os 14 adversários também deixam marcas dinâmicas nas freadas fortes e derrapadas, nos dois modos de corrida; todos os pneus compartilham um único buffer limitado.

Os adversários têm cinco estilos: freada tardia, especialista em curvas, condução constante, atacante e especialista em retas. Cada um tem ritmo, resposta dos pedais, antecipação das curvas e preferências de ultrapassagem próprios. Fora do asfalto, há maior resistência ao avanço, mais aderência que na versão anterior e trepidação da carroceria proporcional à velocidade. O guardrail contínuo acompanha os dois lados do traçado, com colisão que rebate para dentro e preserva o movimento ao raspar de lado. Essa proteção é uma adaptação para o jogo, não um levantamento das barreiras reais. `testar_terreno_rivais.mjs` verifica os estilos, o ritmo, a recuperação na grama e o contato ao redor do circuito.

A direção responde mais rapidamente ao inverter o volante, com amortecimento independente da frequência de simulação. O asfalto oferece mais força lateral em curvas rápidas e mantém uma pequena reserva para recuperar aderência. O ajuste vale para teclado, celular e adversários; a zona morta e a curva suave do slider continuam iguais. `testar_direcao.mjs` verifica entrada de curva e inversões entre 100 e 180 km/h, simetria e estabilidade entre passos de 1/60 e 1/240 s. Os parâmetros são ajustes de jogabilidade, não medições oficiais dos pneus.

O grid tem 15 carros: Stevan Gaipo / Edu Neves #99 e 14 adversários, incluindo Kleber Eletric / JP Velardi #70. Os nomes, números e resultados vêm das três tabelas fornecidas pelo usuário (etapas 3 e 4 e classificação acumulada, sem ano informado). Duplas compartilham um carro; seus pontos não são somados duas vezes. O número 00 segue a classificação acumulada. O ritmo combina pontos e resultados das etapas com cinco estilos de IA; entradas sem pontuação recebem um nível provisório de jogo. Esses níveis e as cores são adaptações para a jogabilidade. A lista completa aparece nas configurações e a classificação final inclui os 15 participantes.

Depois da bandeirada, o carro continua por cinco segundos, desacelerando e acompanhando a pista, enquanto a tela escurece. Posição, tempo e melhores voltas ficam registrados na chegada. A tela Auto-Pobre Racing apresenta os 15 carros em faixas amarelas e verdes, com melhor volta válida e tempo total; quem ainda não terminou aparece como “na pista”, sem tempo inventado. Na imersiva, a classificação vem antes de continuar para a foto no pódio; a vistoria continua depois dele.

“Voltar ao menu principal” aparece na classificação e no pódio. Encerra a sessão e retorna à abertura, permitindo mudar a modalidade nas configurações e iniciar uma nova corrida. Saldo, recordes e preferências permanecem salvos.

“Recordes de tempo” está na abertura e no resultado. O jogador pode gravar seu nome, melhor volta e melhor corrida em `localStorage`, separando a corrida de três voltas da imersiva de uma volta. Só os melhores tempos de cada nome/modalidade são mantidos, até 50 registros. O reconhecimento automático não grava recordes. Esta lista pertence ao navegador/aparelho: não é um ranking público compartilhado e não envia nomes ou tempos a um servidor. `testar_bandeirada.mjs`, `testar_recordes.mjs` e `verificar_resultados_recordes.py` verificam a transição, os resultados e a persistência.

Há 16 outdoors nas laterais do circuito, alternando oito logos Auto-Pobre Racing e oito Old Stock Race. A Old Stock também aparece na abertura e nos para-lamas do #70. A textura foi preparada com imagegen a partir da pequena imagem enviada pelo usuário; [arquivo, procedência e prompt](pista_interlagos/teste/assets/branding/README.md). Os outdoors são cenografia do jogo.
