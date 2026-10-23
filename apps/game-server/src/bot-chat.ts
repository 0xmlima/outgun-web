// SPDX-License-Identifier: GPL-2.0-or-later
// Bots que falam no chat (OG-404): a sala avisa os acontecimentos (captura, bandeira entregue,
// sequência, vitória...) e aqui se sorteia se alguém fala, qual bot e qual mensagem. A fala sai
// depois de 1 a 4 s ("digitando"), com espera mínima por bot, sem o mesmo bot duas vezes seguidas
// e com teto de mensagens por minuto na sala. Só no Casual (a sala nem cria o BotChatter no Ranked).
import { BOT_CHAT_BOT_COOLDOWN_MS, BOT_CHAT_DELAY_MS, DEFAULT_BOT_CHAT, type BotChatConfig, type BotChatEvent } from '@outgun/settings';
import type { Rng } from '@outgun/sim';

/** Configuração da moderação (aba Bots), trocada pelo painel. */
let panelBotChat: BotChatConfig = DEFAULT_BOT_CHAT;
export function setPanelBotChat(config: BotChatConfig): void {
  panelBotChat = config;
}

export interface BotChatContext {
  /** Time do acontecimento (quem capturou, quem levou a captura, quem venceu...). */
  team?: 0 | 1;
  /** Jogador envolvido: fala ele, se for bot e a regra pedir. */
  involved?: number;
  /** Nome que entra no `{name}` (o outro jogador do acontecimento). */
  name?: string;
}

export interface BotChatOptions {
  rng: Rng;
  /** Relógio em ms (o da sala). */
  now: () => number;
  /** Bots presentes e o time de cada um. */
  bots: () => readonly { pid: number; team: number }[];
  say: (pid: number, text: string) => void;
  config?: () => BotChatConfig;
}

const MINUTE_MS = 60_000;

export class BotChatter {
  private readonly queue: { at: number; pid: number; text: string }[] = [];
  /** Momento das falas (enviadas ou na fila) do último minuto, para o teto da sala. */
  private readonly recent: number[] = [];
  private readonly lastSpoke = new Map<number, number>();
  private lastSpeaker = -1;
  private lastText = '';

  constructor(private readonly o: BotChatOptions) {}

  private config(): BotChatConfig {
    return this.o.config?.() ?? panelBotChat;
  }

  /** Um acontecimento da partida: talvez um bot comente. */
  event(kind: BotChatEvent, ctx: BotChatContext = {}): void {
    const config = this.config();
    const rule = config.events[kind];
    if (!config.enabled || !rule || rule.messages.length === 0 || rule.chance <= 0) return;
    const now = this.o.now();
    while (this.recent.length > 0 && now - this.recent[0]! >= MINUTE_MS) this.recent.shift();
    if (this.recent.length >= config.perMinute) return;
    if (this.o.rng.rand() % 100 >= rule.chance) return;
    const free = this.o.bots().filter((b) => b.pid !== this.lastSpeaker && now - (this.lastSpoke.get(b.pid) ?? -Infinity) >= BOT_CHAT_BOT_COOLDOWN_MS);
    const team = (b: { team: number }) => ctx.team === undefined || b.team === ctx.team;
    const pool =
      rule.speaker === 'involved'
        ? free.some((b) => b.pid === ctx.involved)
          ? free.filter((b) => b.pid === ctx.involved)
          : free.filter(team)
        : rule.speaker === 'team'
          ? free.filter(team)
          : rule.speaker === 'enemy'
            ? free.filter((b) => ctx.team === undefined || b.team !== ctx.team)
            : free;
    if (pool.length === 0) return;
    const speaker = pool[this.o.rng.rand() % pool.length]!;
    // `{name}` sem nome (ou o próprio bot) não faz sentido: fica só com as mensagens sem ele
    const options = rule.messages.filter((m) => (ctx.name ? true : !m.includes('{name}')) && m !== this.lastText);
    if (options.length === 0) return;
    const text = options[this.o.rng.rand() % options.length]!.replaceAll('{name}', ctx.name ?? '');
    const [lo, hi] = BOT_CHAT_DELAY_MS;
    this.queue.push({ at: now + lo + (this.o.rng.rand() % (hi - lo + 1)), pid: speaker.pid, text });
    this.recent.push(now);
    this.lastSpoke.set(speaker.pid, now);
    this.lastSpeaker = speaker.pid;
    this.lastText = text;
  }

  /** Solta as falas cujo atraso passou (o bot precisa ainda estar na sala). */
  tick(): void {
    if (this.queue.length === 0) return;
    const now = this.o.now();
    const present = new Set(this.o.bots().map((b) => b.pid));
    for (let i = 0; i < this.queue.length; ) {
      const q = this.queue[i]!;
      if (q.at > now) {
        i++;
        continue;
      }
      this.queue.splice(i, 1);
      if (present.has(q.pid)) this.o.say(q.pid, q.text);
    }
  }

  /** Bot saiu: some da fila e das esperas. */
  forget(pid: number): void {
    for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i]!.pid === pid) this.queue.splice(i, 1);
    this.lastSpoke.delete(pid);
    if (this.lastSpeaker === pid) this.lastSpeaker = -1;
  }
}

/** Sequências e "morreu de novo para o mesmo" de uma partida (zeram a cada mapa). */
export class BotChatTally {
  private readonly streak = new Map<number, number>();
  private readonly deathsBy = new Map<string, number>();
  private leader: -1 | 0 | 1 = -1;
  private readonly trailed: [boolean, boolean] = [false, false];

  reset(): void {
    this.streak.clear();
    this.deathsBy.clear();
    this.leader = -1;
    this.trailed[0] = this.trailed[1] = false;
  }

  /** Abate: devolve a sequência do matador (5, 10, 15... avisam) e quantas vezes a vítima morreu para ele. */
  kill(attacker: number, target: number): { streak: number; repeat: number } {
    this.streak.set(target, 0);
    if (attacker === target) return { streak: 0, repeat: 0 };
    const streak = (this.streak.get(attacker) ?? 0) + 1;
    this.streak.set(attacker, streak);
    const key = `${target}:${attacker}`;
    const repeat = (this.deathsBy.get(key) ?? 0) + 1;
    this.deathsBy.set(key, repeat);
    return { streak, repeat };
  }

  forget(pid: number): void {
    this.streak.delete(pid);
    for (const key of [...this.deathsBy.keys()]) if (key.startsWith(`${pid}:`) || key.endsWith(`:${pid}`)) this.deathsBy.delete(key);
  }

  /** Placar: o time que acabou de virar (estava atrás e passou à frente), ou null. */
  score(red: number, blue: number): 0 | 1 | null {
    const leader = red > blue ? 0 : blue > red ? 1 : -1;
    if (leader === -1) return null;
    this.trailed[(1 - leader) as 0 | 1] = true;
    const turned = leader !== this.leader && this.trailed[leader] ? leader : null;
    this.leader = leader;
    return turned;
  }
}
