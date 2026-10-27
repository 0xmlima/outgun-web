# OG-452 — Métricas e logs do beta no Grafana Cloud (Grafana Alloy)

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S48 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero as métricas do jogo, da API e da máquina do beta guardadas fora do servidor, com os logs dos containers, para entender travamentos e quedas depois que acontecem (os logs somem a cada deploy, porque o container é recriado).

## Contexto
- Em 26/10 uma partida travou e desconectou todos; os logs do game server de antes do deploy das 23h04 tinham sumido e o `/metrics` só tinha números desde o último reinício. Relatório de capacidade: https://claude.ai/artifact/YAZzbsxAZijxTAqf6wCYEK.
- O game server e a API já expõem `/metrics` (OG-102) com token (`METRICS_TOKEN`). Painel e regras locais em `tools/observability/`.
- Plano gratuito: Grafana Cloud Free (10 mil séries ativas, 50 GB de logs, 14 dias de retenção, alertas incluídos). A VM é uma E2.1.Micro (1 GB de RAM): o agente precisa caber em ~150 MB.

## Escopo
- Serviço `alloy` (Grafana Alloy, imagem fixa) no `deploy/vps/compose.yml`, num perfil que só sobe quando o `.env` tem as credenciais do Grafana Cloud.
- `deploy/vps/alloy/config.alloy`: coleta o `/metrics` do game server e da API (Bearer), a máquina (CPU, steal, memória, swap, PSI, disco, rede), os containers (CPU e memória por serviço) e os logs dos containers do projeto (com o rótulo do serviço e o nível do log); envia por `remote_write` e para o Loki.
- Limite de memória do container e `GOMEMLIMIT`; descarta séries que não usamos para ficar longe das 10 mil.
- `deploy/vps/grafana-cloud.sh`: grava as credenciais (lidas de `~/.config/outgun/grafana-cloud.env`, fora do repositório) no `.env` do servidor e sobe o Alloy.
- `install.sh` sobe o Alloy junto quando as credenciais existem; README do deploy explica como ligar.

## Critérios de aceite
- [x] Sem credenciais, o deploy segue igual (nenhum container novo).
- [ ] Com credenciais, as métricas do jogo, da API, da máquina e dos containers e os logs chegam ao Grafana Cloud.
- [ ] O Alloy fica abaixo do limite de memória configurado e só escuta na rede interna.
- [x] Nenhuma credencial no repositório.

## Notas técnicas
- O socket do Docker é montado só leitura, para descobrir os containers e ler os logs. Dá acesso amplo ao Docker: o Alloy não publica porta e a interface dele fica só em 127.0.0.1.

## Notas de implementação
- Alloy v1.20.1; carregou a configuração e ficou em ~55 MB num teste local (limite 160 MB, `GOMEMLIMIT` 110 MiB). Recebe só as variáveis que usa, não o `.env` inteiro.
- Sem `netdev`: dentro do container o `/proc/net` é a rede do próprio container (a rede da VM continua vindo da Oracle). Os containers (cAdvisor, `cgroup: host`) só dá para conferir no Linux do beta.
- Pendente: a conta do Grafana Cloud (PO) e `bash deploy/vps/grafana-cloud.sh root@137.131.202.138`; depois conferir os dois critérios que faltam.
