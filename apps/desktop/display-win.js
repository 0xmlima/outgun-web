// SPDX-License-Identifier: GPL-2.0-or-later
// Resolução do monitor no Windows (OG-401): como os jogos antigos, o cliente troca o modo do monitor
// principal ao entrar em tela cheia e devolve o do sistema ao sair dela, perder o foco ou fechar. A
// troca é temporária (CDS_FULLSCREEN): não vai para o registro, e o Windows volta ao modo gravado se
// o processo morrer. Chama o user32 pela koffi (FFI, sem compilar nada); fora do Windows não carrega.
import { createRequire } from 'node:module';

// DEVMODEW (wingdi.h): 220 bytes; só os campos usados
const DEVMODE_SIZE = 220;
const AT = { size: 68, fields: 72, bitsPerPel: 168, width: 172, height: 176, frequency: 184 };
const DM_BITSPERPEL = 0x40000;
const DM_PELSWIDTH = 0x80000;
const DM_PELSHEIGHT = 0x100000;
const DM_DISPLAYFREQUENCY = 0x400000;
const ENUM_REGISTRY_SETTINGS = 0xfffffffe; // (DWORD)-2: o modo gravado do sistema
const CDS_FULLSCREEN = 0x4;
const DISP_CHANGE_SUCCESSFUL = 0;

/** @typedef {{ width: number; height: number; hz: number }} DisplayMode */

/** @type {{ enumSettings: Function; changeSettings: Function } | null | undefined} */
let user32;
function api() {
  if (user32 !== undefined) return user32;
  user32 = null;
  if (process.platform !== 'win32') return user32;
  try {
    const koffi = createRequire(import.meta.url)('koffi');
    const lib = koffi.load('user32.dll');
    user32 = {
      enumSettings: lib.func(
        'int __stdcall EnumDisplaySettingsW(const char16_t *name, uint32_t mode, void *devmode)',
      ),
      changeSettings: lib.func(
        'int32_t __stdcall ChangeDisplaySettingsExW(const char16_t *name, void *devmode, void *hwnd, uint32_t flags, void *param)',
      ),
    };
  } catch (error) {
    console.error('Resolução do monitor indisponível:', error);
  }
  return user32;
}

/** "1920x1080@144" ⇄ modo. */
export const formatMode = (m) => `${m.width}x${m.height}@${m.hz}`;
/** @returns {DisplayMode | null} */
export function parseMode(text) {
  const m = /^(\d{3,5})x(\d{3,5})@(\d{2,3})$/.exec(String(text ?? '').trim());
  return m ? { width: Number(m[1]), height: Number(m[2]), hz: Number(m[3]) } : null;
}

function devmode() {
  const buf = Buffer.alloc(DEVMODE_SIZE);
  buf.writeUInt16LE(DEVMODE_SIZE, AT.size);
  return buf;
}
const read = (buf) => ({
  width: buf.readUInt32LE(AT.width),
  height: buf.readUInt32LE(AT.height),
  hz: buf.readUInt32LE(AT.frequency),
});

/** Modos de 32 bits do monitor principal, do maior para o menor (e a taxa maior primeiro). */
export function listModes() {
  const u = api();
  if (!u) return [];
  const seen = new Map();
  for (let i = 0; i < 4000; i++) {
    const buf = devmode();
    if (!u.enumSettings(null, i, buf)) break;
    if (buf.readUInt32LE(AT.bitsPerPel) < 32) continue;
    const m = read(buf);
    if (m.width >= 640 && m.height >= 480 && m.hz > 1) seen.set(formatMode(m), m);
  }
  return [...seen.values()].sort(
    (a, b) => b.width * b.height - a.width * a.height || b.width - a.width || b.hz - a.hz,
  );
}

/** O modo gravado do sistema (a resolução "normal" da área de trabalho). */
export function systemMode() {
  const u = api();
  const buf = devmode();
  return u && u.enumSettings(null, ENUM_REGISTRY_SETTINGS, buf) ? read(buf) : null;
}

/** Troca o monitor principal para `m` até `restoreMode()`; true se o Windows aceitou. */
export function applyMode(m) {
  const u = api();
  if (!u) return false;
  const buf = devmode();
  buf.writeUInt32LE(DM_BITSPERPEL | DM_PELSWIDTH | DM_PELSHEIGHT | DM_DISPLAYFREQUENCY, AT.fields);
  buf.writeUInt32LE(32, AT.bitsPerPel);
  buf.writeUInt32LE(m.width, AT.width);
  buf.writeUInt32LE(m.height, AT.height);
  buf.writeUInt32LE(m.hz, AT.frequency);
  return u.changeSettings(null, buf, null, CDS_FULLSCREEN, null) === DISP_CHANGE_SUCCESSFUL;
}

/** Volta ao modo gravado do sistema. */
export function restoreMode() {
  const u = api();
  return u ? u.changeSettings(null, null, null, 0, null) === DISP_CHANGE_SUCCESSFUL : false;
}
