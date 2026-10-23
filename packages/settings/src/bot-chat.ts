// SPDX-License-Identifier: GPL-2.0-or-later
// Chat dos bots (OG-404): mensagens por acontecimento da partida, com a chance de alguém falar e
// quem fala, editáveis na aba Bots da moderação. Só no Casual. `{name}` vira o nome do outro
// jogador do acontecimento (quem entrou, quem matou de novo...).

export const BOT_CHAT_EVENTS = [
  'match_start',
  'we_captured',
  'they_captured',
  'flag_returned',
  'kill_streak',
  'killed_by_same',
  'comeback',
  'win',
  'loss',
  'player_join',
  'player_leave',
] as const;
export type BotChatEvent = (typeof BOT_CHAT_EVENTS)[number];

/**
 * Quem fala: o bot envolvido (quem capturou, devolveu, está na sequência, morreu de novo; sem bot
 * envolvido, um do time), um bot do time do acontecimento, um do outro time ou qualquer bot.
 */
export const BOT_CHAT_SPEAKERS = ['involved', 'team', 'enemy', 'any'] as const;
export type BotChatSpeaker = (typeof BOT_CHAT_SPEAKERS)[number];

export interface BotChatRule {
  /** 0 a 100: chance de alguém falar quando o acontecimento ocorre. */
  chance: number;
  speaker: BotChatSpeaker;
  messages: string[];
}

export interface BotChatConfig {
  enabled: boolean;
  /** Teto de mensagens dos bots por minuto na sala. */
  perMinute: number;
  events: Record<BotChatEvent, BotChatRule>;
}

export const BOT_CHAT_MESSAGES_MAX = 40;
export const BOT_CHAT_MESSAGE_MAX_LENGTH = 120;
export const BOT_CHAT_PER_MINUTE_MAX = 30;
/** Espera mínima entre duas falas do mesmo bot. */
export const BOT_CHAT_BOT_COOLDOWN_MS = 20_000;
/** Atraso de "digitação" antes de a mensagem sair. */
export const BOT_CHAT_DELAY_MS: readonly [number, number] = [1000, 4000];

/** Mensagens padrão, em português e com jeito de chat. */
export const DEFAULT_BOT_CHAT: BotChatConfig = {
  enabled: true,
  perMinute: 6,
  events: {
    match_start: { chance: 40, speaker: 'any', messages: ['bora', 'gl hf', 'boa sorte pessoal', 'vamo q vamo', 'hj eu to on', 'bora time', 'partiu'] },
    we_captured: { chance: 35, speaker: 'involved', messages: ['pegamo!', 'isso!!', 'uhuul', 'mais uma', 'facil', 'boa time', 'kkk entregaram', 'toma'] },
    they_captured: { chance: 45, speaker: 'team', messages: ['quem tava na defesa??', 'entregaram a bandeira de novo', 'ninguem defende nesse time?', 'alguem volta pra base pfv', 'aff', 'defesa cade', 'como deixaram passar'] },
    flag_returned: { chance: 25, speaker: 'involved', messages: ['recuperei', 'voltou a bandeira', 'aqui nao', 'salvei', 'devolvida'] },
    kill_streak: { chance: 30, speaker: 'involved', messages: ['to on fire', 'ninguem me para', 'kkkkk', 'next', 'facil demais', 'quem é o proximo'] },
    killed_by_same: { chance: 40, speaker: 'involved', messages: ['{name} de novo??', 'para de me seguir {name}', '{name} ta de hack kkk', 'q isso {name}', 'serio {name}?'] },
    comeback: { chance: 50, speaker: 'team', messages: ['virou!!', 'virada!', 'nao desiste nunca', 'agora vai', 'eles tremeram'] },
    win: { chance: 50, speaker: 'team', messages: ['gg', 'ggwp', 'gg ez', 'boa time!', 'gg pessoal', 'vitoria'] },
    loss: { chance: 50, speaker: 'team', messages: ['gg', 'gg wp', 'proxima a gente ganha', 'time fraco hj', 'revanche?', 'foi quase'] },
    player_join: { chance: 30, speaker: 'any', messages: ['eae {name}', 'salve {name}', 'fala {name}', 'bem vindo {name}', 'opa'] },
    player_leave: { chance: 15, speaker: 'any', messages: ['flw {name}', '{name} arregou kkk', 'tchau {name}'] },
  },
};

const clamp = (n: unknown, lo: number, hi: number, fallback: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback);

/** Configuração salva (talvez parcial ou de uma versão antiga) completada com o padrão. */
export function botChatConfig(saved: unknown): BotChatConfig {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<BotChatConfig>;
  const events = {} as Record<BotChatEvent, BotChatRule>;
  for (const id of BOT_CHAT_EVENTS) {
    const base = DEFAULT_BOT_CHAT.events[id];
    const r = (s.events?.[id] ?? {}) as Partial<BotChatRule>;
    events[id] = {
      chance: clamp(r.chance, 0, 100, base.chance),
      speaker: BOT_CHAT_SPEAKERS.includes(r.speaker as BotChatSpeaker) ? (r.speaker as BotChatSpeaker) : base.speaker,
      messages: Array.isArray(r.messages)
        ? r.messages
            .filter((m): m is string => typeof m === 'string')
            .map((m) => m.trim().slice(0, BOT_CHAT_MESSAGE_MAX_LENGTH))
            .filter(Boolean)
            .slice(0, BOT_CHAT_MESSAGES_MAX)
        : base.messages,
    };
  }
  return { enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_BOT_CHAT.enabled, perMinute: clamp(s.perMinute, 0, BOT_CHAT_PER_MINUTE_MAX, DEFAULT_BOT_CHAT.perMinute), events };
}
