# OG-041 — Protocolo binário v1

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S5 |
| Status | Backlog |
| Dependências | [OG-001](OG-001-monorepo-setup.md) |
| Regras de negócio | — |
| Skills | `outgun-re-spec` |

## História
Como dev, quero um protocolo binário compacto e versionado entre cliente e servidor.

## Contexto e referências no original
- `src/protocol.h` (`Network_data_code`).
- `BinaryWriter/Reader` (`binaryaccess.*`), compressão de floats em `commont.h:240-280`.
- Mensagens em `servnet.cpp` e `clientbase.cpp`.

## Escopo
- `packages/protocol`: tabela de mensagens mapeada das ~80 do original (descartando as legadas), encoder/decoder com DataView.
- Handshake com versão; rejeição de versão incompatível.
- Mensagens confiáveis (eventos) e de estado (snapshot) sobre o mesmo WebSocket.
- Fuzz test do decoder.

## Critérios de aceite
- [ ] Documento `packages/protocol/MESSAGES.md` com cada mensagem, campos e origem no original.
- [ ] Round-trip encode/decode testado para todas as mensagens.
- [ ] Decoder nunca lança exceção não tratada com entrada aleatória (fuzz 1M casos).

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
