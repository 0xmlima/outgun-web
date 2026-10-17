// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { scoreboardOrder } from './online-hud.js';

const p = (pid: number, team: number, frags: number) => ({ pid, team, frags });
const pids = (list: { pid: number }[]) => list.map((x) => x.pid);

describe('ordem do placar (OG-317, compare_players do original)', () => {
  it('vermelho antes do azul, mais frags primeiro', () => {
    // a captura do PO: vermelho 13, 16, 21, 18 e azul 18, 18, 11, 22 na ordem de entrada
    const list = [p(0, 0, 13), p(1, 0, 16), p(2, 0, 21), p(3, 0, 18), p(4, 1, 18), p(5, 1, 18), p(6, 1, 11), p(7, 1, 22)];
    const out = scoreboardOrder(list, []);
    expect(out.map((x) => x.frags)).toEqual([21, 18, 16, 13, 22, 18, 18, 11]);
    expect(pids(out)).toEqual([2, 3, 1, 0, 7, 4, 5, 6]);
  });

  it('no empate mantém a ordem do quadro anterior, sem trocar de lugar', () => {
    const list = [p(1, 0, 5), p(2, 0, 5), p(3, 0, 5)];
    expect(pids(scoreboardOrder(list, [3, 1, 2]))).toEqual([3, 1, 2]);
    // quem passa à frente sobe; os empatados restantes seguem como estavam
    const after = [p(1, 0, 5), p(2, 0, 6), p(3, 0, 5)];
    expect(pids(scoreboardOrder(after, [3, 1, 2]))).toEqual([2, 3, 1]);
  });

  it('quem acabou de entrar vai para o fim do grupo de mesmo placar', () => {
    const list = [p(9, 1, 0), p(4, 1, 0), p(6, 1, 3)];
    expect(pids(scoreboardOrder(list, [4]))).toEqual([6, 4, 9]);
  });

  it('não altera a lista recebida', () => {
    const list = [p(1, 0, 1), p(2, 0, 2)];
    scoreboardOrder(list, []);
    expect(pids(list)).toEqual([1, 2]);
  });
});
