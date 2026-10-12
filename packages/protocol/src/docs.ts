// SPDX-License-Identifier: GPL-2.0-or-later
// Gera MESSAGES.md a partir do catálogo (um teste garante que o arquivo está em dia).
import type { FieldType } from './codec.js';
import { PROTOCOL_VERSION } from './frame.js';
import { DROPPED, MESSAGES, type MessageDef } from './messages.js';

function describe(type: FieldType<unknown>, indent: string): string[] {
  const fields = (type as { fields?: Record<string, FieldType<unknown>> }).fields;
  if (!fields) return [];
  return Object.entries(fields).flatMap(([name, t]) => [
    `${indent}- \`${name}\`: ${t.doc}`,
    ...describe(t, `${indent}  `),
  ]);
}

export function generateMessagesMd(): string {
  const lines = [
    '<!-- Gerado por `pnpm --filter @outgun/protocol gen:messages` a partir de src/messages.ts. Não edite à mão. -->',
    '',
    `# Protocolo Outgun Web v${PROTOCOL_VERSION}`,
    '',
    'Cada mensagem WebSocket binária contém uma ou mais mensagens: `[código u8][campos na ordem abaixo]`.',
    'Inteiros little-endian; `string` e `lista` levam o comprimento como varuint (7 bits por byte).',
    'Canal `frame`: estado do frame, pode ser descartado se chegar um mais novo; `event`: confiável e em ordem.',
    '',
    '## Handshake',
    '',
    '1. O cliente abre o WebSocket e envia `hello` com `protocol` e o ticket da API.',
    `2. Versão diferente de ${PROTOCOL_VERSION} ou ticket inválido: \`reject\` e o servidor fecha a conexão.`,
    '3. Aceito: `welcome`, `serverSettings`, jogadores presentes, bandeiras, placar; depois `frame` a cada 100 ms.',
    '',
    '## Mensagens',
    '',
    '| Código | Nome | Direção | Canal | Origem no original | Descrição |',
    '|---:|---|---|---|---|---|',
  ];
  const entries = Object.entries(MESSAGES) as [string, MessageDef][];
  for (const [name, def] of entries) {
    lines.push(
      `| ${def.code} | [\`${name}\`](#${name.toLowerCase()}) | ${def.dir === 'c2s' ? 'cliente → servidor' : 'servidor → cliente'} | ${def.channel} | ${def.origin} | ${def.doc} |`,
    );
  }
  lines.push('', '## Campos', '');
  for (const [name, def] of entries) {
    lines.push(`### ${name}`, '', `Código ${def.code}. ${def.doc}`, '');
    const fields = Object.entries(def.fields);
    if (fields.length === 0) lines.push('Sem campos.');
    for (const [field, type] of fields)
      lines.push(`- \`${field}\`: ${type.doc}`, ...describe(type, '  '));
    lines.push('');
  }
  lines.push(
    '## Mensagens do original que não existem aqui',
    '',
    '| Original | Motivo |',
    '|---|---|',
  );
  for (const [codes, why] of DROPPED) lines.push(`| ${codes} | ${why} |`);
  lines.push('');
  return lines.join('\n');
}
