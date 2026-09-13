# Auto-Pobre Racing com Stevan Gaipo

Jogo de corrida para navegador com Opala 99 em Interlagos, duas pinturas e versão imersiva opcional. A abertura ilustrada aparece nos dois modos.

Na primeira visita, a versão imersiva vem selecionada. Depois, o jogo lembra a última escolha de modo, pintura e câmera, inclusive alterações feitas pelos botões e atalhos durante a sessão. Volume e silêncio também são lembrados. As preferências ficam neste navegador, por endereço do site; limpar os dados do site restaura os padrões. O menu continua aparecendo antes de iniciar a sessão.

## Preparar e publicar

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
