// SPDX-License-Identifier: GPL-2.0-or-later
// Papel do banco usado pela API (OG-308, OWASP Database Security): lê e grava dados, sem DDL, sem
// criar papéis ou bancos e sem mexer no controle das migrations. O dono do schema (o usuário das
// migrations) continua o único com DDL. Idempotente: roda depois de cada `migrate up`.
import type { Sql } from 'postgres';

const ROLE = /^[a-z_][a-z0-9_]{0,62}$/;

/** Literal SQL de texto (`ALTER ROLE ... PASSWORD` não aceita parâmetro). */
const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;

export async function ensureAppRole(sql: Sql, role: string, password: string): Promise<void> {
  if (!ROLE.test(role)) throw new Error(`nome de papel inválido: ${role}`);
  if (password.length < 16) throw new Error('senha do papel da aplicação curta demais (mínimo 16)');
  const [{ owner, db }] = (await sql`SELECT current_user AS owner, current_database() AS db`) as unknown as [{ owner: string; db: string }];
  if (owner === role) throw new Error('o papel da aplicação não pode ser o dono do schema');
  const exists = (await sql`SELECT 1 FROM pg_roles WHERE rolname = ${role}`).length > 0;
  await sql.unsafe(`${exists ? 'ALTER' : 'CREATE'} ROLE ${role} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${literal(password)}`);
  await sql.unsafe(`GRANT CONNECT ON DATABASE "${db.replace(/"/g, '""')}" TO ${role}`);
  await sql.unsafe('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await sql.unsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await sql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
  await sql.unsafe(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  // tabelas e sequências criadas pelas próximas migrations já nascem com as mesmas permissões
  await sql.unsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE "${owner.replace(/"/g, '""')}" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`);
  await sql.unsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE "${owner.replace(/"/g, '""')}" IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${role}`);
  // o controle das migrations é só do dono
  if ((await sql`SELECT to_regclass('schema_migrations') IS NOT NULL AS ok`)[0]?.ok) await sql.unsafe(`REVOKE INSERT, UPDATE, DELETE ON schema_migrations FROM ${role}`);
}
