// SPDX-License-Identifier: GPL-2.0-or-later
/** Tamanho de uma sala: definido uma única vez em @outgun/sim (src/commont.h:282). */
export { ROOM_HEIGHT, ROOM_WIDTH } from '@outgun/sim';

export { LICENSE_SPDX, ORIGINAL_CREDITS, WEB_CREDITS, type CreditGroup } from './credits.js';
export { hawkCrc16 } from './map/crc16.js';
export { decodeMapFile, parseMap, parseMapFile, type MapParseResult } from './map/parser.js';
export { generateRandomMap, MapGenerator, type MapgenBlock, type RandomMapParams, type Symmetry } from './map/mapgen.js';
export { DATA_INVENTORY, PRIVACY_SECTIONS, PRIVACY_VERSION, TABLES, TERMS_SECTIONS, TERMS_VERSION, type Bilingual, type DataItem, type LegalLocale, type LegalSection } from './privacy.js';
export { ACCURACY_MIN_SHOTS, COMEBACK_DEFICIT, DAYS_STREAK, DUO_MATCHES, ELITE_ACCURACY_MIN_SHOTS, MAPS_TARGETS, MILESTONE_TOTALS, mapKey, MILESTONES, milestoneProgress, milestonesFrom, milestoneTarget, PIONEER_UNTIL, steamAchievementName, type Achieved, type ClanWarMatch, type Milestone, type MilestoneCounter, type MilestoneGroup, type MilestoneMatch } from './milestones.js';
export { MULTI_KILL_WINDOW, WILD_FLAG, type MilestoneEvent, type MilestoneEvents } from './milestone-events.js';
export { MILESTONE_GROUP_COLORS, MILESTONE_ICON_SYMBOLS, MILESTONE_SYMBOLS, milestoneIconSpec, milestoneIconSvg, milestoneTier, publicMilestoneIcon, secretMilestoneIcon, type MilestoneIconSpec, type MilestoneSymbol } from './milestone-icons.js';
