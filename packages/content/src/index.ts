// SPDX-License-Identifier: GPL-2.0-or-later
/** Tamanho de uma sala: definido uma única vez em @outgun/sim (src/commont.h:282). */
export { ROOM_HEIGHT, ROOM_WIDTH } from '@outgun/sim';

export { LICENSE_SPDX, ORIGINAL_CREDITS, type CreditGroup } from './credits.js';
export { hawkCrc16 } from './map/crc16.js';
export { decodeMapFile, parseMap, parseMapFile, type MapParseResult } from './map/parser.js';
export { generateRandomMap, MapGenerator, type MapgenBlock, type RandomMapParams, type Symmetry } from './map/mapgen.js';
