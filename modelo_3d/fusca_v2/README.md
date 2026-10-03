# Fusca v2 (VW Type 1, ~1967–72), modelado a partir de medidas reais

O v2 foi refeito do zero, sem partir de nenhum modelo pronto. É o Fusca do jogo desde 03/10/2026 (veja **No jogo**, abaixo).

## Arquivos

| Arquivo | O que é |
|---|---|
| `fusca_v2.blend` | Cena completa (carro + pista + cenário + câmera + luzes), pronta para renderizar (só nesta máquina, fora do git) |
| `fusca_v2_carro.blend` | Só o carro, sem cenário (só nesta máquina, fora do git) |
| `renders/fusca_v2_foto.jpg` | Render principal (enquadramento da foto de referência), 1920×1080 |
| `renders/fusca_v2_*.jpg` | Outros ângulos: `f34`, `t34`, `lado`, `frente`, `baixo`, `det_frente` |
| `criar_fusca_v2.py` | Script que constrói tudo (Blender 5.2, Python) |
| `medidas_fusca.py` | Tabelas de medidas extraídas do desenho técnico |
| `verificar_medidas.py` | Compara o modelo com as medidas e imprime o erro |

Para regerar (as renders saem em PNG, `renders/<vista>_final.png`): `blender --background --python criar_fusca_v2.py -- --render final --vista foto`
(vistas: `foto`, `f34`, `fd34`, `t34`, `td34`, `lado`, `frente`, `baixo`, `det_frente`, `det_roda`, `det_cabine`, `det_tras`;
`--sem-cenario` grava só o carro; `--amostras N` muda a qualidade).

## De onde vêm as medidas

- **Desenho técnico ortogonal do Type 1** (lateral, planta, frontal e traseira, com cotas), da página de
  [dimensions.com](https://www.dimensions.com/element/volkswagen-beetle-type-1). A licença dos desenhos não é informada, então
  **o SVG não está incluído neste projeto**: só as medidas numéricas extraídas dele (`medidas_fusca.py`). O desenho foi
  calibrado com as cotas do próprio desenho (entre-eixos 2,40 m, largura 1,54 m, comprimento 4,08 m).
- Especificações oficiais para conferência: [Wikipedia](https://en.wikipedia.org/wiki/Volkswagen_Beetle) (comprimento 4,079–4,140 m,
  largura 1,539–1,585 m, altura 1,50 m, entre-eixos 2,40 m), [CarsGuide](https://www.carsguide.com.au/volkswagen/beetle/car-dimensions/1970)
  e [ConceptCarz](https://www.conceptcarz.com/s17036/volkswagen-beetle.aspx).
- **Foto de referência** (`fusca.png`, em `Projetos_iA/estilos_3d`): usada para o desenho dos detalhes (para-choque de lâmina dupla com garras de
  borracha, tira cromada e puxador em gancho no capô, faróis em nicho, calotas, roda com fendas, setas na crista do paralama).

### Modelos 3D prontos que foram avaliados e **não** usados
O único Fusca 3D que apareceu em repositório aberto ([victorsodre/fusquinha](https://github.com/victorsodre/fusquinha)) vem do
BlenderKit (Rodrigo Marini), cuja licença restringe a redistribuição em formato extraível, e o repositório não declara licença.
Por isso o modelo é original: construído só a partir de medidas.

## Como o corpo é construído

Cada seção transversal da carroceria (300 seções ao longo do carro) é a **união suave de primitivas**:
uma base (soleira e portas), uma "espinha" (capô → cabine → tampa do motor, com o topo igual ao perfil lateral medido),
bojos dos para-lamas dianteiros e traseiros (com as cristas medidas), uma nervura no capô e uma cúpula elíptica no teto. O
contorno é recortado pela largura máxima medida (planta) e pelo topo medido (lateral). Depois: casca oca de 20 mm, arcos de roda
cortados com a curva medida, janelas cortadas com os contornos medidos e vidros copiados das próprias faces da carroceria
(encaixam sem folga). Os detalhes (juntas, molduras, maçanetas, faróis...) são projetados na superfície com BVH.

## Fidelidade (rodar `verificar_medidas.py`)

| Comparação com o desenho | Erro médio | Erro máximo |
|---|---|---|
| Perfil lateral (topo) | 3 mm | 8 mm |
| Largura em planta (para-lamas) | 7 mm | 17 mm |
| Envelope frontal, para-lamas | 4 mm | 6 mm |
| Envelope frontal, cabine | 10 mm | 37 mm |

Carroceria: 3,725 m × 1,548 m × 1,535 m (com os para-choques chega a ~4,08 m). Rodas 5.60-15 (pneu de 0,67 m de diâmetro).

## Limitações honestas

- É um modelo **procedural**, não uma varredura 3D: entre as vistas medidas (silhuetas), as superfícies são interpoladas.
  O erro mais alto (37 mm) está numa quina do teto.
- A cor é uma aproximação do azul da foto; o piloto, a arquibancada, o skyline e a pista são simplificados.
- Detalhes finos ainda ausentes: lettering do pneu, buzinas atrás das grelhas, mecânica sob o carro.

## No jogo

Copiado de `Projetos_iA/estilos_3d/v2` em 03/10/2026. Entrou no lugar do Fusca V3, que adaptava o modelo do BlenderKit de
Rodrigo Marini: os [Termos do Blendkit](https://www.blendkit.com/terms-and-conditions-2021/) exigem que o modelo vá no jogo
"in such a format that it cannot be opened or separated by a third party", e um GLB que qualquer um baixa não cumpre isso. O V3
saiu do repositório e do jogo; o original continua em `Projetos_iA/estilos_3d/v3`.

`modelo_3d/scripts/exportar_fusca_jogo.py` gera `pista_interlagos/teste/assets/fusca_v2.glb` construindo o carro de novo com
as funções deste `criar_fusca_v2.py` (não abre nem altera os `.blend`). Da raiz do projeto:

```powershell
blender --background --factory-startup --python-exit-code 2 --python modelo_3d/scripts/exportar_fusca_jogo.py
```

- Resolução de jogo: 170 × 112 seções na carroceria (o estúdio usa 300 × 192), peças torneadas com até 36 segmentos,
  frisos mais simples. Cerca de 146 mil triângulos e 2,7 MB, sem texturas.
- Referencial do Opala: frente +X, esquerda −Z, pneus em y = 0; o entre-eixos de 2,40 m centrado no do Opala
  (eixos em x +1,417 e −0,983). Quatro pivôs `Roda_*_PIVO`, pintura `Pintura_fusca`, painel `Fusca_painel`, lanterna
  `Lanterna_fusca` (luz de freio), vidros `Vidro_fusca` e o volante `Volante_Fusca` (escondido: o piloto do jogo traz o dele).
- Diferenças do modelo de estúdio: o painel vai até a base do para-brisa, com a face pintada na cor da equipe e um
  velocímetro (a caixa original deixava ver o porta-malas vazio pela câmera interna); o para-brisa e o vidro traseiro são
  recortados de novo por inteiro (o recorte original deixava 40% do vidro traseiro fechado atrás do vidro, e o exportador
  confere todas as janelas); placa amarela; faróis e setas apagados de dia; sem o piloto do `.blend`.
- No Modo Corrida, a aba Fusca da tela de carros põe o grid inteiro de Fusca, cada um nas cores e com o número do seu carro
  (`pista_interlagos/teste/fusca.js`, `immersive-visuals.js` `fuscaRival`), com a mecânica do Opala. Validação no
  navegador: `pista_interlagos/scripts/verificar_fusca.py`.
