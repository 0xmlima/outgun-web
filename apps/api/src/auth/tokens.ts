// SPDX-License-Identifier: GPL-2.0-or-later
import { createHash, randomBytes } from 'node:crypto';

/** Token aleatório de 256 bits (vai para o cookie ou para o link do e-mail). */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** O banco guarda só o hash: um vazamento do banco não entrega sessões nem links válidos. */
export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}
