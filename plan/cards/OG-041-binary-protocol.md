# OG-041 — Protocolo binário v1

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S5 |
| Status | Concluído |
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
- [x] Documento `packages/protocol/MESSAGES.md` com cada mensagem, campos e origem no original.
- [x] Round-trip encode/decode testado para todas as mensagens.
- [x] Decoder nunca lança exceção não tratada com entrada aleatória (fuzz 1M casos).

## Notas técnicas
- —

## Notas de implementação
- Catálogo único em `packages/protocol/src/messages.ts` (72 mensagens: 14 cliente → servidor, 58 servidor → cliente), com código, direção, canal (`frame`/`event`), origem no original e campos tipados. Dele saem o codificador, o decodificador, os tipos TypeScript (`AnyMessage`, `message('nome', {...})`) e o [MESSAGES.md](../../packages/protocol/MESSAGES.md) (`pnpm --filter @outgun/protocol gen:messages`; um teste confere que está em dia).
- Envelope: cada mensagem WebSocket binária leva uma ou mais mensagens `[código u8][campos]`; inteiros little-endian, strings UTF-8 e listas com comprimento varuint e limite máximo. `decodeFrame` nunca lança: devolve `{ ok: false, error }` e pode exigir a direção (o servidor só aceita c2s).
- Handshake: `hello` (versão + ticket) → `welcome` ou `reject` (`protocolMismatch`, `invalidTicket`, `rankedNeedsAccount`...). `PROTOCOL_VERSION = 1`.
- Divergências de forma (registradas no topo de messages.ts e no MESSAGES.md): campos empacotados em bits viram campos; posições do frame em f32 e o estado do próprio jogador em f64 (predição com a mesma sim); configurações como texto de gamemod; mensagens legadas (download de arquivos, ranking/autenticação antigos, extensões) removidas.
- UTF-8 próprio e estrito (sem TextEncoder), para o pacote rodar igual no navegador, no Node e em workers.
- Testes: ida e volta de 200 amostras aleatórias por mensagem, várias mensagens por quadro, limites de faixa, e fuzz de 1M entradas (metade lixo, metade mensagens válidas corrompidas/truncadas), ~10 s; `FUZZ_CASES` ajusta a quantidade.
- O conteúdo do `frame` por cliente (AOI, minimapa, shadow) é montado no OG-042; a validação das entradas, no OG-043.
