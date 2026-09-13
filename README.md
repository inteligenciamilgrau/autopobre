# Auto-Pobre Racing com Stevan Gaipo

Jogo de corrida para navegador com Opala 99 em Interlagos, duas pinturas e versão imersiva opcional. A abertura ilustrada aparece nos dois modos.

Na primeira visita, a versão imersiva vem selecionada. Depois, o jogo lembra a última escolha de modo, pintura e câmera, inclusive alterações feitas pelos botões e atalhos durante a sessão. Volume e silêncio também são lembrados. As preferências ficam neste navegador, por endereço do site; limpar os dados do site restaura os padrões. O menu continua aparecendo antes de iniciar a sessão.

O celular funciona na horizontal, com direção, acelerador, freio, ré e freio de mão por toque simultâneo. Os botões de câmera, pintura, resgate e configurações ficam na tela; as conversas aceitam toque direto. Ao girar para a vertical, a partida pausa e pede para virar o aparelho. A resolução e as sombras são reduzidas automaticamente em dispositivos de toque.

O pódio vem antes da vistoria, com o primeiro no centro e os pares à esquerda. Levar o carro ao box antes da revisão mostra por seis segundos a cena “Desclassificado. Mas a foto no pódio fica pra história”, depois recomeça a vaquinha. Apenas o prêmio dessa corrida é retirado; o saldo anterior e a sobra ficam guardados.

## Preparar e publicar

**Configurações** abre uma tela com Corrida, Áudio e Controles. Volume global, música e efeitos são independentes e ficam salvos. O controle de efeitos toca uma prévia. A música começa depois da primeira interação, muda conforme a cena e silencia ao sair da aba.

As faixas ficam em [`pista_interlagos/teste/assets/audio/`](pista_interlagos/teste/assets/audio/README.md): `intro.mp3` na abertura, `patrocinio.mp3` na vaquinha, `race.mp3` na corrida, `turbo.mp3` na vitória e `hojenaodeu.mp3` na derrota. `energia.mp3` toca nos menus e substitui qualquer faixa ausente. Se também faltar, há cinco composições originais sintetizadas no navegador. O build descobre e copia somente os nomes permitidos. As cópias otimizadas usam 128 kbps estéreo; `audios_originais/` preserva os originais fora da publicação e do Git.

Os dois modos têm cinco adversários, contato entre carrocerias com reação à velocidade e ao ângulo da batida, e fragmentos que saltam e caem na pista. No modo imersivo, a vaquinha acontece a pé nos boxes, com câmera atrás do piloto e carros estacionados. Clique no torcedor para se aproximar e conversar; clique na fala para enviá-la, com o balão junto da pessoa. W/S anda, A/D gira o piloto, e braços e pernas alternam. Na compra de gasolina, a câmera já fica atrás do Opala com os adversários aquecendo os motores à frente. Partida, torcida, impactos, vidro, combustível, reboque, juiz e resultados têm efeitos próprios; motor, pneus e marchas continuam acompanhando a condução.

Quem ainda não contribuiu tem um `$` sobre a cabeça. Ao receber a doação, o diálogo fecha e o piloto fica livre para procurar outra pessoa. A sobra da vaquinha é transferida ao saldo acumulado no resultado, inclusive em derrota ou desclassificação. O medidor de combustível mostra litros e reserva nos dois modos; no modo normal, R reposiciona e reabastece. O minimapa mostra o 99 e os cinco adversários, que têm ritmo mais forte e procuram espaço para ultrapassar.

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
