# Recriações do Opala 99 — versão 01

Cinco imagens geradas com image_gen integrada a partir das fotos da pasta `carro`. As fotos originais não foram alteradas.

## Arquivos finais

- `01_lateral_motorista.png`: lateral esquerda, frente apontando para a esquerda; nomes dos apoiadores e LAIS TE AMO com três corações.
- `02_lateral_passageiro.png`: lateral direita, frente apontando para a direita; lista própria de apoiadores, DINIZ PNEUS e dois bocais no vidro lateral traseiro.
- `03_frente.png`: frente; versão revisada com a marca sgarbi no banco.
- `04_traseira.png`: traseira; quatro lanternas circulares, 99 deslocado e RTJ.
- `05_topo.png`: vista superior, frente para cima; textos e logotipos do capô e para-brisa girados 180°, legíveis para quem olha a partir da frente do carro. O 99 pequeno do para-brisa aparece invertido nesta orientação; teto e porta-malas mantêm suas orientações anteriores.

`rascunhos/` guarda as primeiras gerações da frente e do topo. `PROMPTS.md` contém os prompts completos e as referências usadas em cada chamada.

A correção de orientação solicitada pelo usuário foi feita com image_gen integrada e está documentada em `PROMPT_CORRECAO_ORIENTACAO_TOPO.md`. A versão anterior está em `rascunhos/05_topo_antes_rotacao_textos.png`. Esta vista superior é compartilhada pelas versões com e sem assinaturas.

## Critério de reconstrução

As fotos mostram fases diferentes da pintura. As duas fotos de alta resolução `carro_21_...` foram priorizadas para as portas com nomes. As fotos de pista foram usadas para completar a carroceria, rodas, frente, traseira e demais adesivos. Isso combina informações de momentos distintos; não há foto de todos os ângulos da versão com nomes.

As laterais foram geradas separadamente para preservar diferenças entre motorista e passageiro. Fundo claro e iluminação de estúdio ajudam a examinar silhueta, pintura e proporções.

## Conferência visual e limites

- Confirmados visualmente nas gerações: carro preto com faixa amarela, número 99, carroceria cupê, listas distintas nas portas, três corações na porta do motorista, dois bocais no lado do passageiro, dois faróis dianteiros e quatro lanternas traseiras.
- Corrigidos: marca inventada do banco na primeira frente; texto e número pequenos deslocados para o teto na primeira vista superior; aberturas e marcas duplicadas no capô da primeira vista superior.
- Os nomes manuscritos e pequenos adesivos têm aproximações de traçado, espaçamento e grafia. Alguns nomes nas transcrições são incertos; conferir cada nome na fotografia original antes de produzir decalques finais. Não considerar esta lista textual uma transcrição certificada.
- Os logotipos menores do capô, o emblema geométrico da frente e adesivos do vidro são aproximações visuais. Há diferenças residuais entre os pequenos logos do capô da frente e do topo; as fotos originais prevalecem.
- O topo é uma reconstrução parcial: não existe fotografia vertical completa. Comprimentos dos painéis, curvaturas, posicionamento e orientação exatos de adesivos devem ser validados com novas fotos ou medidas.
- A lateral traseira do passageiro está parcialmente oculta nas referências. A combinação invent/99 e o monograma RR foi completada por inferência a partir do restante do carro.
- Frente e traseira ainda têm elevação de câmera, com capô/porta-malas visíveis. As vistas não são plantas ortográficas calibradas, nem compartilham escala física ou enquadramento idênticos.
- São imagens raster com fundo claro, não sprites transparentes, malhas 3D, mapas UV ou texturas finais. Servem à revisão visual e ao bloqueio inicial de formas. Para fidelidade exata no jogo, reconstruir os decalques a partir das fotos originais e aplicar separadamente ao modelo.

## Próxima etapa

Validar a aparência e a grafia dos nomes; depois definir escala, alinhar as vistas e preparar os assets 2D/3D conforme o estilo e a engine escolhidos.
