#!/usr/bin/env bash
# Instala e liga o coturn no Ubuntu/Debian.
# Uso (como root, na pasta do arquivo): sudo bash instalar.sh
set -euo pipefail

if [ "$(id -u)" != "0" ]; then
  echo "Rode como root: sudo bash instalar.sh" >&2
  exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"

apt update
apt install -y coturn

# O pacote vem desligado no Debian/Ubuntu ate habilitar aqui.
sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn

install -m 640 -o root -g root "$DIR/turnserver.conf" /etc/coturn/turnserver.conf

systemctl enable coturn
systemctl restart coturn
systemctl --no-pager --lines=12 status coturn || true

# Firewall local: so mexe se o ufw estiver ativo.
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 3478/tcp
  ufw allow 3478/udp
  ufw allow 49160:49200/udp
  echo "ufw: portas 3478/tcp, 3478/udp e 49160-49200/udp liberadas"
fi

cat <<'TXT'

Pronto. Falta o que o script nao faz por voce:
  1. Liberar no roteador/security group: 3478/tcp, 3478/udp, 49160-49200/udp
  2. Se o IP publico nao esta na placa de rede, preencher external-ip no conf
  3. Testar: app -> Configuracoes -> Voz e video -> Servidor TURN
TXT
