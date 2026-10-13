// SPDX-License-Identifier: GPL-2.0-or-later
// Ticket de entrada (OG-083): a API confere conta, nome, senha e ban e devolve o ticket e o endereço
// do game server. Sem a API no ar (desenvolvimento só com o servidor de jogo), usa `dev:Nome`, que
// o servidor só aceita com DEV_TICKETS.
import { api, ApiError } from '../../app/api.js';

export interface JoinTicket {
  readonly ticket: string;
  /** Endereço completo da sala (ws://.../rooms/ID). */
  readonly url: string;
}

export class JoinError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/**
 * `server` explícito (?server=) sempre manda no endereço; o ticket ainda vem da API quando ela
 * responde.
 */
export async function requestTicket(room: string, name: string, server: string, explicitServer: boolean, password?: string): Promise<JoinTicket> {
  const fallbackUrl = `${server.replace(/\/$/, '')}/rooms/${encodeURIComponent(room)}`;
  try {
    const r = await api<{ ticket: string; wsUrl: string }>(`/rooms/${encodeURIComponent(room)}/join`, { body: { name, ...(password ? { password } : {}) } });
    return { ticket: r.ticket, url: explicitServer ? fallbackUrl : r.wsUrl };
  } catch (error) {
    if (error instanceof ApiError && error.status !== 0 && error.status < 500 && error.code !== 'unknown') throw new JoinError(error.code);
    return { ticket: `dev:${name}`, url: fallbackUrl };
  }
}

/** Mensagem (em inglês, chave de tradução) para cada recusa da API. */
export function joinErrorText(code: string): string {
  switch (code) {
    case 'account_required':
      return 'Ranked matches require an account.';
    case 'name_registered':
      return 'This name belongs to an account. Sign in or choose another.';
    case 'invalid_name':
      return 'Invalid name.';
    case 'banned':
      return 'You are banned from this room.';
    case 'password_required':
      return 'This room needs a password.';
    case 'wrong_password':
      return 'Wrong password.';
    case 'room_full':
      return 'The room is full.';
    case 'room_offline':
      return 'The room is not running.';
    case 'room_not_found':
      return 'Room not found.';
    default:
      return 'Something went wrong. Try again.';
  }
}
