// SPDX-License-Identifier: GPL-2.0-or-later
// Id aleatório deste navegador (OG-104), mandado ao pedir entrada numa sala: a API guarda só um
// hash dele, para o ban por dispositivo (RN-PLT-05). Não identifica a pessoa nem sai daqui para
// outro lugar; limpar os dados do site gera outro.
const KEY = 'outgun.device';

export function deviceId(): string | undefined {
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      const bytes = crypto.getRandomValues(new Uint8Array(18));
      id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return undefined; // sem localStorage (janela privada restrita): entra sem id
  }
}
