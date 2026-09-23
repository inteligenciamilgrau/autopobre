# Opala 99 — modelos editáveis (V4)

Estes dois arquivos Blender são a fonte do carro do jogo. Cada pintura é um arquivo separado e gera o seu GLB em `pista_interlagos/teste/assets/`.

| Pintura | Blender editável | GLB do jogo |
|---|---|---|
| Assinaturas / OMP | [opala99_assinaturas_omp.blend](opala99_assinaturas_omp.blend) | [opala99_assinaturas_omp.glb](../../pista_interlagos/teste/assets/opala99_assinaturas_omp.glb) |
| Seiva / Danilo Veículos | [opala99_seiva_danilo.blend](opala99_seiva_danilo.blend) | [opala99_seiva_danilo.glb](../../pista_interlagos/teste/assets/opala99_seiva_danilo.glb) |

Abra com o **Blender 5.1** ou mais recente (os arquivos foram salvos no 5.1.2). Não há outras dependências: as texturas de adesivos, capô, vidros e teto estão embutidas em cada `.blend`, sem bibliotecas vinculadas nem add-ons. Para extrair as imagens, use *File › External Data › Unpack Resources*.

As duas pinturas compartilham a mesma geometria. Uma alteração na carroceria, no interior ou nas rodas precisa ser feita nos dois arquivos.

## Organização da cena

- `01_Carroceria`: painéis, teto, capô e porta-malas.
- `02_Vidros_Redes_Interior`: vidros simplificados, redes, gaiola, banco, cintos e comandos.
- `03_Rodas_Freios`: pneus, rodas, discos e os quatro pivôs das rodas.
- `04_Farois_Lanternas_Detalhes`: faróis, lanternas, retrovisores e outros detalhes.
- `05_Pintura_Adesivos`: superfícies com UV e adesivos, além do número traseiro em malha.
- `06_Fechamentos_estruturais_V04`: assoalho, corta-fogo, anteparo traseiro e painéis internos que fecham a cabine.
- `90_Estudio_Cameras`: iluminação, piso e câmeras de apresentação; fica fora do GLB.

O objeto `OPALA_99_ROOT` reúne o veículo, e só ele e seus descendentes vão para o GLB. A frente aponta para **+X**, a altura para **+Z** e as unidades são metros; o exportador converte os eixos para o glTF. Use `Numpad 0` e `F12` para renderizar pela câmera de estúdio, ou ative `Camera_assoalho_V04` para ver a parte de baixo.

## Nomes usados pelo jogo

O código do jogo encontra peças pelo nome. Ao editar, mantenha:

| Nome | O que é | Uso no jogo |
|---|---|---|
| `Roda_Dianteira_E_PIVO`, `Roda_Dianteira_D_PIVO`, `Roda_Traseira_E_PIVO`, `Roda_Traseira_D_PIVO` | Empties no centro de cada roda, filhos de `OPALA_99_ROOT` | Giro das rodas (eixo Y do Blender) e esterço das dianteiras. Pneu, roda e disco de cada roda devem continuar filhos do seu pivô. |
| `Policarbonato_fume` | Material | Os vidros ficam translúcidos. |
| `Chapa_fechamento_V04` | Material | Estrutura que continua visível na câmera interna. As peças com esse material devem ser filhas diretas de `OPALA_99_ROOT` e não ter outro material, para virarem uma única malha no GLB. |
| `Pintura_preta`, `Faixa_amarela`, `Branco` | Materiais | Recoloridos nos carros adversários. |
| Materiais que começam com `Adesivo` | Materiais | Escondidos nos carros adversários. |

Os nomes das malhas podem mudar livremente: na exportação, elas são reagrupadas e renomeadas.

## Exportar para o jogo

Salve o `.blend` e, na raiz do projeto, rode:

```powershell
blender --background modelo_3d\v04_fechamentos\opala99_seiva_danilo.blend --python-exit-code 2 --python modelo_3d\scripts\exportar_glb_jogo.py
```

Troque o nome do arquivo para exportar a outra pintura. O script [exportar_glb_jogo.py](../scripts/exportar_glb_jogo.py) não altera o `.blend`. Ele copia `OPALA_99_ROOT`, junta as malhas por pivô e conjunto de materiais, grava `pista_interlagos/teste/assets/opala99_<pintura>.glb` com as imagens embutidas e reabre o arquivo para conferir os nomes da tabela acima. Se algo faltar, termina com código de erro 2. Para gravar em outro lugar, acrescente `-- caminho\arquivo.glb` ao fim do comando.

Depois de exportar:

1. Troque o sufixo `?v=04-fechamentos` em `pista_interlagos/teste/main.js` para que os navegadores não usem o GLB antigo guardado em cache.
2. Com o servidor local ligado, rode `pista_interlagos/scripts/verificar_fechamentos.py`, que confere piso, câmera interna, troca de pintura, rodas e retrovisor.

## O que a V4 trouxe

A V4 corrigiu os vãos que deixavam ver o chão pelo interior e pelas junções inferiores da carroceria. O assoalho acompanha o contorno inferior do carro, com recuos nas caixas de roda, e retornos o unem às soleiras. Capô, porta-malas, teto, colunas e revestimentos das caixas de roda receberam espessura para aparecerem também pelo lado de dentro.

O modelo é uma reconstrução visual a partir de fotos e imagens de referência, não um escaneamento nem uma réplica medida do carro real. A carroceria tem cerca de 4,60 m de comprimento, 1,74 m de largura e 1,41 m de altura. As versões anteriores (V1 a V3) e os scripts que geraram o modelo do zero ficam apenas na máquina original; a partir de agora, estes `.blend` são a fonte.
