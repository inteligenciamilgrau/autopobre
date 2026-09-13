# Revisão para publicação — 13/09/2026

## Resultado

O jogo foi preparado para hospedagem estática a partir de `dist/`. A inspeção dos arquivos selecionados para Git e do pacote público não encontrou caminhos absolutos de máquina nem candidatos a credenciais pelos padrões examinados. A consulta ao registro oficial do npm para o lock atual, com Three.js 0.183.2, retornou zero vulnerabilidades conhecidas nas dependências em 13/09/2026. Isso não equivale a uma garantia de ausência de falhas.

## Achados e correções

| Achado | Correção |
|---|---|
| O servidor de teste oferecia a raiz do trabalho e listava diretórios. Seu bind era local, mas publicar essa árvore exporia originais, scripts, caches e futuras configurações privadas. | Lista explícita de arquivos públicos, listagem desativada, validação de caminho resolvido, recusa a links simbólicos/junctions e host inesperado. Continua restrito a `127.0.0.1`. Os processos antigos foram substituídos; a porta 8799 já usa o servidor corrigido. |
| Caminhos absolutos no lançador, testes e registros de trabalho. | Lançador usa PATH ou `INTERLAGOS_PYTHON`; testes descobrem o navegador pelo ambiente. Originais e registros de geração ficam fora do Git/site. |
| A foto do capacete carregava EXIF/XMP. | `capacete_publico.jpg` remove metadados EXIF/XMP/IPTC e comentários sem recodificar a imagem. Igualdade dos pixels decodificados conferida. O original é mantido somente localmente. |
| O nome da pintura era interpolado no caminho do modelo. | Validação explícita dos dois identificadores antes de qualquer carregamento. Não havia entrada remota ou formulário livre usando esse valor. |
| O progresso salvo aceitava tipos e números não finitos. | Campos do perfil são validados e limitados; dados inválidos voltam a valores seguros. Não foi identificada entrada remota nesse fluxo. |
| A aplicação não declarava política de carregamento de scripts. | CSP permite scripts locais e o hash exato do import map, bloqueia scripts inline/eventos e eval, restringe conexões e nega objetos/base/formulários. Cabeçalhos incluem `nosniff`, política de referência, restrições de permissões e anti-enquadramento. Estilos inline continuam permitidos para a interface dinâmica. |
| O link de ajuda apontava para documentação interna. | Página pública `sobre.html` com informações do jogo e fontes; links externos usam `noopener noreferrer`. |

As montagens de `innerHTML` examinadas usam textos internos do jogo e campos numéricos tratados. Não foram encontrados carregamento de código a partir de query string, execução de shell pela aplicação web, backend de autenticação, uploads, pagamentos ou envio de telemetria. Os modelos GLB publicados incorporam os recursos e não contêm caminhos locais ou URIs externas de imagens/buffers.

## Verificação realizada

- `npm audit --omit=dev --ignore-scripts --json`: zero avisos de vulnerabilidade conhecidos. A primeira consulta falhou por restrição de rede; a consulta concluída ao registro oficial retornou o resultado informado.
- `verificar_seguranca.py`: acessos a `.env`, `.git`, scripts, fontes internas, diretórios, caminhos com `..` e codificação percentual recusados; host e fetch de origem inadequada recusados; cabeçalhos presentes.
- Teste real no navegador: jogo local e pacote publicado em subdiretório, abertura, câmera interna, segunda pintura, início imersivo e retorno à sessão livre. Sem erros inesperados ou pedidos a serviços externos nos fluxos exercitados.
- Injeção proposital de script inline bloqueada pela CSP. Perfil corrompido sanitizado. Os testes usam avaliação pelo DevTools; a CSP da página permanece ativa.
- Regressão das regras imersivas aprovada após a alteração do perfil salvo.
- Regras do `.gitignore` verificadas com o próprio Git em um repositório temporário isolado: arquivos privados/dependências ignorados; lock, texturas públicas e pista preservados.
- Textos versionáveis e pacote público inspecionados por padrões; metadados das imagens e JSON interno dos três GLB conferidos.

Relatórios detalhados e captura da versão publicada ficam em `.audit-local/`, fora do Git. O manifesto do pacote lista tamanho e SHA-256 de cada arquivo. O build recusa arquivos inesperados já presentes em `dist/` e não os apaga silenciosamente.

## Publicar

Siga os comandos do [README](README.md). Envie somente `dist/`; não a raiz do trabalho. Configure HTTPS e os cabeçalhos de `dist/_headers` na hospedagem. O servidor Python é uma prévia local, não um servidor de produção; essa limitação consta na [documentação oficial do Python](https://docs.python.org/3/library/http.server.html).

A CSP também é incorporada no HTML como proteção de base. `frame-ancestors` precisa ser entregue por cabeçalho HTTP; consulte a [referência da CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy). `_headers` depende de suporte do provedor e deve ser traduzido para a configuração equivalente quando necessário.

A revisão foi realizada antes do primeiro envio ao repositório. Não havia `.git` na raiz naquele momento, portanto não existia histórico local para examinar. Publicar o código no GitHub não ativa uma hospedagem do jogo. `.gitignore` não apaga segredos já commitados em outro histórico; veja a [documentação do Git](https://git-scm.com/docs/gitignore). A auditoria de dependências cobre avisos conhecidos do registro, conforme a [documentação do npm](https://docs.npmjs.com/cli/audit/).

O dinheiro e os resultados são de um jogo local e podem ser alterados no próprio navegador. Um futuro ranking competitivo ou pagamentos exigiriam validação no servidor. A configuração efetiva de DNS, TLS, cabeçalhos e permissões da hospedagem ainda deve ser conferida após escolher o provedor.
