# TURN — voz e tela atrás de NAT restrito/CGNAT

O chat, a lista de pessoas e a entrada na sala usam o servidor de sinalização e funcionam em qualquer
rede. **Voz, câmera e tela são P2P**: precisam de conexão direta entre os dois lados. Quando um dos
lados está atrás de CGNAT (NAT simétrico — o IP público muda de porta a cada destino) essa conexão
direta não abre e o único caminho é um servidor **TURN** (relay).

Sintoma clássico: a pessoa entra na sala, vê todo mundo, mas não ouve, não fala e não vê a tela —
enquanto os outros (em rede aberta) se ouvem normalmente.

## Como saber se é isso

No app: **🔌 Configurar TURN** (ou Configurações → Voz e vídeo → *Testar microfone e rede*) e
**Testar rede**.

- `Endereços públicos (NAT): 3 · NAT restrito/CGNAT` → precisa de TURN.
- `Servidor TURN: não respondeu` → o TURN em uso não entregou relay (credencial vencida, cota
  estourada ou bloqueio de rede).

Teste real é o relay: o botão **Testar TURN** só aprova se o servidor devolver um endereço `relay`.

## Opção 1 — TURN próprio (coturn) — recomendado para o app inteiro

Precisa de uma VPS com IP público (1 vCPU/512 MB basta para ~30 pessoas simultâneas; o tráfego de
voz é pequeno).

`/etc/coturn/turnserver.conf`:

```
listening-port=3478
tls-listening-port=5349
fingerprint
use-auth-secret
static-auth-secret=TROQUE_POR_UM_SEGREDO_LONGO
realm=ronyzera
# portas de relay (abra no firewall/security group, UDP)
min-port=49160
max-port=49200
no-multicast-peers
# TLS (certificado do Let's Encrypt)
cert=/etc/letsencrypt/live/turn.SEUDOMINIO/fullchain.pem
pkey=/etc/letsencrypt/live/turn.SEUDOMINIO/privkey.pem
```

Firewall: `3478/udp`, `3478/tcp`, `5349/tcp`, `49160-49200/udp`.

O app (processo principal, `turn.js`) gera usuário/senha temporários a partir do segredo. Em
`%appdata%/RONYZERA/configuracoes.json`:

```json
{
  "turn": {
    "urls": ["turn:turn.SEUDOMINIO:3478", "turns:turn.SEUDOMINIO:5349?transport=tcp"],
    "secret": "TROQUE_POR_UM_SEGREDO_LONGO",
    "ttl": 3600
  }
}
```

Ou, sem editar arquivo, na variável de ambiente `RONYZERA_TURN` com o mesmo JSON.

## Opção 2 — Conta gratuita (metered.ca / Cloudflare) e colar no app

1. Crie a conta e um "TURN app" (metered.ca) ou uma TURN key (Cloudflare Realtime).
2. Copie endereço(s), usuário e senha.
3. No app: **Configurações → Voz e vídeo → Servidor TURN**, cole e clique **Testar TURN** → **Salvar**.
4. Saia e entre na sala (as conexões novas já usam o TURN).

Endereços úteis (cole os dois, um por linha/vírgula — o `tcp` fura bloqueio de UDP):

```
turn:SEU-HOST:3478
turns:SEU-HOST:443?transport=tcp
```

## Opção 2b — Cloudflare Realtime TURN (o app gera a credencial sozinho)

A TURN key da Cloudflare **não serve como usuário/senha**: ela é trocada por credenciais temporárias
(TTL). O processo principal do app já faz essa troca e entrega a lista pronta — o segredo nunca vai
para a página.

1. Entre em <https://dash.cloudflare.com/?to=/:account/calls> (menu **Realtime**, antigo "Calls").
2. Aba **TURN** → **Create TURN key** (nome livre, ex.: `ronyzera`).
3. Copie os dois valores mostrados:
   - **TURN Key ID** (32 caracteres) → `keyId`
   - **API token / key** (64 caracteres) → `token` — aparece **uma única vez**, guarde agora.
4. Coloque no `%appdata%/RONYZERA/configuracoes.json` (junto das outras chaves):

```json
{
  "cloudflareTurn": { "keyId": "SEU_KEY_ID", "token": "SEU_TOKEN", "ttl": 86400 }
}
```

   ou defina `RONYZERA_CF_TURN` com o mesmo JSON.

5. Abra o app → Configurações → *Testar microfone e rede* → **Testar rede**: "Servidor TURN" deve
   dizer **respondeu**.

Detalhes: `ttl` máximo é 172800 s (48 h); o app renova sozinho aos 80% do tempo. A porta 53 é
descartada (vários provedores bloqueiam). Endpoints usados:
`POST https://rtc.live.cloudflare.com/v1/turn/keys/<keyId>/credentials/generate-ice-servers`.

Custo: o TURN da Cloudflare é cobrado por GB fora do SFU (US$ 0,05/GB de saída no momento em que
escrevi isto); voz consome pouco (≈ 30–40 MB por hora por pessoa relayada). Confira a tabela atual no
painel da Cloudflare antes de liberar para muita gente.

**Distribuir para todos os usuários:** se a chave ficar só no seu `configuracoes.json`, cada amigo
precisa da própria conta. Para valer para todos, a chave tem que ir embutida no build (como era a
credencial antiga) — funciona, mas quem extrair a chave pode gastar sua cota. Alternativa segura:
um endpoint seu que gera as credenciais e o app só consome.

Cotas: metered.ca grátis ~50 GB/mês; Cloudflare TURN grátis 1 TB/mês (credencial temporária, precisa
gerar por API). Para um app distribuído, 1 TB é o caminho que aguenta o uso real.

## Observações

- TURN não é usado quando a conexão direta funciona: ele é só o plano B do ICE.
- Credencial fixa embutida no app é compartilhada por todos os usuários e estoura a cota — foi o que
  aconteceu com o TURN padrão do RONYZERA (`TURN allocate error 400`).
- O app aceita TURN do usuário mesmo no site/APK: fica no `localStorage` (`ntg_turn`), não no código.
