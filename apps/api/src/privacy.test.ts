// SPDX-License-Identifier: GPL-2.0-or-later
// A política de privacidade (OG-107) acompanha o banco: toda tabela está classificada e toda tabela
// com dado pessoal aparece no inventário mostrado em /privacy.
import { DATA_INVENTORY, TABLES } from '@outgun/content';
import { describe, expect, it } from 'vitest';
import { allTables } from './db/schema.js';

describe('inventário de dados pessoais (OG-107)', () => {
  it('toda tabela do banco está classificada (pessoal ou não) e nada sobra na lista', () => {
    expect(Object.keys(TABLES).sort()).toEqual(Object.keys(allTables).sort());
  });

  it('toda tabela com dado pessoal aparece na política, e a política só cita tabelas que existem', () => {
    const cited = new Set(DATA_INVENTORY.flatMap((d) => d.where).filter((w) => !w.includes(':') && w !== 'logs'));
    const personal = Object.entries(TABLES)
      .filter(([, kind]) => kind === 'personal')
      .map(([name]) => name);
    for (const table of personal) expect(cited, `tabela ${table} fora da política`).toContain(table);
    for (const table of cited) expect(Object.keys(allTables)).toContain(table);
  });

  it('colunas que costumam guardar dado pessoal (ip, e-mail, nome, user agent) só existem em tabelas marcadas como pessoais', () => {
    const suspicious = /^(ip|email|username|user_agent|target_ip|target_name|reporter_name|actor_name|device_hash|target_device_hash|user_id|reporter_user_id|target_user_id)$/;
    for (const [name, table] of Object.entries(allTables)) {
      const columns = Object.values(table as unknown as Record<string, { name?: string }>)
        .map((c) => c?.name)
        .filter((c): c is string => typeof c === 'string');
      if (columns.some((c) => suspicious.test(c))) expect(TABLES[name], `${name} tem coluna pessoal`).toBe('personal');
    }
  });
});
