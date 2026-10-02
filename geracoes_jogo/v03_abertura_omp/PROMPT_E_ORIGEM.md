# Abertura — banco OMP

Correção em 02/10/2026 com a ferramenta integrada `image_gen`, sem API/CLI.

- Origem: `../v01_abertura/abertura_stevan_opala99.png`, preservada como referência histórica.
- Final: `abertura_stevan_opala99_omp.png`, 1672 × 941. Somente a região da inscrição do banco foi incorporada da edição gerada, com transição suave nas bordas; todos os pixels fora dessa região são os da arte original.
- Produção: `../../pista_interlagos/teste/assets/abertura/abertura_stevan_opala99.jpg`, mesma resolução, comprimida com ffmpeg em JPEG (`mjpeg`, `-q:v 6`, `yuvj420p`, metadados removidos). Arquivo reduzido de 402.061 para 255.071 bytes (36,6% menor); OMP conferido visualmente.
- Inscrição conferida: **OMP** no banco visível pelo para-brisa.

## Compressão para a versão online

Em 02/10/2026, recompressão a partir do PNG final para preservar o original sem perda. Executar na raiz do projeto, com ffmpeg no PATH:

```sh
ffmpeg -hide_banner -loglevel error -nostdin -y -i geracoes_jogo/v03_abertura_omp/abertura_stevan_opala99_omp.png -frames:v 1 -map_metadata -1 -c:v mjpeg -q:v 6 -pix_fmt yuvj420p pista_interlagos/teste/assets/abertura/abertura_stevan_opala99.jpg
```

As referências da imagem e dos estilos usam `20261002-omp-q6` para invalidar o cache. O build em `dist/` foi regenerado; o hash da cópia publicada foi conferido contra o asset do jogo.

## Prompt final

Use case: text-localization. Edit target: the supplied opening key art for Auto-Pobre Racing with Stevan and the black/yellow Opala 99. Replace ONLY the small incorrect inscription "sparbi" / "SPARBI" on the BLACK RACING SEAT visible THROUGH THE WINDSHIELD, around x=990, y=415 in the 1672x941 input. It must read exactly "OMP" (uppercase O, M, P), a small white/light gray embroidered OMP racing-seat wordmark in the very same place, matching the perspective, scale, muted brightness and darkness seen behind the windshield glass. Remove all old letters fully. Do not change any other text or logo. Preserve the entire original image, including Stevan face, suit, helmet, the entire car, all decals, sponsor writing, number 99, seat shape, windshield reflections, wipers, background, supporters, colors, light, original camera framing and 1672x941 canvas/aspect ratio. This is a surgical single inscription correction, not a reimagining.
