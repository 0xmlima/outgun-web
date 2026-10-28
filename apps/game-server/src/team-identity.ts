// SPDX-License-Identifier: GPL-2.0-or-later
// Identidade do clã na partida (OG-408, RN-CLA-09, D-78): um lado vira o clã quando tem pelo menos 2
// humanos do mesmo clã e nenhum humano de outro clã (bots e humanos sem clã não contam). Decidido no
// começo de cada rodada e fixo até ela acabar. Cor: a primária; se ficar parecida com a do outro
// lado, a secundária; se também, a cor padrão do lado. Clã x clã: o lado azul (o segundo) é quem
// troca, então dois clãs com a mesma primária ficam "primária x secundária".
import { colourDistance, DEFAULT_TEAM_COLOURS, parseEmblem, TEAM_COLOUR_MIN_DISTANCE, type ClanEmblem } from '@outgun/protocol';

export interface ClanOfPlayer {
  id: string;
  tag: string;
  name: string;
  primary: string;
  secondary: string;
  /** Emblema do clã (OG-485); ausente em tickets antigos. */
  emblem?: unknown;
}

export interface SidePlayer {
  team: number;
  bot: boolean;
  clan: ClanOfPlayer | null;
}

export interface TeamIdentity {
  clanId: string;
  tag: string;
  name: string;
  /** `#RRGGBB`, ou null = a cor padrão do lado. */
  color: string | null;
  /** Emblema e as cores dele (OG-485): o do dia da partida, gravado no relatório. */
  emblem?: ClanEmblem;
  colors?: { primary: string; secondary: string };
}

export const MIN_CLAN_PLAYERS = 2;

/** O clã que o lado assume, se houver (sem as cores resolvidas). */
export function sideClan(players: readonly SidePlayer[], team: number): ClanOfPlayer | null {
  const clans = new Map<string, { clan: ClanOfPlayer; n: number }>();
  for (const p of players) {
    if (p.team !== team || p.bot || !p.clan) continue;
    const c = clans.get(p.clan.id) ?? { clan: p.clan, n: 0 };
    c.n++;
    clans.set(p.clan.id, c);
  }
  if (clans.size !== 1) return null; // nenhum clã, ou dois clãs no mesmo lado
  const only = [...clans.values()][0]!;
  return only.n >= MIN_CLAN_PLAYERS ? only.clan : null;
}

const far = (a: string, b: string) => colourDistance(a, b) >= TEAM_COLOUR_MIN_DISTANCE;

/** Cor do lado: a primária, a secundária ou null (padrão), longe de `other` (sem `other`, a primária). */
function pick(clan: ClanOfPlayer, other: string | null): string | null {
  if (other === null || far(clan.primary, other)) return clan.primary;
  if (far(clan.secondary, other)) return clan.secondary;
  return null;
}

/** As duas identidades da rodada ([vermelho, azul]). */
export function teamIdentities(players: readonly SidePlayer[]): [TeamIdentity | null, TeamIdentity | null] {
  const red = sideClan(players, 0);
  const blue = sideClan(players, 1);
  // o vermelho só se ajusta ao azul padrão; contra outro clã, quem troca é o azul
  const redColour = red ? pick(red, blue ? null : DEFAULT_TEAM_COLOURS[1]) : null;
  const blueColour = blue ? pick(blue, redColour ?? DEFAULT_TEAM_COLOURS[0]) : null;
  const identity = (c: ClanOfPlayer | null, color: string | null): TeamIdentity | null => {
    if (!c) return null;
    const emblem = parseEmblem(c.emblem);
    return { clanId: c.id, tag: c.tag, name: c.name, color, ...(emblem ? { emblem, colors: { primary: c.primary, secondary: c.secondary } } : {}) };
  };
  return [identity(red, redColour), identity(blue, blueColour)];
}
