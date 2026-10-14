// SPDX-License-Identifier: GPL-2.0-or-later
// Termos de uso e política de privacidade (OG-107): versões e o inventário dos dados pessoais que
// o código guarda de fato. A página /privacy é montada daqui e um teste da API confere que toda
// tabela do banco está classificada abaixo (a política não fica para trás quando o schema muda).
// Os textos são um rascunho para revisão do responsável pelo serviço; não substituem orientação jurídica.

export const TERMS_VERSION = '2026-10-14';
export const PRIVACY_VERSION = '2026-10-14';

export type LegalLocale = 'pt-BR' | 'en';
export type Bilingual = Readonly<Record<LegalLocale, string>>;

export interface DataItem {
  readonly what: Bilingual;
  /** Tabelas do banco, `navegador:<chave>`, `cookie:<nome>`, `logs` ou `arquivos:<o quê>`. */
  readonly where: readonly string[];
  readonly why: Bilingual;
  readonly retention: Bilingual;
}

/** Cada tabela do banco: guarda dado pessoal (está no inventário) ou não. */
export const TABLES: Readonly<Record<string, 'personal' | 'none'>> = {
  users: 'personal',
  sessions: 'personal',
  player_profiles: 'personal',
  password_resets: 'personal',
  reserved_names: 'personal',
  matches: 'none',
  match_players: 'personal',
  ratings: 'personal',
  rating_deltas: 'personal',
  bans: 'personal',
  admin_actions: 'personal',
  admin_commands: 'personal',
  player_reports: 'personal',
  beta_invites: 'none',
  beta_invite_uses: 'personal',
  feedback: 'personal',
  net_reports: 'none',
  seasons: 'none',
  rooms: 'personal',
  game_servers: 'none',
  casual_presets: 'none',
  casual_preset_versions: 'none',
  map_rotations: 'none',
};

const b = (pt: string, en: string): Bilingual => ({ 'pt-BR': pt, en });

export const DATA_INVENTORY: readonly DataItem[] = [
  {
    what: b('Conta: nome de usuário, e-mail, senha (só o hash argon2id), clan tag, papel, datas', 'Account: username, e-mail, password (argon2id hash only), clan tag, role, dates'),
    where: ['users', 'reserved_names'],
    why: b('Entrar, recuperar a senha por e-mail e proteger o seu nome (o nome antigo fica reservado por 90 dias)', 'Signing in, password recovery by e-mail and protecting your name (an old name stays reserved for 90 days)'),
    retention: b('Até você excluir a conta', 'Until you delete the account'),
  },
  {
    what: b('Sessões: data, último acesso, IP e navegador de cada sessão aberta', 'Sessions: date, last access, IP address and browser of each open session'),
    where: ['sessions', 'cookie:og_session'],
    why: b('Manter você conectado e permitir encerrar sessões', 'Keeping you signed in and letting you end sessions'),
    retention: b('30 dias, ou até sair/trocar a senha', '30 days, or until you sign out/change the password'),
  },
  {
    what: b('Preferências e opções do jogo sincronizadas com a conta; idioma; participação no ranking', 'Game preferences synced to the account; language; ranking participation'),
    where: ['player_profiles', 'navegador:outgun.prefs'],
    why: b('Levar as suas opções para outro navegador', 'Bringing your options to another browser'),
    retention: b('Até você excluir a conta (no navegador, até limpar os dados do site)', 'Until you delete the account (in the browser, until you clear site data)'),
  },
  {
    what: b('Recuperação de senha: pedido e link (só o hash do token)', 'Password recovery: request and link (token hash only)'),
    where: ['password_resets'],
    why: b('Trocar a senha esquecida', 'Resetting a forgotten password'),
    retention: b('30 minutos (uso único)', '30 minutes (single use)'),
  },
  {
    what: b('Partidas: nome em jogo, time, placar e estatísticas; ranking da temporada; replays (nomes e chat da partida)', 'Matches: in-game name, team, score and statistics; season ranking; replays (names and match chat)'),
    where: ['match_players', 'ratings', 'rating_deltas', 'rooms', 'arquivos:replays'],
    why: b('Histórico, perfil público, ranking e replays, como no Outgun original', 'History, public profile, ranking and replays, as in the original Outgun'),
    retention: b('Estatísticas: enquanto o serviço existir (ao excluir a conta o nome vira "(anon)"); replays: 30 dias', 'Statistics: while the service exists (deleting the account replaces the name with "(anon)"); replays: 30 days'),
  },
  {
    what: b('Identificador aleatório do navegador (só o hash chega ao servidor)', 'Random browser identifier (only its hash reaches the server)'),
    where: ['navegador:outgun.device', 'bans'],
    why: b('Bans por dispositivo contra quem trapaceia ou abusa (não é usado para rastrear)', 'Device bans against cheating or abuse (not used for tracking)'),
    retention: b('No navegador até limpar os dados do site; no servidor só em bans, até vencerem', 'In the browser until you clear site data; on the server only in bans, until they expire'),
  },
  {
    what: b('Moderação: bans (conta, IP, dispositivo), denúncias (nomes, motivo, IP e dispositivo do denunciado), ações de moderação', 'Moderation: bans (account, IP, device), reports (names, reason, IP and device of the reported player), moderation actions'),
    where: ['bans', 'player_reports', 'admin_actions', 'admin_commands'],
    why: b('Manter partidas justas e registrar quem moderou o quê (auditoria)', 'Keeping matches fair and recording who moderated what (audit log)'),
    retention: b('Bans até vencerem; denúncias e auditoria enquanto o serviço existir', 'Bans until they expire; reports and audit log while the service exists'),
  },
  {
    what: b('Beta: convite usado e feedback (nome, notas, texto, sala, mapa, versão, tela e navegador)', 'Beta: invite used and feedback (name, ratings, text, room, map, version, screen and browser)'),
    where: ['beta_invite_uses', 'feedback'],
    why: b('Controlar quem entra no beta e melhorar o jogo', 'Controlling beta access and improving the game'),
    retention: b('Até o fim do beta ou até você excluir a conta (o nome sai do feedback)', 'Until the end of the beta or until you delete the account (your name is removed from feedback)'),
  },
  {
    what: b('Estatísticas anônimas da rede (ping, atraso, correções, fps, navegador, sala) - sem conta, nome ou IP', 'Anonymous network statistics (ping, delay, corrections, fps, browser, room) - no account, name or IP'),
    where: ['net_reports'],
    why: b('Ajustar a rede e a predição do jogo; dá para desligar em Opções > Jogo', 'Tuning the game network and prediction; can be turned off in Options > Game'),
    retention: b('Agregadas; os resumos podem ser apagados a qualquer momento', 'Aggregated; the summaries may be deleted at any time'),
  },
  {
    what: b('Registros técnicos dos servidores (IP, endereço pedido, horário, erros)', 'Server technical logs (IP address, requested address, time, errors)'),
    where: ['logs'],
    why: b('Segurança, diagnóstico de falhas e prevenção de abuso', 'Security, troubleshooting and abuse prevention'),
    retention: b('Rotativos, alguns dias; cópias de segurança do banco por 14 dias', 'Rotating, a few days; database backups for 14 days'),
  },
];

export interface LegalSection {
  readonly title: Bilingual;
  readonly paragraphs: readonly Bilingual[];
}

export const PRIVACY_SECTIONS: readonly LegalSection[] = [
  {
    title: b('Quem somos', 'Who we are'),
    paragraphs: [
      b(
        'O Outgun Web é uma versão para navegador do Outgun 1.0.3, software livre (GPL). O serviço é mantido pela comunidade de jogadores que o hospeda; o contato do responsável está logo abaixo.',
        'Outgun Web is a browser version of Outgun 1.0.3, free software (GPL). The service is run by the player community that hosts it; the operator contact is right below.',
      ),
    ],
  },
  {
    title: b('Seus direitos (LGPD)', 'Your rights (LGPD)'),
    paragraphs: [
      b(
        'Em Conta você pode baixar tudo o que guardamos sobre você (Exportar dados) e excluir a conta, o que apaga a conta, as sessões, as preferências e o ranking e tira o seu nome das partidas e do feedback. Para outros pedidos (correção, informação, oposição), fale com o responsável pelo serviço.',
        'Under Account you can download everything we keep about you (Export data) and delete the account, which removes the account, sessions, preferences and ranking and takes your name off matches and feedback. For other requests (correction, information, objection), contact the service operator.',
      ),
    ],
  },
  {
    title: b('O que não fazemos', 'What we do not do'),
    paragraphs: [
      b(
        'Não vendemos dados, não usamos anúncios nem rastreadores de terceiros e não usamos impressão digital do navegador. Cookies: só o de sessão (og_session), necessário para entrar.',
        'We do not sell data, use ads or third-party trackers, or browser fingerprinting. Cookies: only the session cookie (og_session), needed to sign in.',
      ),
      b(
        'Serviços de terceiros, só se o responsável ligar: envio de e-mail (Resend) para a recuperação de senha e registro de erros (Sentry ou GlitchTip), que recebe a mensagem e a pilha do erro, sem dados da conta.',
        'Third-party services, only if the operator enables them: e-mail delivery (Resend) for password recovery and error reporting (Sentry or GlitchTip), which receives the error message and stack, no account data.',
      ),
    ],
  },
];

export const TERMS_SECTIONS: readonly LegalSection[] = [
  {
    title: b('O jogo', 'The game'),
    paragraphs: [
      b(
        'O Outgun Web é gratuito e de código aberto (GNU GPL 2 ou posterior). Ele é oferecido como está, sem garantia; durante o beta pode haver falhas, perda de estatísticas e interrupções.',
        'Outgun Web is free and open source (GNU GPL 2 or later). It is provided as is, without warranty; during the beta there may be bugs, lost statistics and downtime.',
      ),
    ],
  },
  {
    title: b('Conduta', 'Conduct'),
    paragraphs: [
      b(
        'Não trapaceie (programas que alteram o jogo, exploração de falhas, várias contas para o ranking), não ofenda, ameace ou faça spam no chat e não use nomes ofensivos ou que se passem por outra pessoa. Moderadores podem silenciar, expulsar e banir (por conta, IP ou dispositivo) quem descumprir estas regras; as ações ficam registradas.',
        'Do not cheat (programs that alter the game, exploiting bugs, multiple accounts for the ranking), do not insult, threaten or spam in chat, and do not use offensive names or impersonate others. Moderators may mute, kick and ban (by account, IP or device) anyone who breaks these rules; actions are logged.',
      ),
    ],
  },
  {
    title: b('Conta', 'Account'),
    paragraphs: [
      b(
        'Você é responsável pela sua senha. O seu nome de usuário, as estatísticas e as partidas aparecem publicamente no perfil e no ranking. Você pode excluir a conta quando quiser.',
        'You are responsible for your password. Your username, statistics and matches appear publicly in your profile and the ranking. You can delete your account at any time.',
      ),
    ],
  },
  {
    title: b('Créditos', 'Credits'),
    paragraphs: [
      b(
        'O Outgun foi criado por Fabiana Cecin; a versão 1.0 é de Niko Ritari, Jani Rivinoja e colaboradores (créditos completos na tela Créditos). A versão web é um port feito com respeito à obra original e às comunidades brasileira e finlandesa que a mantêm viva.',
        'Outgun was created by Fabiana Cecin; version 1.0 is by Niko Ritari, Jani Rivinoja and contributors (full credits on the Credits screen). The web version is a port made with respect to the original work and to the Brazilian and Finnish communities that keep it alive.',
      ),
    ],
  },
];
