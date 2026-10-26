// SPDX-License-Identifier: GPL-2.0-or-later
// Quadro protegido (OG-428): o PixiJS só pede o próximo quadro depois dos ouvintes do ticker, então
// um erro no desenho congelava a tela para sempre, com a rede e o teclado ainda vivos. O quadro com
// erro se perde e o próximo segue; cada mensagem de erro é relatada uma vez só.
export function guardFrame<A extends unknown[]>(draw: (...args: A) => void, report: (err: unknown) => void): (...args: A) => void {
  const reported = new Set<string>();
  return (...args) => {
    try {
      draw(...args);
    } catch (err) {
      const key = err instanceof Error ? err.message : String(err);
      if (reported.has(key)) return;
      reported.add(key);
      report(err);
    }
  };
}
