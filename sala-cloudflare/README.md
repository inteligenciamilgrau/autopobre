# Servidor das salas multiplayer

Um Worker do Cloudflare com um Durable Object por sala (`src/index.js`). Os navegadores dos pilotos só conversam com ele, por WebSocket; ninguém vê o IP de ninguém. O jogo continua no GitHub Pages.

O servidor garante, seja lá o que o navegador mande:

- **Chave do grupo:** sem ela ninguém abre nem entra numa sala. Ela fica só no Cloudflare, como *secret* (`CHAVE_GRUPO`).
- **Origem:** só as páginas listadas em `ORIGENS` (`wrangler.jsonc`) conseguem conectar.
- **Quem é quem:** o servidor carimba cada mensagem com o id de quem mandou; ninguém se passa por outro.
- **Papéis:** só o anfitrião fala com todos. Os convidados falam só com o anfitrião, e só depois de aceitos na porta.
- **Porteiro:** o anfitrião aceita, recusa ou expulsa. Quem foi expulso não volta com a mesma aba; quem foi recusado bate de novo como alguém novo. Se o anfitrião sai de vez, a sala passa só para quem já foi aceito: quem ainda está na porta nunca vira anfitrião.
- **Limites:** tamanho de cada mensagem, mensagens e bytes por segundo por conexão, 19 conexões por sala, e uma pausa de um minuto depois de 20 chaves erradas numa sala.

## Publicar (uma vez)

Dentro desta pasta, no cmd ou no PowerShell. O atalho `wrangler.cmd` usa o Node portátil de `Projetos_iA\apps` (ou o `node` do PATH), sem precisar mexer no PATH:

```sh
.\wrangler login
.\wrangler deploy
.\wrangler secret put CHAVE_GRUPO
```

(Numa cópia nova do projeto, rode antes `npm install` nesta pasta.)

O servidor fica em `https://sala.inteligenciamilgrau.com.br`, num domínio próprio cujo DNS está no Cloudflare: o `deploy` cria o registro e o certificado sozinho (`routes` em `wrangler.jsonc`). O endereço `workers.dev` da conta fica desligado (`workers_dev: false`). Esse endereço, com `wss://`, precisa estar em `ROOM_SERVER` de `pista_interlagos/teste/net-link.js` e de `pista_interlagos/scripts/publicacao.py` (a regra de segurança do site). O teste `testar_multiplayer.mjs` confere que os dois batem.

Para trocar a chave do grupo, rode `.\wrangler secret put CHAVE_GRUPO` de novo; ninguém precisa publicar o site.

## Custos

Plano gratuito: 100 mil requisições por dia (as mensagens recebidas contam 20 por 1), zerando às 21h de Brasília. Uma corrida de 6 pilotos por 3 horas gasta cerca de 67 mil. Se estourar, nada é cobrado: o servidor recusa conexões até zerar.

## Testar neste PC

`.dev.vars` (fora do Git) tem a chave e as origens de teste:

```
CHAVE_GRUPO=chave-de-teste-local
ORIGENS=http://127.0.0.1:8799,http://127.0.0.1:8841,http://teste.local
```

- `npm test` — o servidor sozinho, no `wrangler dev`: chave, origem, papéis, porteiro, limites, F5 e troca de anfitrião.
- `node teste/testar_sala_jogo.mjs` — o código de sala do próprio jogo conversando por ele.
- `python pista_interlagos/scripts/verificar_multiplayer.py 8841 --servidor` (da raiz, com o servidor do jogo na porta 8841) — três janelas correndo uma volta pelo servidor.
- No navegador: `.\wrangler dev` aqui e `…/index.html#sala=teste&servidor=local` no jogo.
