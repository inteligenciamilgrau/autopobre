# Correção da orientação dos textos — vista superior

Ferramenta: image_gen integrada.

Alvo: 05_topo.png. Versão anterior preservada em rascunhos/05_topo_antes_rotacao_textos.png.

Conferência visual: textos do capô e para-brisa invertidos em relação ao observador da imagem com a frente para cima; mantidas orientação do número do teto e do logotipo RTJ do porta-malas.

## Prompt

Use case: precise-object-edit. Input image is the EXACT edit target. Correct ONLY the orientation of the existing FRONT-FACING DECALS on this overhead Opala race car image. Keep the CAR itself exactly as is: FRONT points to TOP of canvas, rear to BOTTOM. Do NOT rotate the whole image, car, body panels, windows or camera.
Physically these front-facing decals must be readable by a person standing IN FRONT OF THE CAR, i.e. at the TOP edge of this image looking downward toward the windshield. Therefore all the following existing graphic groups must be rotated EXACTLY 180 DEGREES IN THEIR OWN LOCATIONS, so they look UPSIDE DOWN to the viewer of this image:
1. Silver outlined geometric logo with yellow lightning on frontmost hood edge near canvas top: rotate complete logo group 180° around its own center.
2. Central yellow hood sponsor group: car-outline symbol + "DANILO" + "VEÍCULOS". Rotate the ENTIRE group rigidly 180° around its own center. In output, upside-down VEÍCULOS row is spatially above upside-down DANILO row, and upside-down car-outline icon is spatially BELOW both near windshield. Same central hood position and footprint.
3. Small blue angular hood logo on viewer LEFT: rotate 180° in place.
4. Hood logo on viewer RIGHT, blue/white emblem plus "NIPO IMPORT": rotate whole group 180° in place. Do not swap the left/right hood sponsors.
5. Windshield "invent" + small "software" banner graphic: rotate these printed graphics together 180° in their existing banner location. The banner glass shape remains unchanged. In output tiny upside-down software appears spatially ABOVE upside-down invent. Keep red/yellow V exact.
6. Windshield small "EDU / STEVAN" plus outlined "99" group on viewer RIGHT of windshield: rotate entire group 180° around its own center, keeping the group on viewer RIGHT inside the windshield. In output the rotated outlined 99 appears above the upside-down EDU / STEVAN lettering. An inverted 99 naturally LOOKS LIKE 66 to the current viewer; this is CORRECT, do not replace the digits with new upright 99. It must read 99 only when viewer rotates image 180°.
CRITICAL: UPSIDE DOWN rotation, NOT mirrored letters. Do NOT make the front texts upright for this overhead viewer. A person turning the resulting entire image upside down must then read ALL hood/windshield decals normally.
PRESERVE WITHOUT ANY CHANGE: large SIDEWAYS white 99 on the roof and its orientation; rear RTJ and CORRETORA DE SEGUROS graphic and their current upright orientation at bottom; rear window D, window vents, yellow body stripes, side decals, mirrors, fasteners, light/shadow, background, car dimensions, tire positions, image resolution 1024x1536. Preserve exact font styling, spelling, colors and scale of each front decal, only rotate their graphics. No added text, no redesign or new view.

