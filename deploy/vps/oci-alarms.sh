#!/bin/bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Alarmes do Monitoring da Oracle para a VM do beta (OG-456): CPU acima de 80% e memória acima de
# 85% por 5 minutos, e VM sem mandar métricas por 5 minutos (caiu ou travou). Avisam por e-mail
# pelo Notifications. Tudo dentro do Always Free (alarmes e 1.000 e-mails por mês); a assinatura
# do e-mail precisa ser confirmada pelo link que a Oracle manda. Idempotente: rodar de novo
# atualiza os alarmes. Usa a CLI `oci` configurada nesta máquina (~/.oci/config).
#
# Uso: bash deploy/vps/oci-alarms.sh EMAIL [NOME_DA_INSTANCIA]
set -euo pipefail
export SUPPRESS_LABEL_WARNING=True PYTHONWARNINGS=ignore
email="${1:?uso: oci-alarms.sh EMAIL [NOME_DA_INSTANCIA]}"
name="${2:-instance-20261014-1747}"
tenancy=$(grep '^tenancy' ~/.oci/config | head -1 | cut -d= -f2 | tr -d ' ')
comp="${OCI_COMPARTMENT:-$tenancy}"

inst=$(oci compute instance list -c "$comp" --lifecycle-state RUNNING --display-name "$name" --query 'data[0].id' --raw-output)
[ -n "$inst" ] && [ "$inst" != null ] || { echo "instância $name não encontrada" >&2; exit 1; }

topic=$(oci ons topic list -c "$comp" --name outgun-alertas --query 'data[0]."topic-id"' --raw-output 2>/dev/null || true)
if [ -z "$topic" ] || [ "$topic" = null ]; then
  topic=$(oci ons topic create -c "$comp" --name outgun-alertas --description 'Alarmes do servidor do beta do Outgun Web (OG-456)' --query 'data."topic-id"' --raw-output)
  echo "tópico criado"
fi
subs=$(oci ons subscription list -c "$comp" --topic-id "$topic" --query "length(data[?endpoint=='$email'])" --raw-output)
if [ "$subs" = 0 ]; then
  oci ons subscription create -c "$comp" --topic-id "$topic" --protocol EMAIL --subscription-endpoint "$email" >/dev/null
  echo "assinatura criada: confirme pelo e-mail da Oracle"
fi

# alarm NOME SEVERIDADE QUERY TEXTO
alarm() {
  local display="$1" severity="$2" query="$3" body="$4" id
  local common=(--display-name "$display" --metric-compartment-id "$comp" --namespace oci_computeagent
    --query-text "$query" --severity "$severity" --destinations "[\"$topic\"]" --is-enabled true
    --pending-duration PT5M --repeat-notification-duration PT2H --body "$body" --message-format ONS_OPTIMIZED)
  id=$(oci monitoring alarm list -c "$comp" --display-name "$display" --query 'data[0].id' --raw-output 2>/dev/null || true)
  if [ -z "$id" ] || [ "$id" = null ]; then
    oci monitoring alarm create --compartment-id "$comp" "${common[@]}" >/dev/null && echo "alarme criado: $display"
  else
    oci monitoring alarm update --alarm-id "$id" "${common[@]}" --force >/dev/null && echo "alarme atualizado: $display"
  fi
}

# média do minuto: um deploy (3 a 4 min acima de 90% no máximo do minuto) não chega a 5 min seguidos
alarm 'outgun-beta-cpu' WARNING "CpuUtilization[1m]{resourceId = \"$inst\"}.mean() > 80" \
  'CPU da VM do beta acima de 80% há 5 minutos. Veja salas e partidas no painel do Grafana e o relatório de capacidade.'
alarm 'outgun-beta-memoria' WARNING "MemoryUtilization[1m]{resourceId = \"$inst\"}.mean() > 85" \
  'Memória da VM do beta acima de 85% há 5 minutos (a VM tem 1 GB e já usa swap).'
alarm 'outgun-beta-sem-metricas' CRITICAL "CpuUtilization[1m]{resourceId = \"$inst\"}.absent()" \
  'A VM do beta parou de mandar métricas há 5 minutos: pode ter caído ou travado. Confira https://outgunweb.com.br e o console da Oracle.'
