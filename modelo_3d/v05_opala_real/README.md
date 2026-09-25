# Opala 99 — modelos editáveis (V5)

> A fonte atual do carro é a [V6 com as peças separadas](../v06_pecas_separadas/README.md) (portas, capô, porta-malas, motor e o interior do jogo), gerada a partir destes arquivos pelo script `construir_opala_v06.py`. Desde 25/09/2026 o jogo usa os GLBs da V6. Exportar esta V5 com o comando abaixo, sem caminho de saída, substituiria os GLBs do jogo pela versão antiga.

Estes dois arquivos Blender são a fonte do carro do jogo. Cada pintura é um arquivo separado e gera o seu GLB em `pista_interlagos/teste/assets/`.

| Pintura | Blender editável | GLB do jogo |
|---|---|---|
| Assinaturas / OMP | [opala99_assinaturas_omp.blend](opala99_assinaturas_omp.blend) | [opala99_assinaturas_omp.glb](../../pista_interlagos/teste/assets/opala99_assinaturas_omp.glb) |
| Seiva / Danilo Veículos | [opala99_seiva_danilo.blend](opala99_seiva_danilo.blend) | [opala99_seiva_danilo.glb](../../pista_interlagos/teste/assets/opala99_seiva_danilo.glb) |

Abra com o **Blender 5.1** ou mais recente (os arquivos foram gerados no 5.2.2). As texturas de adesivos, capô, vidros e teto estão embutidas em cada `.blend`, sem bibliotecas vinculadas nem add-ons. Para extrair as imagens, use *File › External Data › Unpack Resources*.

As duas pinturas compartilham a mesma geometria. Uma alteração na carroceria, no interior ou nas rodas precisa ser feita nos dois arquivos.

## O que a V5 trouxe

A V5 aproxima o carro das medidas de um Opala cupê de verdade. O ponto de partida são as especificações do Opala cupê 1979 (2.667 mm de entre-eixos, 1.758 mm de largura, 1.359 mm de altura, bitolas de 1.410 mm e 4.671 mm de comprimento com para-choques) e a foto lateral [carro_5_lateral_completa_longe.jpg](../../carro/carro_5_lateral_completa_longe.jpg), medida com a escala dos dois centros de roda. Os aros de 17" da foto dão a mesma escala.

| Medida | V4 | V5 | Carro real (foto) |
|---|---|---|---|
| Altura do teto | 1,42 m | 1,31 m | cerca de 1,31 m |
| Balanço traseiro (eixo à traseira) | 0,95 m | 1,08 m | cerca de 1,09 m |
| Comprimento total | 4,40 m | 4,51 m | cerca de 4,50 m sem para-choques |
| Linha de cintura no eixo dianteiro | 0,86 m | 0,83 m | cerca de 0,79 m |

- **Silhueta:** o teto plano deu lugar ao arco contínuo do Opala cupê, que desce até a traseira (semi-fastback). A tampa do porta-malas ficou inclinada e a traseira 13 cm mais longa. A frente baixou cerca de 4 cm.
- **Capô:** vinco central elevado entre dois frisos e ponta que desce até a grade. A faixa "eletric" fica nessa rampa, com 0,74 m de largura e a proporção original do logotipo (na V4 estava esticada cerca de 2,5 vezes).
- **Capô da pintura OMP:** refeito com o layout atual do carro (foto [carro_23_capo_omp_melhor.JPG](../../carro/carro_23_capo_omp_melhor.JPG) e [versoes_finais/assinaturas_omp](../../geracoes_carro/versoes_finais/assinaturas_omp/)): RDO DO ÓLEO com o escudo, OMP entre duas barras e "nextlane" (next branco, lane amarelo). A textura `capo_omp_v05.png` é desenhada pelo script com fontes do Windows (Arial Black e Century Gothic Bold).
- **Faróis:** redondos de 7", com aro cromado e lente em degraus, recolhidos na moldura (os da V4 eram ovais).
- **Traseira:** painel novo com a faixa das lanternas e a saia inferior arredondada, sem para-choque, como no carro de corrida. As lanternas e o número foram assentados no painel, e o assoalho não aparece mais por baixo.
- **Redes das janelas:** uma rede por porta, com 6 tiras verticais e 4 horizontais de 40 mm, deixando aberto o triângulo junto à coluna A, como nas fotos. A V4 tinha 9 × 5 tiras de cerca de 15 mm. A rede interna do cockpit ([cockpit.js](../../pista_interlagos/teste/cockpit.js)) seguiu a mesma contagem.

Rodas, pivôs, bitola e entre-eixos não mudaram, porque a física do jogo ([physics.js](../../pista_interlagos/teste/physics.js)) usa essas posições. Os arcos das rodas dianteiras desceram cerca de 2 cm com a frente, e a folga até o pneu ficou menor.

## Como a V5 foi gerada

O script [remodelar_opala_v05.py](../scripts/remodelar_opala_v05.py) parte dos `.blend` da [V4](../v04_fechamentos/README.md) e grava os desta pasta:

```powershell
blender --background modelo_3d\v04_fechamentos\opala99_assinaturas_omp.blend --python-exit-code 2 --python modelo_3d\scripts\remodelar_opala_v05.py
blender --background modelo_3d\v04_fechamentos\opala99_seiva_danilo.blend --python-exit-code 2 --python modelo_3d\scripts\remodelar_opala_v05.py
```

O script aplica às peças da V4 um campo de deformação suave: carroceria, vidros, gaiola, adesivos e fechamentos continuam alinhados entre si. Peças que não podem esticar, como lanternas, retrovisores, pinos do capô e banco, só mudam de lugar. Depois ele refaz os faróis, o painel traseiro, as redes, o "eletric" e, na pintura OMP, o capô. As medidas usadas ficam no início do script.

Editar diretamente estes `.blend` continua valendo. O script só é necessário para refazer a V5 a partir da V4 (por exemplo, com outras medidas); nesse caso ele sobrescreve os arquivos desta pasta.

## Organização da cena

- `01_Carroceria`: painéis, teto, capô, porta-malas e painel traseiro.
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
blender --background modelo_3d\v05_opala_real\opala99_seiva_danilo.blend --python-exit-code 2 --python modelo_3d\scripts\exportar_glb_jogo.py
```

Troque o nome do arquivo para exportar a outra pintura. O script [exportar_glb_jogo.py](../scripts/exportar_glb_jogo.py) não altera o `.blend`. Ele copia `OPALA_99_ROOT`, junta as malhas por pivô e conjunto de materiais, grava `pista_interlagos/teste/assets/opala99_<pintura>.glb` com as imagens embutidas e reabre o arquivo para conferir os nomes da tabela acima. Se algo faltar, termina com código de erro 2. Para gravar em outro lugar, acrescente `-- caminho\arquivo.glb` ao fim do comando.

Depois de exportar:

1. Troque o sufixo `?v=05-opala-real` em `pista_interlagos/teste/main.js` para que os navegadores não usem o GLB antigo guardado em cache.
2. Com o servidor local ligado, rode `pista_interlagos/scripts/verificar_fechamentos.py`, que confere piso, câmera interna, troca de pintura, rodas e retrovisor.

O modelo continua sendo uma reconstrução visual a partir de fotos e imagens de referência, e não um escaneamento. As medidas principais batem com a foto lateral dentro de poucos centímetros; detalhes menores (frisos, logotipos, forma da coluna C) são aproximados.
