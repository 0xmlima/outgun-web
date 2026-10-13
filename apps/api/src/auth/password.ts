// SPDX-License-Identifier: GPL-2.0-or-later
// Senhas com argon2id (RN-PLT-01). Parâmetros mínimos da OWASP: 19 MiB, 2 passadas, 1 thread.
import { hash, verify, type Options } from '@node-rs/argon2';

export const MIN_PASSWORD = 8;
/** Limite superior: evita gastar CPU com senhas gigantes. */
export const MAX_PASSWORD = 128;

const OPTIONS: Options = { algorithm: 2 /* Argon2id */, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function validPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD && password.length <= MAX_PASSWORD;
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

let dummy: Promise<string> | undefined;

/**
 * Confere a senha. Sem hash (usuário inexistente), confere contra um hash descartável para que a
 * resposta leve o mesmo tempo e não revele se a conta existe.
 */
export async function verifyPassword(stored: string | undefined, password: string): Promise<boolean> {
  dummy ??= hashPassword('outgun-dummy-password');
  const target = stored ?? (await dummy);
  const ok = await verify(target, password).catch(() => false);
  return ok && stored !== undefined;
}
