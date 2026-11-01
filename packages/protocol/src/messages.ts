// SPDX-License-Identifier: GPL-2.0-or-later
// Catálogo de mensagens do protocolo web v1, mapeado de `Network_data_code` (src/protocol.h) e dos
// codificadores de src/servnet.cpp / src/client.cpp. Cada mensagem tem um código (u8), direção,
// canal e a origem no original; MESSAGES.md é gerado desta tabela (`pnpm --filter @outgun/protocol gen:messages`).
//
// Divergências de forma (o conteúdo é o mesmo do original):
// - campos empacotados em bits no original (pid | flags) viram campos separados;
// - posições de jogadores no frame vão como f32 (o original usa 12 bits por eixo e velocidade em
//   1 byte): o cliente web prediz com a mesma sim do servidor e precisa do estado exato do próprio
//   jogador (f64) para reconciliar;
// - configurações vão como texto de gamemod (preset + overrides), que o cliente aplica com
//   @outgun/settings, em vez do subconjunto binário de `data_server_settings`;
// - mensagens de compatibilidade entre versões, download de mapas (vira HTTP), autenticação e
//   ranking antigos (viram a API) não existem.
import {
  bool,
  enumOf,
  f32,
  f64,
  i16,
  i32,
  list,
  optional,
  pid,
  pidOrNone,
  str,
  struct,
  u16,
  u32,
  u8,
  type Fields,
  type InferFields,
} from './codec.js';

export type Direction = 'c2s' | 's2c';
/** `frame`: estado por frame (o mais novo substitui o anterior); `event`: confiável e em ordem. */
export type Channel = 'frame' | 'event';

export interface MessageDef<F extends Fields = Fields> {
  readonly code: number;
  readonly dir: Direction;
  readonly channel: Channel;
  /** Origem no original (código de `Network_data_code` e/ou função). */
  readonly origin: string;
  readonly doc: string;
  readonly fields: F;
}

function msg<F extends Fields>(
  code: number,
  dir: Direction,
  channel: Channel,
  origin: string,
  doc: string,
  fields: F,
): MessageDef<F> {
  return { code, dir, channel, origin, doc, fields };
}

const roomX = u8;
const roomY = u8;
/** Bandeira carregada (`Statistics::FlagType`). */
const flagType = enumOf('none', 'own', 'enemy', 'wild');
const team = enumOf('red', 'blue');
/** Time da bandeira: vermelho, azul ou selvagem (índices 0, 1, 2 do original). */
const flagTeam = enumOf('red', 'blue', 'wild');
const powerupKind = enumOf(
  'shield',
  'turbo',
  'shadow',
  'power',
  'weapon',
  'megahealth',
  'deathbringer',
);

/** Jogador visível no frame (bloco por jogador de `broadcast_frame`). */
const framePlayer = struct(
  {
    pid,
    x: f32,
    y: f32,
    vx: f32,
    vy: f32,
    dead: bool,
    deathbringer: bool,
    /** Sob efeito de deathbringer de outro jogador. */
    deathbringerAffected: bool,
    shield: bool,
    turbo: bool,
    power: bool,
    /** Bits de `CONTROL` (cima 1, baixo 2, esquerda 4, direita 8, correr 16, strafe 32). */
    controls: u8,
    /** Direção da arma em 1/256 de oitavo (`GunDirection::toNetworkLongForm`, 0..2047). */
    gundir: u16,
    /** Alpha 0..255 (proteção de spawn pisca entre 128 e 220). */
    visibility: u8,
  },
  'jogador no frame',
);

/** Estado exato do próprio jogador para predição e reconciliação (o original manda vida/energia). */
/** Jogador no frame do replay: o bloco do frame com a sala (o replay vê o mapa inteiro). */
const replayPlayer = struct(
  {
    pid,
    roomX,
    roomY,
    x: f32,
    y: f32,
    vx: f32,
    vy: f32,
    dead: bool,
    deathbringer: bool,
    deathbringerAffected: bool,
    shield: bool,
    turbo: bool,
    power: bool,
    controls: u8,
    gundir: u16,
    visibility: u8,
  },
  'jogador no replay',
);

const frameSelf = struct(
  {
    roomX,
    roomY,
    x: f64,
    y: f64,
    vx: f64,
    vy: f64,
    health: u16,
    energy: u16,
  },
  'próprio jogador',
);

const minimapPlayer = struct(
  { pid, x: u8, y: u8 },
  'posição no minimapa (`writeMinimapPlayerPosition`)',
);

const flagState = struct(
  {
    carried: bool,
    /** Portador, se carregada (senão 255). */
    carrier: pidOrNone,
    roomX,
    roomY,
    x: i16,
    y: i16,
  },
  'bandeira',
);

const playerStats = struct(
  {
    pid,
    carriedFlag: flagType,
    dead: bool,
    frags: i32,
    kills: u32,
    deaths: u32,
    consKills: u32,
    curConsKills: u32,
    consDeaths: u32,
    curConsDeaths: u32,
    suicides: u32,
    captures: u32,
    assists: u32,
    flagsTaken: u32,
    flagsDropped: u32,
    flagsReturned: u32,
    carriersKilled: u32,
    /** Segundos inteiros, como no original. */
    playtime: u32,
    lifetime: u32,
    flagCarryingTime: u32,
  },
  'estatísticas do jogador (`data_stats`)',
);

const movementShots = struct(
  { movement: u32, shots: u32, hits: u32, shotsTaken: u32 },
  'movimento (px) e tiros',
);

const mapInfo = struct(
  { file: str(64), title: str(64), author: str(64), width: u8, height: u8, votes: u8 },
  'mapa da rotação',
);

export const MESSAGES = {
  // ------------------------------------------------------------ conexão
  hello: msg(
    1,
    'c2s',
    'event',
    'conexão leetnet + `GAME_PROTOCOL` (`clientHello`)',
    'Primeira mensagem do cliente: versão do protocolo e ticket da API (JWT).',
    {
      protocol: u16,
      ticket: str(4096),
      client: str(64),
    },
  ),
  welcome: msg(
    2,
    's2c',
    'event',
    '`data_first_packet` (`send_me_packet`)',
    'Aceito na sala: quem sou, mapa atual e placar.',
    {
      protocol: u16,
      pid,
      color: u8,
      maxPlayers: u8,
      mode: enumOf('casual', 'ranked'),
      mapIndex: u16,
      redScore: u32,
      blueScore: u32,
    },
  ),
  reject: msg(
    3,
    's2c',
    'event',
    '`Connect_rejection_reason`',
    'Conexão recusada (a conexão é fechada em seguida).',
    {
      reason: enumOf(
        'serverFull',
        'banned',
        'passwordNeeded',
        'wrongPassword',
        'protocolMismatch',
        'invalidTicket',
        'rankedNeedsAccount',
        'roomClosed',
      ),
      text: str(256),
    },
  ),
  disconnecting: msg(
    4,
    's2c',
    'event',
    '`data_disconnecting`, `Disconnect_reason`',
    'O servidor vai desconectar o jogador.',
    {
      reason: enumOf('kick', 'idleKick', 'misbehavior', 'shutdown'),
      seconds: u16,
    },
  ),
  idleKickWarning: msg(
    5,
    's2c',
    'event',
    '`data_idlekick_warning`',
    'Aviso de expulsão por inatividade.',
    { seconds: u16 },
  ),
  resumeToken: msg(
    7,
    's2c',
    'event',
    '— (novo, OG-047)',
    'Token para voltar à mesma vaga depois de uma queda de conexão (até 15 s).',
    { token: str(64) },
  ),
  resume: msg(
    8,
    'c2s',
    'event',
    '— (novo, OG-047)',
    'Junto com o `hello`: pede de volta a vaga deixada numa queda de conexão.',
    { token: str(64) },
  ),
  serverSettings: msg(
    6,
    's2c',
    'event',
    '`data_server_settings`',
    'Configurações da sala: preset e gamemod completo (o cliente aplica com @outgun/settings).',
    {
      preset: str(32),
      gamemod: str(16384),
      locked: bool,
    },
  ),

  // ------------------------------------------------------------ entrada do cliente
  input: msg(
    10,
    'c2s',
    'frame',
    'dados de frame do cliente (`incoming_client_data`)',
    'Controles do frame; enviado a cada frame do cliente.',
    {
      /** Número do frame do cliente (u8 cíclico), ecoado no frame do servidor. */
      clientFrame: u8,
      controls: u8,
      /** Direção da arma (0..2047); bit 0x800 = aceleração relativa à arma. */
      gundir: u16,
    },
  ),
  fire: msg(
    11,
    'c2s',
    'event',
    '`data_fire_on` / `data_fire_off`',
    'Botão de tiro pressionado ou solto.',
    { on: bool },
  ),
  dropFlag: msg(
    12,
    'c2s',
    'event',
    '`data_drop_flag` / `data_stop_drop_flag`',
    'Tecla de largar bandeira.',
    { on: bool },
  ),
  suicide: msg(13, 'c2s', 'event', '`data_suicide`', 'Suicídio.', {}),
  changeTeam: msg(
    14,
    'c2s',
    'event',
    '`data_change_team_on` / `data_change_team_off`',
    'Quer trocar de time.',
    { on: bool },
  ),
  mapExit: msg(
    15,
    'c2s',
    'event',
    '`data_map_exit_on` / `data_map_exit_off`',
    'Voto para sair do mapa.',
    { on: bool },
  ),
  clientReady: msg(
    16,
    'c2s',
    'event',
    '`data_client_ready`',
    'Cliente carregou o mapa e pode nascer.',
    {},
  ),
  mapVote: msg(17, 'c2s', 'event', '`data_map_vote`', 'Voto no próximo mapa (−1 = nenhum).', {
    map: i16,
  }),
  negativeMapVotes: msg(
    18,
    'c2s',
    'event',
    '`data_negative_map_votes`',
    'Mapas que o jogador não quer.',
    { maps: list(u16, 1024) },
  ),
  chat: msg(19, 'c2s', 'event', '`data_text_message`', 'Mensagem de chat ou comando (/...).', {
    text: str(512),
    teamOnly: bool,
  }),
  setName: msg(
    20,
    'c2s',
    'event',
    '`data_name_update`',
    'Troca de nome (convidados; contas usam o nome da conta).',
    { name: str(64) },
  ),
  favoriteColors: msg(21, 'c2s', 'event', '`data_fav_colors`', 'Cores preferidas, em ordem.', {
    colors: list(u8, 35),
  }),
  minimapBandwidth: msg(
    22,
    'c2s',
    'event',
    '`data_set_minimap_player_bandwidth`',
    'Jogadores no minimapa por frame.',
    { playersPerFrame: u8 },
  ),

  // ------------------------------------------------------------ frame
  frame: msg(
    30,
    's2c',
    'frame',
    '`broadcast_frame`',
    'Estado do frame para um jogador: quem está na mesma sala, minimapa e o próprio estado.',
    {
      frame: u32,
      /** Último `clientFrame` recebido e atraso dentro do frame (0..255 = 0..0,996 frame). */
      lastClientFrame: u8,
      frameOffset: u8,
      /** Cliente não pronto ou placar de fim de partida: só o cabeçalho. */
      skipped: bool,
      self: optional(frameSelf),
      players: list(framePlayer, 32),
      minimap: list(minimapPlayer, 32),
      /** Ping de um jogador por frame (rodízio), em ms. */
      ping: optional(struct({ pid, ms: u16 }, 'ping')),
    },
  ),

  replayFrame: msg(
    31,
    's2c',
    'frame',
    '`record_message` (bloco do frame do replay)',
    'Frame do replay (OG-090): todos os jogadores, de todas as salas, para um espectador onisciente.',
    {
      frame: u32,
      players: list(replayPlayer, 32),
    },
  ),
  spectatorStart: msg(
    32,
    's2c',
    'event',
    'espectador do relay (`spectating_delay`)',
    'Espectador ao vivo (OG-092): começa uma partida; em seguida vêm o estado inicial e os frames do replay, com o atraso da sala.',
    {
      protocol: u16,
      maxPlayers: u8,
      /** Atraso em segundos (`spectating_delay`). */
      delay: u16,
      map: str(64),
      mapTitle: str(64),
    },
  ),

  // ------------------------------------------------------------ jogadores
  playerJoined: msg(
    40,
    's2c',
    'event',
    '`data_new_player` + `data_name_update` + `data_bot`',
    'Jogador entrou na sala.',
    {
      pid,
      name: str(64),
      color: u8,
      bot: bool,
    },
  ),
  playerLeft: msg(41, 's2c', 'event', '`data_player_left`', 'Jogador saiu.', { pid }),
  playerName: msg(42, 's2c', 'event', '`data_name_update`', 'Nome de um jogador.', {
    pid,
    name: str(64),
  }),
  playerInfo: msg(
    43,
    's2c',
    'event',
    '`data_crap_update`',
    'Cor, situação da conta e ranking de um jogador.',
    {
      pid,
      color: u8,
      loggedIn: bool,
      ranked: bool,
      admin: bool,
      rank: u32,
      score: i32,
      negScore: i32,
      rankedPlayers: u32,
    },
  ),
  teamChange: msg(
    44,
    's2c',
    'event',
    '`data_team_change`',
    'Jogador mudou de pid/time (troca de times); `swappedColor` 255 se não foi troca.',
    {
      from: pid,
      to: pid,
      color: u8,
      swappedColor: u8,
    },
  ),
  playersPresent: msg(45, 's2c', 'event', '`data_players_present`', 'Pids ocupados (ao entrar).', {
    pids: list(pid, 32),
  }),
  accelerationModes: msg(
    46,
    's2c',
    'event',
    '`data_acceleration_modes`',
    'Bit por pid: aceleração relativa à arma.',
    { mask: u32 },
  ),
  flagModes: msg(
    47,
    's2c',
    'event',
    '`data_flag_modes`',
    'Locks e capturas em efeito (`flagModeMask`).',
    {
      seeMinimapProperties: u8,
      carryOwnTeamFlag: bool,
      captureAwayFromBase: bool,
      lockTeamFlags: bool,
      lockWildFlags: bool,
      captureOnTeamFlags: bool,
      captureOnWildFlags: bool,
    },
  ),
  minimapProperties: msg(
    48,
    's2c',
    'event',
    '`data_minimap_player_properties`',
    'Power-ups de jogadores vistos no minimapa.',
    {
      players: list(struct({ pid, properties: u8 }, 'propriedades'), 32),
    },
  ),

  // ------------------------------------------------------------ mundo
  flagUpdate: msg(
    50,
    's2c',
    'event',
    '`data_flag_update` (`ctf_net_flag_status`)',
    'Estado de todas as bandeiras de um time.',
    { team: flagTeam, flags: list(flagState, 64) },
  ),
  scoreUpdate: msg(51, 's2c', 'event', '`data_score_update`', 'Placar de um time.', {
    team,
    score: u32,
  }),
  rocketFire: msg(
    52,
    's2c',
    'event',
    '`data_rocket_fire` (`sendRocketMessage`)',
    'Tiro: foguetes criados (o cliente os simula).',
    {
      owner: pid,
      rockets: list(u8, 9),
      gundir: u16,
      frame: u32,
      power: bool,
      roomX,
      roomY,
      x: i16,
      y: i16,
    },
  ),
  rocketVisible: msg(
    53,
    's2c',
    'event',
    '`data_old_rocket_visible`',
    'Foguete já em voo que entrou na visão.',
    {
      rocket: u8,
      team,
      power: bool,
      gundir: u16,
      frame: u32,
      roomX,
      roomY,
      x: i16,
      y: i16,
    },
  ),
  rocketDelete: msg(
    54,
    's2c',
    'event',
    '`data_rocket_delete`',
    'Foguete removido (bateu); alvo 255 = parede.',
    { rocket: u8, target: pidOrNone, x: i16, y: i16 },
  ),
  powerCollision: msg(
    55,
    's2c',
    'event',
    '`data_power_collision`',
    'Atropelamento com power (efeito na sala).',
    { pid },
  ),
  sound: msg(56, 's2c', 'event', '`data_sound`', 'Som do servidor (código de amostra).', {
    sample: u8,
  }),
  powerupVisible: msg(57, 's2c', 'event', '`data_pup_visible`', 'Power-up no chão.', {
    id: u8,
    kind: powerupKind,
    roomX,
    roomY,
    x: i16,
    y: i16,
  }),
  powerupPicked: msg(58, 's2c', 'event', '`data_pup_picked`', 'Power-up pego (some).', { id: u8 }),
  powerupTimer: msg(
    59,
    's2c',
    'event',
    '`data_pup_timer`',
    'Tempo restante de um power-up do jogador, em segundos.',
    { kind: powerupKind, seconds: u16 },
  ),
  weaponChange: msg(60, 's2c', 'event', '`data_weapon_change`', 'Nível de arma do jogador.', {
    level: u8,
  }),
  deathbringer: msg(61, 's2c', 'event', '`data_deathbringer`', 'Explosão de deathbringer.', {
    team,
    frame: u32,
    roomX,
    roomY,
    x: i16,
    y: i16,
  }),
  frags: msg(62, 's2c', 'event', '`data_frags_update`', 'Frags de um jogador.', {
    pid,
    frags: i32,
  }),
  kill: msg(63, 's2c', 'event', '`data_kill` (`broadcast_kill`)', 'Morte com atacante.', {
    attacker: pid,
    target: pid,
    cause: enumOf('rocket', 'deathbringer', 'collision'),
    carriedFlag: flagType,
    carrierDefended: bool,
    flagDefended: bool,
  }),
  suicideEvent: msg(64, 's2c', 'event', '`data_suicide` (`broadcast_suicide`)', 'Suicídio.', {
    pid,
    carriedFlag: flagType,
  }),
  capture: msg(65, 's2c', 'event', '`data_capture`', 'Captura.', {
    pid,
    flagTeam,
    assistant: pidOrNone,
  }),
  flagTake: msg(66, 's2c', 'event', '`data_flag_take`', 'Bandeira pega.', { pid, flag: flagType }),
  flagReturn: msg(67, 's2c', 'event', '`data_flag_return`', 'Bandeira devolvida.', { pid }),
  flagDrop: msg(
    68,
    's2c',
    'event',
    '`data_flag_drop`',
    'Bandeira largada de propósito ou entregue numa captura.',
    { pid, flag: flagType, captureDrop: bool },
  ),
  spawn: msg(69, 's2c', 'event', '`data_spawn`', 'Jogador nasceu.', { pid }),
  waitingTime: msg(70, 's2c', 'event', '`data_waiting_time`', 'Frames até poder nascer.', {
    frames: u32,
  }),

  // ------------------------------------------------------------ partida e mapas
  mapChange: msg(
    80,
    's2c',
    'event',
    '`data_map_change` (`send_map_change_message`)',
    'Novo mapa: o cliente baixa por HTTP se não tiver (CRC).',
    {
      reason: enumOf('captureLimit', 'timeOut', 'vote', 'admin', 'other'),
      mapIndex: u16,
      file: str(64),
      title: str(64),
      crc: u16,
    },
  ),
  mapChangeInfo: msg(81, 's2c', 'event', '`data_map_change_info`', 'Votos para trocar de mapa.', {
    votes: u8,
    needed: u8,
    voteBlockSeconds: u16,
  }),
  worldReset: msg(
    82,
    's2c',
    'event',
    '`data_world_reset`',
    'Mundo reiniciado (antes do placar).',
    {},
  ),
  gameOver: msg(83, 's2c', 'event', '`data_gameover_show`', 'Mostra o placar de fim de partida.', {
    reason: enumOf('captureLimit', 'timeOut', 'extraTimeOut'),
    seconds: u16,
  }),
  startGame: msg(84, 's2c', 'event', '`data_start_game`', 'Partida começou.', {}),
  mapTime: msg(
    85,
    's2c',
    'event',
    '`data_map_time` (`send_map_time`)',
    'Tempo de mapa e restante, em segundos.',
    { elapsed: u32, left: u32 },
  ),
  timeEvent: msg(
    86,
    's2c',
    'event',
    '`data_5_min_left`, `data_1_min_left`, `data_30_s_left`, `data_time_out`, `data_extra_time_out`, `data_normal_time_out`',
    'Avisos e fins de tempo.',
    {
      kind: enumOf(
        'fiveMinutesLeft',
        'oneMinuteLeft',
        'thirtySecondsLeft',
        'timeOut',
        'extraTimeOut',
        'normalTimeOut',
        'normalTimeOutSuddenDeath',
      ),
    },
  ),
  mapList: msg(
    87,
    's2c',
    'event',
    '`data_map_list`, `data_quick_map_list`, `data_reset_map_list`',
    'Rotação de mapas (lista completa; `revision` muda a cada alteração).',
    {
      revision: u16,
      maps: list(mapInfo, 1024),
    },
  ),
  mapVotes: msg(88, 's2c', 'event', '`data_map_votes_update`', 'Votos por mapa.', {
    votes: list(u8, 1024),
  }),
  currentMap: msg(89, 's2c', 'event', '`data_current_map`', 'Índice do mapa atual na rotação.', {
    mapIndex: u16,
  }),
  brokenMap: msg(
    90,
    's2c',
    'event',
    '`data_broken_map`',
    'O mapa atual tem erro e será trocado.',
    {},
  ),

  // ------------------------------------------------------------ estatísticas
  stats: msg(100, 's2c', 'event', '`data_stats` (`send_stats`)', 'Estatísticas de um jogador.', {
    stats: playerStats,
  }),
  movementShots: msg(
    101,
    's2c',
    'event',
    '`data_movements_shots`',
    'Movimento e tiros de um jogador.',
    { pid, data: movementShots },
  ),
  teamMovementShots: msg(
    102,
    's2c',
    'event',
    '`data_team_movements_shots`',
    'Movimento e tiros dos dois times.',
    { red: movementShots, blue: movementShots },
  ),
  teamStats: msg(
    103,
    's2c',
    'event',
    '`data_team_stats`',
    'Contadores de um time e capturas (tempo em s, capturador, assistente).',
    {
      team,
      kills: u32,
      deaths: u32,
      suicides: u32,
      flagsTaken: u32,
      flagsDropped: u32,
      flagsReturned: u32,
      captures: list(struct({ time: u32, pid, assistant: pidOrNone }, 'captura'), 1024),
    },
  ),
  statsReady: msg(
    104,
    's2c',
    'event',
    '`data_stats_ready`',
    'Estatísticas finais enviadas (fim de partida).',
    {},
  ),

  // ------------------------------------------------------------ chat e moderação
  text: msg(
    110,
    's2c',
    'event',
    '`data_text_message` (`Message_type`)',
    'Texto para o jogador (chat, avisos do servidor).',
    {
      kind: enumOf('normal', 'team', 'info', 'header', 'warning', 'server', 'admin'),
      from: pidOrNone,
      text: str(1024),
    },
  ),
  tooMuchTalk: msg(
    111,
    's2c',
    'event',
    '`data_too_much_talk`',
    'Anti-flood: mensagem descartada.',
    {},
  ),
  muted: msg(112, 's2c', 'event', '`data_mute_notification`', 'Você está silenciado.', {}),
  playerMute: msg(
    113,
    's2c',
    'event',
    '`data_player_mute`',
    'Jogador silenciado/liberado por um admin.',
    { pid, mode: u8, admin: str(64) },
  ),
  playerKick: msg(114, 's2c', 'event', '`data_player_kick`', 'Jogador expulso por um admin.', {
    pid,
    minutes: u16,
    admin: str(64),
  }),
  rankingUpdateFailed: msg(
    115,
    's2c',
    'event',
    '`data_ranking_update_failed`',
    'Falha ao registrar o resultado no ranking.',
    {},
  ),
  // --- lobby Ranked (OG-252..254, web): sem equivalente no original ---
  lobbyState: msg(
    120,
    's2c',
    'event',
    '— (web, OG-252)',
    'Estado do lobby da sala Ranked: fase, série, prazo, voto/"Pronto" de cada um e pedidos de troca de lado.',
    {
      phase: enumOf('lobby', 'vote', 'ready', 'countdown', 'game', 'finished'),
      teamSize: u8,
      bestOf: u8,
      gameNo: u8,
      seriesRed: u8,
      seriesBlue: u8,
      seconds: u16,
      chosenMap: i16,
      members: list(struct({ pid, ready: bool, vote: i16 }, 'membro do lobby'), 32),
      swaps: list(struct({ from: pid, to: pid }, 'pedido de troca de lado'), 32),
    },
  ),
  lobbyReady: msg(121, 'c2s', 'event', '— (web, OG-254)', 'Marca ou desmarca "Pronto" no lobby Ranked.', {
    ready: bool,
  }),
  lobbyVote: msg(122, 'c2s', 'event', '— (web, OG-254)', 'Voto de mapa no lobby Ranked (índice na rotação; −1 = nenhum).', {
    map: i16,
  }),
  lobbySide: msg(
    123,
    'c2s',
    'event',
    '— (web, OG-253)',
    'Troca de lado no lobby: sem alvo, vai para a vaga livre do outro lado; com alvo, pede para trocar com ele.',
    { target: pidOrNone },
  ),
  lobbySwapAnswer: msg(124, 'c2s', 'event', '— (web, OG-253)', 'Resposta a um pedido de troca de lado.', {
    from: pid,
    accept: bool,
  }),
  // --- clã no HUD (OG-206, RN-NOM-04): sem equivalente no original ---
  playerClan: msg(125, 's2c', 'event', '— (web, OG-206)', 'Tag do clã cadastrado de um jogador, já decorada pelo estilo do clã: "(Dk)", "Dk." (OG-338). Logo depois do `playerJoined`; sem clã, não vem.', {
    pid,
    tag: str(8),
  }),
  // --- pausa no Ranked (OG-260..262, D-45/D-46): sem equivalente no original ---
  pauseState: msg(
    126,
    's2c',
    'event',
    '— (web, OG-260)',
    'Pausa do jogo Ranked: fase (sem pausa, pausado ou contagem de retomada), motivo (pedido do time, queda ou voto do bot substituto), time e quem pediu/caiu/saiu, segundos restantes (saldo do time, prazo de reconexão, voto ou contagem), o saldo de pausa de cada time e, no voto, os votos de cada opção.',
    {
      phase: enumOf('none', 'paused', 'resuming'),
      reason: enumOf('team', 'drop', 'vote'),
      team: u8,
      by: pidOrNone,
      seconds: u16,
      redSeconds: u8,
      redRequests: u8,
      blueSeconds: u8,
      blueRequests: u8,
      votesBot: u8,
      votesShort: u8,
    },
  ),
  pauseRequest: msg(127, 'c2s', 'event', '— (web, OG-260)', 'Pede a pausa tática do time (on) ou a retomada (off); só no Ranked.', {
    on: bool,
  }),
  substituteVote: msg(128, 'c2s', 'event', '— (web, OG-262)', 'Voto do time desfalcado: bot no lugar (bot) ou seguir com um a menos.', {
    bot: bool,
  }),
  // --- bots da sala Casual pelo cliente (OG-289, D-51): sem equivalente no original ---
  casualBots: msg(
    129,
    'c2s',
    'event',
    '— (web, OG-289)',
    'Dono da sala privada ou admin: quantidade de bots e nível (1–5; 0 = variável) para a próxima partida; com `restart`, reinicia já.',
    { bots: u8, level: u8, restart: bool },
  ),
  casualConfig: msg(
    130,
    's2c',
    'event',
    '— (web, OG-289)',
    'Só para o dono e admins numa sala Casual (a chegada habilita a configuração no cliente): bots e nível em vigor e se há mudança pendente para a próxima partida.',
    { bots: u8, level: u8, pending: bool },
  ),
  // --- identidade do clã na partida (OG-408, D-78): sem equivalente no original ---
  teamIdentity: msg(
    131,
    's2c',
    'event',
    '— (web, OG-408)',
    'Um lado virou o clã nesta rodada (≥ 2 humanos do mesmo clã e nenhum de outro clã): tag e nome do clã e a cor do lado (`#RRGGBB`; vazia = a cor padrão do lado). Tag vazia = o lado voltou a ser vermelho/azul. No `welcome` de quem entra e a cada rodada que muda.',
    { team: u8, tag: str(8), name: str(24), color: str(7) },
  ),
  // --- emblema do clã na partida (OG-486, D-85): sem equivalente no original ---
  teamEmblem: msg(
    133,
    's2c',
    'event',
    '— (web, OG-486)',
    'Emblema do clã do lado (`ClanEmblem` e as cores do clã), logo depois do `teamIdentity` que fez o lado virar o clã; o cliente desenha o emblema no chão das bases. Não vem para clã sem emblema gravado.',
    { team: u8, frame: str(16), symbol: str(16), fillet: bool, inverted: bool, primary: str(7), secondary: str(7) },
  ),
  // --- modos de treino (OG-490, D-86): sem equivalente no original ---
  trainingState: msg(
    134,
    's2c',
    'event',
    '— (web, OG-490)',
    'Tentativa da sala de treino: fase (contagem, em jogo ou resultado), modo, segundos da contagem, resultado e motivo do fim, duração da tentativa (décimos de s), sucessos e tentativas da sessão, nível dos bots e se ele mudou (dificuldade progressiva, OG-499).',
    {
      phase: enumOf('countdown', 'playing', 'result'),
      mode: enumOf('attack', 'defense', 'escape', 'capture'),
      seconds: u8,
      result: enumOf('none', 'success', 'fail'),
      reason: enumOf('none', 'died', 'defendersDown', 'flagOut', 'attackersDown', 'captured', 'delivered', 'returned', 'timeout'),
      tenths: u16,
      successes: u16,
      attempts: u16,
      level: u8,
      levelChange: enumOf('none', 'up', 'down'),
    },
  ),
  // --- números de jogador (OG-410, D-79): sem equivalente no original ---
  playerNumber: msg(132, 's2c', 'event', '— (web, OG-410)', 'Número do jogador (1 a 99), no centro do boneco, e o estilo dele (OG-413: 0 Bloco, 1 Corrida, 2 Contorno, 3 Estêncil; nos bits 4–5, a medalha do pódio do mês anterior, OG-532: `packNumberStyle`). Logo depois do `playerJoined`; sem número (convidado, bot), não vem.', {
    pid,
    number: u8,
    style: u8,
  }),
} as const;

export type MessageName = keyof typeof MESSAGES;
export type MessageOf<N extends MessageName> = InferFields<(typeof MESSAGES)[N]['fields']>;
/** Mensagem decodificada: nome + campos. */
export type AnyMessage = { [N in MessageName]: { type: N } & MessageOf<N> }[MessageName];

/** Mensagens legadas do original que não existem no protocolo web, com o motivo (MESSAGES.md). */
export const DROPPED: readonly [string, string][] = [
  [
    'data_file_request, data_file_download, data_file_ack',
    'mapas e arquivos são baixados por HTTP com cache',
  ],
  [
    'data_old_registration_token, data_registration_token, data_registration_response, data_old_tournament_participation, data_ranking_participation',
    'autenticação e ranking pela API (contas, OG-080+)',
  ],
  ['data_name_authentication_request', 'nomes protegidos são contas da API'],
  [
    'data_negotiate_third_party_extensions, data_extension_advantage, faixa reservada',
    'versão única do protocolo, negociada no hello',
  ],
  ['data_bot', 'incluído em playerJoined'],
];
