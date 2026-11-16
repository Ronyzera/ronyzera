#!/usr/bin/env bash
# Mantem o external-ip do coturn igual ao IP publico atual.
# Necessario so quando a fibra entrega IP DINAMICO (PPPoE que troca de vez em quando).
# Instale em /usr/local/bin/atualiza-ip.sh e agende com o timer systemd.
#
# Atencao: quando o IP muda, este script reinicia o coturn (chamadas em andamento
# caem por alguns segundos). Se o seu IP e fixo, NAO instale isto.
set -euo pipefail

CONF="${CONF:-/etc/coturn/turnserver.conf}"

PUB="$(curl -4 -fsS --max-time 8 https://ifconfig.me/ip 2>/dev/null || true)"
if [ -z "$PUB" ]; then
  echo "sem resposta do servico de IP; tentando de novo no proximo ciclo" >&2
  exit 0
fi

PRIV="$(hostname -I | awk '{print $1}')"
NOVO="external-ip=$PUB/$PRIV"
ATUAL="$(grep -E '^external-ip=' "$CONF" || true)"

if [ "$ATUAL" = "$NOVO" ]; then
  exit 0
fi

if [ -n "$ATUAL" ]; then
  sed -i "s|^external-ip=.*|$NOVO|" "$CONF"
else
  printf '\n# atualizado automaticamente (IP dinamico)\n%s\n' "$NOVO" >> "$CONF"
fi

systemctl restart coturn
logger -t ronyzera-turn "external-ip atualizado para $PUB"
echo "external-ip atualizado: $PUB/$PRIV"
