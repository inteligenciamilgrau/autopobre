"""Bater uma foto: fotografa o interior do Opala 99 nas poses das fotos de referência (carro/*.JPG).

Cada pose fixa o olho da câmera interna em coordenadas locais do cockpit (+X frente, +Y cima,
-Z lado do piloto), a guinada (yaw, positivo vira para o carona), a inclinação (pitch), o campo
de visão vertical em graus e, se preciso, o giro (roll), pelo gancho interlagos.setCockpitView.
O carro fica parado (freio segurado) na largada da corrida livre. Duas fotos extras mostram o jogo:
jogo_frente.png (vista padrão) e jogo_olhando_tras.png (segurando B).

Uso, a partir da raiz do repositório, com o servidor local rodando:
  python pista_interlagos/scripts/servidor.py 8799 --no-browser
  python pista_interlagos/scripts/fotografar_interior.py [--port 8799] [--only painel,tras] [--hud]
Saída: pista_interlagos/renders/interior/<nome>.png (1400x788, o formato das referências).
"""
import argparse
import math
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from browser_config import browser_executable, browser_args, wait_js, open_menu, race_options, enter_track, wait_race_start

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'renders/interior'
SIZE = {'width': 1400, 'height': 788}
PI = math.pi

# Nome -> pose, com a foto de referência que ela imita. eye = olho em coordenadas locais do
# cockpit; None = olho padrão do jogo (-.25, 1.08, .015; -.39 no interior clássico). Na carroceria V06 o
# cockpit desce 9,3 cm e o olho das poses desce junto. roll (opcional) gira a imagem: positivo
# inclina o topo da câmera para a esquerda. As referências têm uma selfie no canto superior
# esquerdo: ignore-a ao comparar. Poses ajustadas pelo enquadramento (mesmas coisas no mesmo
# lugar da foto); a lente das fotos é mais aberta/curva, então nem tudo coincide ao mesmo tempo.
POSES = {
    # GoPro à frente do olho do jogo, à direita do piloto, baixa (0,95 m na V06): retrovisor e faixa
    # no alto, volante à esquerda. A GoPro é olho de peixe; fov 82 aproxima sem curvar as bordas.
    'frente': {'ref': 'carro/carro_14_interna.JPG', 'eye': [-.12, 1.043, .20], 'yaw': -.05, 'pitch': -.08, 'roll': -.05, 'fov': 82},
    # Do lado do carona, olhando para trás e para baixo pelo X da gaiola; o encosto de tela do
    # banco do piloto (vazio na foto) na borda direita.
    'tras': {'ref': 'carro/carro_36_interno_banco_traseiro_armacao_ferro.JPG', 'eye': [-.45, .95, .40], 'yaw': 3.67, 'pitch': .04, 'fov': 88, 'hideDriver': True},
    # Colado ao painel, logo à frente do cubo do volante (o volante fica atrás da câmera).
    'painel': {'ref': 'carro/carro_27interior_painel_frente_perto.JPG', 'eye': [.20, .93, -.33], 'yaw': 0, 'pitch': -.2, 'fov': 55, 'hideDriver': True},
    # Por cima do aro do volante, do lado da porta, olhando o painel de cima.
    'painel_lado': {'ref': 'carro/carro_25_painel_marcadores.JPG', 'eye': [.23, 1.08, -.66], 'yaw': .97, 'pitch': -.74, 'fov': 60, 'hideDriver': True},
    # Na abertura da porta do piloto, ~15 cm para dentro da soleira, olhando volante, painel e pedais.
    'volante_porta': {'ref': 'carro/carro_24_interior_volante_marcadores.JPG', 'eye': [-.20, 1.05, -.62], 'yaw': .46, 'pitch': -.56, 'fov': 60, 'hideDriver': True},
    # Do banco, de frente para o painel de interruptores, um pouco abaixo dele.
    'botoes': {'ref': 'carro/carro_31_botoes_topo_piloto.JPG', 'eye': [.09, 1.21, -.435], 'yaw': .03, 'pitch': .32, 'fov': 45, 'hideDriver': True},
    # Cubo do volante de perto; o celular da foto estava girado (logo sparco subindo à direita).
    'volante': {'ref': 'carro/carro_32_interno_volante_detalhes_meio.JPG', 'eye': [.055, .94, -.35], 'yaw': -.27, 'pitch': -.16, 'roll': -.68, 'fov': 50, 'hideDriver': True},
    # Do lugar do piloto para a alavanca, o assoalho do carona e os relés.
    'cambio': {'ref': 'carro/carro_33_interno_cambio.JPG', 'eye': [-.10, .80, -.15], 'yaw': .60, 'pitch': -.34, 'fov': 65, 'hideDriver': True},
    # Entre os joelhos, olhando os pedais de cima (cada pedal Tilton ~8% da largura).
    'pedais': {'ref': 'carro/carro_29_interior_pedais.JPG', 'eye': [.36, .62, -.37], 'yaw': 0, 'pitch': -.72, 'fov': 70, 'hideDriver': True},
    # Na altura da bola do câmbio (canto inferior esquerdo), olhando a parede de fogo do carona.
    'carona': {'ref': 'carro/carro_30_interior_pes_do_carona_com_fusiveis.JPG', 'eye': [-.10, .77, -.22], 'yaw': 1.09, 'pitch': -.34, 'fov': 72, 'hideDriver': True},
    # De cima, quase na vertical sobre a placa da chave geral no túnel.
    'chave': {'ref': 'carro/carro_28_interior_chave_no_lugar_do_freio_de_mao.JPG', 'eye': [-.33, .86, 0], 'yaw': .87, 'pitch': -.87, 'fov': 66, 'hideDriver': True},
    # Atrás do arco principal, lado do carona, olhando para baixo: bateria, extintor, divisória.
    'banco_tras': {'ref': 'carro/carro_34_interno_banco_de_tras.JPG', 'eye': [-.85, 1.08, .55], 'yaw': 2.79, 'pitch': -.96, 'fov': 75},
    # Sobre o assoalho do carona, olhando para a frente e para baixo: fone na placa de carbono,
    # túnel à esquerda, soleira com o cano de freio à direita.
    'piso_carona': {'ref': 'carro/carro_35_interno_protetor_auditivo_e_radio_banco_carona.JPG', 'eye': [-.22, .80, .37], 'yaw': .30, 'pitch': -.87, 'fov': 75},
}
GAME_SHOTS = ('jogo_frente', 'jogo_olhando_tras')


def main():
    parser = argparse.ArgumentParser(description='Fotografa o interior do Opala 99 nas poses das fotos de referência.')
    parser.add_argument('--port', type=int, default=8799, help='porta do servidor local (padrão 8799)')
    parser.add_argument('--only', default='', help='nomes separados por vírgula, ex.: painel,tras,jogo_frente')
    parser.add_argument('--hud', action='store_true', help='mantém o HUD do jogo visível nas fotos')
    args = parser.parse_args()
    only = [name.strip() for name in args.only.split(',') if name.strip()]
    unknown = [name for name in only if name not in POSES and name not in GAME_SHOTS]
    if unknown:
        parser.error('pose desconhecida: ' + ', '.join(unknown) + '. Disponíveis: ' + ', '.join([*POSES, *GAME_SHOTS]))
    wanted = lambda name: not only or name in only
    OUT.mkdir(parents=True, exist_ok=True)
    errors, saved = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=browser_executable(), headless=True, args=browser_args())
        page = browser.new_page(viewport=SIZE)
        page.set_default_timeout(90000)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)

        def frames(count=2):
            for _ in range(count):
                page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>r()))')

        def shoot(name):
            frames(2)
            page.wait_for_timeout(250)
            path = OUT / f'{name}.png'
            page.screenshot(path=str(path))
            saved.append(path)
            print(path, flush=True)

        try:
            open_menu(page, url=f'http://127.0.0.1:{args.port}/pista_interlagos/teste/')
            race_options(page, immersive=False)
            enter_track(page)
            page.click('#cockpitButton')
            page.keyboard.down('KeyS')  # freio: o carro fica parado na largada
            wait_race_start(page)
            # Texturas escaneadas do interior (carregam depois de entrar na pista).
            try:
                wait_js(page, "performance.getEntriesByType('resource').filter(e=>e.name.includes('/texturas/interior/')).length>=13", timeout=20000)
            except TimeoutError:
                print('aviso: texturas do interior ainda carregando', flush=True)
            page.wait_for_timeout(1500)
            if not args.hud:
                # Só o canvas: HUD, rodapé e botões saem da foto (estilo via CSSOM, permitido pelo CSP).
                page.evaluate("()=>{for(const el of document.body.children)if(el.id!=='view')el.style.visibility='hidden';}")
            assert page.evaluate("interlagos.state.mode==='cockpit'"), 'câmera interna não ativa'
            for name, pose in POSES.items():
                if not wanted(name):
                    continue
                view = {k: pose[k] for k in ('eye', 'yaw', 'pitch', 'roll', 'fov') if pose.get(k) is not None}
                view['hideDriver'] = bool(pose.get('hideDriver'))
                page.evaluate('(v)=>interlagos.setCockpitView(v)', view)
                shoot(name)
            page.evaluate('()=>interlagos.setCockpitView(null)')
            if wanted('jogo_frente'):
                shoot('jogo_frente')
            if wanted('jogo_olhando_tras'):
                page.keyboard.down('KeyB')
                wait_js(page, 'interlagos.viewControls().lookBack.amount===1', timeout=5000)
                shoot('jogo_olhando_tras')
                page.keyboard.up('KeyB')
                wait_js(page, 'interlagos.viewControls().lookBack.amount===0', timeout=5000)
            page.keyboard.up('KeyS')
        finally:
            browser.close()
    if errors:
        print('erros no navegador:', *errors, sep='\n  ', file=sys.stderr)
    print(f'{len(saved)} foto(s) em {OUT}')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
