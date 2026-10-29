// SPDX-License-Identifier: GPL-2.0-or-later
// "Copiar link" (OG-511): a área de transferência pode negar a escrita (app desktop, aba sem foco);
// aí tenta o `execCommand('copy')` e devolve se deu, sem promessa rejeitada para o Sentry.

/** Copia o texto; `true` se deu certo. Nunca rejeita. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // sem permissão: tenta o jeito antigo
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
