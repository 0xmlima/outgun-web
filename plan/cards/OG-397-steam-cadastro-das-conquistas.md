# OG-397 — Steam: tabela das conquistas e cadastro no Steamworks

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Infra |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S41 |
| Status | Em andamento |
| Dependências | OG-395, OG-396 |
| Regras de negócio | RN-SOC-07 |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero as conquistas cadastradas no Steamworks com nomes, descrições e ícones, para publicá-las junto com o build.

## Contexto
- O Steamworks não importa conquistas em lote: cada uma é cadastrada na página do app (API name, nome e descrição em `english` e `brazilian`, ícones, *hidden*). Apps novos têm limite de ~100 conquistas; o catálogo fica abaixo disso.

## Escopo
- `apps/desktop/steam/achievements.md` gerado do catálogo: API name, nomes, descrições, hidden (secretos), arquivos dos ícones.
- Cadastro no Steamworks pelo PO ou pelo agente no Chrome, na sessão do PO e com a ordem dele; publicar as mudanças do Steamworks e subir o build na `beta` (`pnpm steam:upload`).

## Critérios de aceite
- [ ] Todas as conquistas do catálogo cadastradas e publicadas; os secretos como *hidden*.
- [ ] Teste do PO pela Steam (branch `beta`) desbloqueando ao menos uma conquista.

## Notas de implementação
- Tabela gerada: `apps/desktop/steam/achievements.md` (81 conquistas, 14 *hidden*), pelo mesmo script dos ícones. Os nomes dos secretos estão nela e no código-fonte (repositório privado).
- Falta (com a ordem do PO): cadastrar no Steamworks, publicar e subir o build na `beta`.
