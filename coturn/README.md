# coturn no seu servidor (fibra própria)

Relay de voz/tela do RONYZERA. Resolve NAT restrito/CGNAT: sem ele, quem está atrás de
CGNAT não abre áudio, câmera nem tela.

## 1. Sistema operacional

**Ubuntu 24.04 LTS** (ou Debian 12), instalação **mínima, sem interface gráfica**, 64 bits.
Windows Server não serve bem para coturn; se a máquina hoje roda Windows, instale o Linux
direto (ou uma VM com rede em **bridge**, não NAT — WSL2 não serve por causa do UDP).

## 2. Hardware

O coturn só encaminha pacotes: o gargalo é **banda de upload**, não CPU/RAM.

| Pessoas relayadas ao mesmo tempo | vCPU | RAM | Disco |
|---|---|---|---|
| até 10 | 1 | 512 MB | 10 GB |
| 10–30 | 1–2 | 1 GB | 20 GB |
| 30–100 | 2 | 2 GB | 20 GB |

Consumo por pessoa relayada: **voz ~30–40 MB/h**; **tela ~1–2 GB/h por quem assiste**.
Um link de fibra 100/100 Mbps atende dezenas em voz ou ~5 telas ao mesmo tempo.
Um PC usado (i3/i5, 4 GB) já sobra — o que importa é ficar ligado 24/7 (nobreak ajuda).

## 3. Confira o tipo de IP

No servidor:

```bash
curl -4 ifconfig.me                 # IP que o mundo vê
ip -4 addr show | grep inet         # IP da placa de rede
```

- **IP da placa == IP público** → público direto: **não precisa de port-forward nem de
  `external-ip`**. Só o firewall do sistema.
- **IP da placa é 10.x / 172.16-31.x / 192.168.x** → há roteador fazendo NAT: precisa de
  **port-forward** e de `external-ip=IP_PUBLICO/IP_PRIVADO`.
- **WAN do roteador em 100.64.x a 100.127.x** → CGNAT do provedor: port-forward não
  funciona. Só resolve com IP público fixo (peça ao provedor, já que a fibra é sua) ou
  com TURN de terceiros (Cloudflare/metered).

Repita o `curl` em dias diferentes: se o IP muda, é **dinâmico** (precisa do item 6).

## 4. Instalar

```bash
sudo bash instalar.sh
```

Edite a senha em `turnserver.conf` **antes** de rodar (`user=ronyzera:SENHA_FORTE`).

## 5. Portas (as duas pontas)

| Porta | Protocolo | Uso |
|---|---|---|
| 3478 | TCP + UDP | TURN |
| 5349 | TCP | TURN sobre TLS (só com domínio + certificado) |
| 49160–49200 | UDP | relay |

Libere no firewall da máquina **e** no roteador/security group, se houver NAT.
Se o seu roteador tiver “SIP ALG”/“helper”, **desligue** — ele quebra TURN/WebRTC.

## 6. IP dinâmico (só se o IP mudar)

O coturn resolve o `external-ip` apenas na inicialização, então IP novo exige reiniciar.
Use o script + timer:

```bash
sudo install -m 755 atualiza-ip.sh /usr/local/bin/atualiza-ip.sh
sudo cp atualiza-ip.service atualiza-ip.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now atualiza-ip.timer
```

Além disso, para os clientes acharem o servidor, aponte um **DDNS** (DuckDNS, No-IP,
Cloudflare DNS) para o IP e use o nome no app em vez do IP.

## 7. Ligar no app

`%appdata%\RONYZERA\configuracoes.json`:

```json
{
  "turn": {
    "urls": ["turn:SEU_IP_OU_DOMINIO:3478", "turn:SEU_IP_OU_DOMINIO:3478?transport=tcp"],
    "username": "ronyzera",
    "credential": "A_MESMA_SENHA_DO_CONF"
  }
}
```

Depois: app → Configurações → *Testar microfone e rede* → **Testar rede** →
`Servidor TURN: respondeu`. Saia e entre na sala.

## 8. Site e APK

O build da PWA/APK lê o secret `TURN_JSON` do GitHub. Use o mesmo JSON, em uma linha:

```json
{"urls":["turn:SEU_IP_OU_DOMINIO:3478","turn:SEU_IP_OU_DOMINIO:3478?transport=tcp"],"username":"ronyzera","credential":"A_MESMA_SENHA_DO_CONF"}
```

## 9. Segurança

Senha fixa no app/site vale para todos os usuários — quem extrair pode usar seu relay.
Para credencial que expira, o `turn.js` já suporta `use-auth-secret` (HMAC), mas só o app
Windows consegue gerar (no navegador/APK o segredo ficaria exposto).
