# Asfalto do teste de Interlagos

Arquivo: `asfalto_base_v1.png`. Criado em 13/09/2026 com a ferramenta nativa `image_gen`, sem CLI/API externa. O original gerado foi copiado para esta pasta e incorporado ao teste local. É uma textura artística de asfalto, não uma fotografia ou medição do pavimento de Interlagos.

Aplicação: `../../track-surface.js`. Cada repetição principal ocupa 2,4 m; uma segunda amostragem rotacionada reduz a repetição perceptível. Mipmaps e filtragem anisotrópica preservam a leitura em ângulos rasantes. O material tem rugosidade alta e relevo visual de 2,5 mm. Variações maiores de cor, juntas e borracha seguem as coordenadas da pista; os detalhes ficam fixos no solo enquanto o carro passa.

As marcas nas zonas de frenagem são decorativas. A atualização é aplicada pelo navegador sobre o GLB carregado; o arquivo Blender e a superfície de colisão mantêm os dados existentes. Nenhuma instalação ou acesso externo é necessário para carregar a textura no jogo.

## Prompt integral

Create a production game PBR base-color texture of dry, worn motorsport circuit asphalt. Square 2048x2048, strictly orthographic overhead surface scan, covers a 4 meter by 4 meter patch of dense fine asphalt. Seamlessly tileable on both axes with matching edge colors and grain, homogeneous medium-dark neutral charcoal gray, small dense crushed stone aggregate flecks only 2-7mm, subtle varied bitumen grain and gentle irregular worn areas, very slight horizontal rolling streaks. Physically plausible dry race track asphalt seen under neutral diffuse overcast light, flat albedo without baked directional shadows, AO, reflections or perspective. No lane markings, no painted lines, no cars, no typography, no logos, no large cracks, no potholes, no pebbles bigger than 7mm, no dominant landmarks or conspicuous spots that reveal repetition. Fine sharp natural detail, restrained contrast, not wet, not gravel. Fill entire image edge to edge with asphalt. This is a repeatable texture to apply on an existing 3D Interlagos game race track, not a scene illustration.
