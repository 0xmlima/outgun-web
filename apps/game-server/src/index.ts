// SPDX-License-Identifier: GPL-2.0-or-later
import { FRAMES_PER_SECOND } from '@outgun/sim';
import { PROTOCOL_VERSION } from '@outgun/protocol';

/** Placeholder até o OG-040: confirma que o servidor enxerga os pacotes compartilhados. */
export function describeServer(): string {
  return `outgun game-server (protocolo v${PROTOCOL_VERSION}, ${FRAMES_PER_SECOND} Hz)`;
}
