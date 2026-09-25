# Músicas do Auto-Pobre Racing

Coloque seus arquivos MP3 nesta pasta, com estes nomes em minúsculas:

| Arquivo | Momento |
| --- | --- |
| `intro.mp3` | Abertura, até terminar a faixa ou entrar no jogo |
| `race.mp3` | Corrida, repetindo enquanto dirige |
| `patrocinio.mp3` | Patrocínio / vaquinha nos boxes, repetindo enquanto conversa |
| `turbo.mp3` | Vitória |
| `hojenaodeu.mp3` | Derrota / reboque |
| `energia.mp3` | Menus e alternativa quando faltar uma das outras faixas |

Recarregue o jogo após copiar ou substituir os arquivos. No teste local, a descoberta é automática. Para o site, inclua os MP3 no commit: o build do Pages copia os arquivos presentes e gera a lista automaticamente.

As músicas respeitam **Configurações → Áudio → Volume global / Música**. Os sons do carro e da pista usam **Efeitos**, com uma prévia ao ajustar o controle. Quando faltar uma faixa, o jogo toca `energia.mp3`; se ela também faltar, usa a composição sintetizada original.

Os arquivos do jogo podem ser otimizados para 128 kbps estéreo. Os originais preservados ficam em `audios_originais/`, na raiz do projeto, fora do Git e da publicação.

## Efeitos gravados

`car_trying_to_start.mp3` é o motor de partida girando (o carro tentando pegar), tocado em loop no modo história enquanto o PART (partida) está apertado; ele desacelera conforme a bateria arria. Faz parte da publicação (`ASSETS` em `scripts/publicacao.py`). Sem ele, o jogo usa o som sintetizado.

Não é necessário editar JavaScript nem criar `tracks.json` manualmente para as músicas. Esta documentação não entra na publicação.
