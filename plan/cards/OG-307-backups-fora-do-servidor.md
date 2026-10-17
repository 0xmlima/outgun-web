# OG-307 — Backups cifrados fora do servidor, com teste de restauração

| Campo | Valor |
|---|---|
| Épico | E14 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | — |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

> Na geladeira (PO, 2026-10-17): o time de infra decide se o armazenamento dos backups vai para outro servidor antes de criar o bucket na Oracle.

## História
Como operador, quero cópias do banco cifradas e fora da VM, para não perder contas, ranking e clãs se a máquina sumir.

## Contexto
Auditoria de segurança de 2026-10-16 (`plan/reports/S29-auditoria-seguranca.md`), guiada pelo OWASP Cheat Sheet Series: Database Security, Cryptographic Storage, Key Management.

Achado (o mais grave): os 15 backups diários ficam **só na própria VM** (`/opt/outgun/backups`), sem cifra. Se a instância for perdida (falha, erro humano ou recuperação de instância ociosa do Always Free), perdemos o banco e os backups juntos. (Correção da auditoria: o container de backup **não** monta os dados reais do banco; o volume que aparece é anônimo e vazio, criado pela declaração `VOLUME` da imagem do Postgres.)

## Escopo
- Envio diário para o Oracle Object Storage (S3 compatível, dentro do Always Free; ver [[oracle-free-only]]) com chave de acesso só de escrita no bucket.
- Cifra com `age` antes de enviar: chave pública no servidor, chave privada guardada pelo PO fora da máquina.
- Retenção: 14 diários + 8 semanais no bucket; local continua 14.
- Evitar o volume anônimo vazio no container de backup (a imagem base declara `VOLUME`), só para limpeza.
- Teste de restauração documentado (num banco temporário) e repetido a cada mês.

## Critérios de aceite
- [ ] Backup cifrado chegando ao bucket todo dia; falha gera alerta (log + e-mail).
- [ ] Restauração de um backup do bucket testada e registrada.
- [ ] Container de backup sem volume anônimo sobrando.

## Notas técnicas
## Notas de implementação
