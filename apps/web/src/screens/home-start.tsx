// SPDX-License-Identifier: GPL-2.0-or-later
// Tela inicial: o cartão de entrada (cor sorteada, apelido e "Começar"; aba "Entrar" para quem não
// entrou) e o "Como jogar" em passos, com as teclas que o jogador usa de verdade, nas cores do tema.
import { MILESTONES } from '@outgun/content';
import { chatName, colourKey, isMedalColor, PERSONAL_COLORS } from '@outgun/protocol';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { SourceLink, useNavLinks } from '../app/Shell.js';
import { useAccount } from '../app/account.js';
import { desktopBridge, isDesktopClient } from '../app/install.js';
import { isPhone } from '../app/phone.js';
import { usePlayNow } from '../app/play-now.js';
import { usePrefs } from '../app/prefs.js';
import { api } from '../app/api.js';
import { loadManifest } from '../assets.js';
import { lightColour, loadNumberFonts, NUMBER_STYLES, paintNumber } from '../game/render/number-styles.js';
import { chordLabel, type Action } from '../game/input/bindings.js';
import { GUNPOINT_RADIUS } from '../game/render/entity-frame.js';
import { pickColourTheme, themeColours } from '../game/render/theme.js';
import { altName } from '../game/input/shortcuts.js';
import { Badge, Button } from '../ui/Button.js';
import { Icon, PLAYER_COLOURS } from '../ui/icons.js';
import { Tabs } from '../ui/Tabs.js';
import { SignInForm } from './account.js';
import { type HistoryEntry, useApi } from './stats.js';
import { STEAM_STORE_URL } from './download.js';

/** Seta circular grossa do sorteio de cor. */
function RerollIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M18.4 9.2A7 7 0 1 0 19 14" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M20.6 3.8 19.3 10.4 12.9 8.6Z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/** Raio do boneco na partida (`PLAYER_RADIUS`, src/world.h). */
const PLAYER_RADIUS = 15;

/** Cores do tema escolhido nas opções (as de fábrica até o manifesto chegar). */
function useThemeColours(): Readonly<Record<string, string>> | null {
  const { prefs } = usePrefs();
  const [colours, setColours] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let alive = true;
    void loadManifest().then((m) => alive && m && setColours(themeColours(m.defaultColours, pickColourTheme(m, prefs.graphicsTheme, prefs.colourTheme, prefs.preferThemeColours))));
    return () => {
      alive = false;
    };
  }, [prefs.graphicsTheme, prefs.colourTheme, prefs.preferThemeColours]);
  return colours;
}

/** Uma ida e volta do strafe (ms), quantas seguidas, a pausa parado depois e quanto anda para a direita. */
const STRAFE_MS = 600;
const STRAFE_REPEAT = 2;
const STRAFE_PAUSE_MS = 2800;
/** Na pausa, o balão aparece um pouco depois de parar e some antes de voltar a andar (ms). */
const TALK_DELAY_MS = 150;
const TALK_END_EARLY_MS = 450;
const STRAFE_RANGE = 8;
/** Recorte do desenho no círculo (unidades do jogo): o boneco à esquerda do centro, o cano cabendo à direita. */
const VIEW = { x: -24, y: -31, size: 62 };

/**
 * O boneco exatamente como a partida o desenha sem sprites (`drawPlayerBody`): círculo do time de
 * raio 15, miolo pessoal de raio 10 e o cano de 3 linhas de 1 px até a ponta (raio 28) apontando
 * para a direita (gundir 0). Animado como quem segura o strafe (Alt): vai e volta na horizontal com o
 * cano parado: do meio até um pouco à direita e de volta, duas vezes, e uma pausa parado. Atualiza
 * `--strafe` no quadro, para o balão acompanhar. Com movimento reduzido, parado.
 */
function GamePlayer({ color, team = 0, frame, onTalk }: { readonly color: number; readonly team?: 0 | 1; readonly frame: RefObject<HTMLDivElement | null>; readonly onTalk: (talking: boolean) => void }) {
  const colours = useThemeColours();
  const teamColour = colours?.[team === 0 ? 'team_red_basic' : 'team_blue_basic'] ?? (team === 0 ? '#FF0000' : '#0000FF');
  const personal = colours?.[colourKey(color)] ?? PLAYER_COLOURS[color] ?? PLAYER_COLOURS[0]!;
  const body = useRef<SVGGElement>(null);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return onTalk(true);
    let raf = 0;
    let talking = false;
    const start = performance.now();
    const tick = (now: number) => {
      // 0 no meio, STRAFE_RANGE à direita (nunca passa do meio para a esquerda); depois, parado
      const at = (now - start) % (STRAFE_MS * STRAFE_REPEAT + STRAFE_PAUSE_MS);
      const x = at < STRAFE_MS * STRAFE_REPEAT ? ((1 - Math.cos((at / STRAFE_MS) * 2 * Math.PI)) / 2) * STRAFE_RANGE : 0;
      body.current?.setAttribute('transform', `translate(${x.toFixed(2)} 0)`);
      frame.current?.style.setProperty('--strafe', `${((x / VIEW.size) * 100).toFixed(2)}%`);
      // fala só parado: começa logo depois de parar e termina antes de voltar a andar
      const moving = STRAFE_MS * STRAFE_REPEAT;
      const nowTalking = at >= moving + TALK_DELAY_MS && at < moving + STRAFE_PAUSE_MS - TALK_END_EARLY_MS;
      if (nowTalking !== talking) onTalk((talking = nowTalking));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frame, onTalk]);
  const R = PLAYER_RADIUS;
  return (
    <svg className="home-game-player" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.size} ${VIEW.size}`} aria-hidden="true" focusable="false">
      <g ref={body}>
        <circle r={R} fill={teamColour} />
        <circle r={(R * 2) / 3} fill={personal} />
        {isMedalColor(color) && <ellipse cy={-R / 4} rx={R / 2.4} ry={R / 4.5} fill="#fff" fillOpacity={0.45} />}
        {/* cano para a direita (gundir 0): na partida são 3 linhas de 1 px de tela lado a lado, ou seja, 3 px
            de espessura em qualquer zoom; aqui, uma linha de 3 px que não engorda com a escala */}
        <line x1={R} y1={0} x2={GUNPOINT_RADIUS} y2={0} stroke={teamColour} strokeWidth={3} vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

/**
 * Boneco de quem entrou, como está na conta: a primeira cor favorita do perfil (a que o servidor dá na
 * partida) e o número (OG-410) com o estilo (OG-413). `undefined` enquanto carrega, para o boneco não
 * aparecer antes com a cor errada; sem conta, null.
 */
function useAccountLook(): { readonly color: number; readonly number: { readonly value: number; readonly style: number } | null } | null | undefined {
  const { user } = useAccount();
  const [look, setLook] = useState<{ color: number; number: { value: number; style: number } | null } | null | undefined>(undefined);
  useEffect(() => {
    if (!user) return setLook(user === null ? null : undefined);
    setLook(undefined);
    let alive = true;
    Promise.all([
      api<{ favoriteColors: number[] }>(`/players/${encodeURIComponent(user.username)}`),
      api<{ number: number | null; style: number }>('/account/number').catch(() => ({ number: null, style: 0 })),
    ]).then(
      ([profile, n]) => alive && setLook({ color: profile.favoriteColors[0] ?? 0, number: n.number ? { value: n.number, style: n.style } : null }),
      () => alive && setLook(null),
    );
    return () => {
      alive = false;
    };
  }, [user]);
  return look;
}

/**
 * Número no miolo do boneco, desenhado como na partida (`paintNumber`: letra de 17 num boneco de raio
 * 15, escura sobre cor clara e clara sobre escura). Acompanha o strafe pelo `--strafe` do quadro.
 */
function PlayerNumber({ value, style, colour }: { readonly value: number; readonly style: number; readonly colour: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    let alive = true;
    void loadNumberFonts().then(() => {
      if (!alive) return;
      const size = c.getBoundingClientRect().width * (devicePixelRatio || 1);
      c.width = c.height = Math.max(1, Math.round(size));
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.save();
      ctx.translate(c.width / 2, c.height / 2);
      // o quadro do número tem 2 raios de boneco: a letra de 17 vira 17/30 da largura
      paintNumber(ctx, String(value), NUMBER_STYLES[style] ?? NUMBER_STYLES[0]!, lightColour(colour), (c.width * 17) / (PLAYER_RADIUS * 2));
      ctx.restore();
    });
    return () => {
      alive = false;
    };
  }, [value, style, colour]);
  return <canvas ref={canvas} className="home-game-number" aria-hidden="true" />;
}

/** Falas do balão, sorteadas (a definir). */
const BUBBLE_LINES = [
  "Let's go!",
  "I'm ready!",
  'Off to get the flag!',
  'Pick me for your team!',
  "Where's their flag?",
  "I'm capturing today!",
  'That flag is mine!',
  'Come and get it!',
  'Aim at me, if you can!',
  'My gun is warmed up.',
  'Hold Alt and keep up!',
  'Shift to run, remember!',
  'Grab a power-up on the way!',
];

/**
 * Balão saindo do boneco: só enquanto ele está parado (`visible`), com uma fala sorteada a cada parada
 * (nunca a mesma duas vezes seguidas). Acompanha o boneco pelo `--strafe` do quadro.
 */
function SpeechBubble({ visible }: { readonly visible: boolean }) {
  const { t } = usePrefs();
  const [line, setLine] = useState(() => Math.floor(Math.random() * BUBBLE_LINES.length));
  const [shown, setShown] = useState(visible);
  if (visible !== shown) {
    setShown(visible);
    if (visible && BUBBLE_LINES.length > 1) {
      const next = Math.floor(Math.random() * (BUBBLE_LINES.length - 1));
      setLine(next >= line ? next + 1 : next);
    }
  }
  return (
    <p className={visible ? 'home-bubble' : 'home-bubble hidden'} aria-hidden="true">
      {t(BUBBLE_LINES[line]!)}
    </p>
  );
}

/** Cores vivas para quem chega sem ter escolhido: amarelo, magenta, ciano, laranja e salmão. */
const STARTING_COLOURS = [1, 3, 4, 5, 6];

/**
 * Boneco no círculo; o convidado sorteia a cor (e o time) no botão, quem entrou usa a cor e o número
 * da conta e o botão só troca o time. Cor pessoal: o boneco no círculo, com o miolo na cor pessoal e o anel na cor do time, como na
 * partida, e o botão que sorteia outra (vira a primeira das favoritas). O convidado que nunca
 * escolheu uma cor começa com uma viva sorteada, em vez do verde de fábrica.
 */
function AvatarPicker() {
  const { t, prefs, setPrefs } = usePrefs();
  const { user } = useAccount();
  const current = prefs.favoriteColors[0] ?? 0;
  const frame = useRef<HTMLDivElement>(null);
  const untouched = prefs.favoriteColors.every((c, i) => c === i);
  useEffect(() => {
    if (user !== null || !untouched) return;
    const start = STARTING_COLOURS[Math.floor(Math.random() * STARTING_COLOURS.length)]!;
    setPrefs({ favoriteColors: [start, ...prefs.favoriteColors.filter((c) => c !== start)] });
    // só na chegada do convidado com as cores de fábrica
  }, [user, untouched]);
  const team = prefs.preferredTeam ?? 0;
  const [talking, setTalking] = useState(false);
  const look = useAccountLook();
  // quem entrou: a cor e o número da conta; o convidado, a cor sorteada aqui
  const color = user ? (look?.color ?? current) : current;
  const colours = useThemeColours();
  const personal = colours?.[colourKey(color)] ?? PLAYER_COLOURS[color] ?? PLAYER_COLOURS[0]!;
  // convidado: outra cor e o outro time (vermelho, azul, vermelho...); quem entrou: só o time, mantendo
  // cor e número. No Casual, entra no time escolhido.
  const reroll = () => {
    if (user) return setPrefs({ preferredTeam: team === 0 ? 1 : 0 });
    // nunca a mesma de agora, nunca uma medalha
    let next = Math.floor(Math.random() * (PERSONAL_COLORS - 1));
    if (next >= current) next++;
    setPrefs({ favoriteColors: [next, ...prefs.favoriteColors.filter((c) => c !== next)], randomColor: false, preferredTeam: team === 0 ? 1 : 0 });
  };
  const rerollLabel = user ? t('Switch team') : t('Another colour');
  return (
    <div className="home-avatar">
      <div
        className="home-avatar-frame"
        ref={frame}
        style={{ '--player-x': `${(-VIEW.x / VIEW.size) * 100}%`, '--player-top': `${((-PLAYER_RADIUS - VIEW.y) / VIEW.size) * 100}%` } as CSSProperties}
      >
        {/* quem entrou: só desenha depois de carregar a conta, já com a cor e o número certos */}
        {(!user || look) && (
          <>
            <GamePlayer color={color} team={team} frame={frame} onTalk={setTalking} />
            {user && look?.number && <PlayerNumber value={look.number.value} style={look.number.style} colour={personal} />}
            <SpeechBubble visible={talking} />
          </>
        )}
      </div>
      <span className="home-avatar-reroll">
        <button type="button" onClick={reroll} aria-label={rerollLabel} title={rerollLabel}>
          <RerollIcon />
        </button>
      </span>
    </div>
  );
}

/** Uma linha da ficha de quem entrou: ícone, rótulo à esquerda e valor à direita; a linha toda é o link. */
function StatRow({ icon, label, value, to, muted = false }: { readonly icon: ReactNode; readonly label: string; readonly value: ReactNode; readonly to: string; readonly muted?: boolean }) {
  return (
    <li>
      <Link className="home-stat" to={to}>
        <span className="home-stat-icon">{icon}</span>
        <span className="home-stat-label">{label}</span>
        <span className={muted ? 'home-stat-value muted' : 'home-stat-value'}>{value}</span>
      </Link>
    </li>
  );
}

/** Clã de quem entrou, embaixo do nome ("Clã: nome", leva à página do clã) ou o convite para achar um. */
export function HomeClan({ tag }: { readonly tag: string | null }) {
  const { t } = usePrefs();
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    setName(null);
    if (!tag) return;
    let alive = true;
    api<{ clan: { name: string } }>(`/clans/${encodeURIComponent(tag)}`).then(
      (r) => alive && setName(r.clan.name),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [tag]);
  if (!tag) return <StatRow icon={<Icon name="clan" size={18} />} label={t('Clan')} value={t('Find a clan')} to="/clans" muted />;
  return <StatRow icon={<Icon name="clan" size={18} />} label={t('Clan')} value={name ?? tag} to={`/clans/${encodeURIComponent(tag)}`} />;
}

/** Pódio do selo de ranking. */
function PodiumIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M9 6h6v15H9zM2 11h6v10H2zM16 14h6v7h-6z" />
    </svg>
  );
}

/**
 * Posição de quem entrou no ranking geral do mês (o índice "Geral do mês", OG-358), com o total; sem
 * posição ainda, quantas partidas Ranqueadas faltam para aparecer. Leva à tela do ranking.
 */
export function HomeRank({ username }: { readonly username: string }) {
  const { t } = usePrefs();
  const [rank, setRank] = useState<{ position: number | null; total: number; minimum: number } | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ total: number; minimumMatches: number; me: { position: number } | null }>(`/leaderboard/overall?limit=1&player=${encodeURIComponent(username)}`).then(
      (r) => alive && setRank({ position: r.me?.position ?? null, total: r.total, minimum: r.minimumMatches }),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [username]);
  if (!rank) return null;
  return rank.position !== null ? (
    <StatRow icon={<PodiumIcon />} label={t('Ranking')} value={t('$1º of $2', String(rank.position), String(rank.total))} to="/ranking" />
  ) : (
    <StatRow icon={<PodiumIcon />} label={t('Ranking')} value={t('play $1 Ranked', String(rank.minimum))} to="/ranking" muted />
  );
}

/** Marcos de quem entrou ("Marcos 8/72"), como no título do painel do perfil; leva ao painel. */
export function HomeMilestones({ username }: { readonly username: string }) {
  const { t } = usePrefs();
  const [count, setCount] = useState<{ won: number; total: number } | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ milestones: readonly unknown[]; secrets?: { total: number } }>(`/players/${encodeURIComponent(username)}`).then(
      (p) => alive && setCount({ won: p.milestones.length, total: MILESTONES.length + (p.secrets?.total ?? 0) }),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [username]);
  if (!count) return null;
  return (
    <StatRow icon={<Icon name="trophy" size={18} />} label={t('Milestones')} value={`${count.won}/${count.total}`} to={`/players/${encodeURIComponent(username)}#milestones`} />
  );
}

/** Cartão da esquerda: convidado (cor, apelido, começar) ou "Entrar"; quem entrou vê o boneco da conta e joga. */
export function StartCard() {
  const { t, prefs, setPrefs } = usePrefs();
  const { user } = useAccount();
  const navigate = useNavigate();
  const playNow = usePlayNow();
  const [tab, setTab] = useState<'guest' | 'signin'>('guest');

  const play = (
    <div className="home-start-play">
      <div className="home-start-body">
        <AvatarPicker />
        <div className="home-start-name">
          {user ? (
            <>
              {/* o nome leva ao perfil com as estatísticas; a tag do clã à esquerda, no estilo do clã, como na
                  partida ("BV-nick", "[BV] nick"...) */}
              <Link className="home-start-username" to={`/players/${encodeURIComponent(user.username)}`}>
                {user.clanLabel && <span className="app-clan">{chatName(user.username, user.clanLabel).slice(0, -user.username.length)}</span>}
                {user.username}
              </Link>
              <ul className="home-stats">
                <HomeClan tag={user.clanTag} />
                <HomeRank username={user.username} />
                <HomeMilestones username={user.username} />
              </ul>
            </>
          ) : (
            <label className="home-start-field">
              <span className="home-start-prompt">{t('Choose a colour and a nickname')}</span>
              <input
                className="home-start-input"
                value={prefs.playerName}
                onChange={(ev) => setPrefs({ playerName: ev.target.value })}
                onKeyDown={(ev) => ev.key === 'Enter' && playNow()}
                maxLength={15}
                placeholder={t('guest')}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          )}
        </div>
      </div>
      {/* botão de fliperama: cantos em degrau, chanfro, contorno preto e sombra dura */}
      <span className="home-retro">
        <button type="button" className="home-retro-button" onClick={playNow}>
          <span className="home-retro-arrow" aria-hidden="true" />
          {t('Play now')}
        </button>
      </span>
      {user && (user.isAdmin || user.isModerator) && (
        <div className="home-start-links">
          <Button variant="ghost" onClick={() => void navigate('/admin')}>
            {t('Moderation')}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <section className={user ? 'home-start home-box' : 'home-start'} aria-label={t('Play')}>
      {user ? (
        play
      ) : (
        <Tabs
          label={t('How to enter')}
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'guest', label: t('Guest') },
            { id: 'signin', label: t('Sign in') },
          ]}
        >
          {tab === 'guest' ? (
            play
          ) : (
            <div className="home-start-signin">
              <SignInForm autoFocus onSignedIn={() => setTab('guest')} />
            </div>
          )}
        </Tabs>
      )}
    </section>
  );
}

/** Rotação da seta (desenhada apontando para cima) de cada tecla de direção. */
const ARROWS: Record<string, number> = { ArrowUp: 0, ArrowRight: 90, ArrowDown: 180, ArrowLeft: 270 };

/** Seta das teclas de direção: o mesmo desenho girado, para as quatro terem a mesma espessura. */
function ArrowGlyph({ rotate }: { readonly rotate: number }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="square" aria-hidden="true" focusable="false" style={{ transform: `rotate(${rotate}deg)` }}>
      <path d="M12 20V5M5.5 11.5 12 5l6.5 6.5" />
    </svg>
  );
}

/** Tecla na tela: a primeira associação da ação, com setas desenhadas no lugar dos nomes. */
function Key({ action }: { readonly action: Action }) {
  const { prefs } = usePrefs();
  const chord = prefs.bindings[action]?.[0];
  if (!chord) return null;
  const arrow = ARROWS[chord.code];
  return <kbd>{arrow !== undefined ? <ArrowGlyph rotate={arrow} /> : chordLabel(chord, altName())}</kbd>;
}

/** Setas e pontos dos cartões em passos ("Como jogar" e o cartão de quem entrou). */
function CarouselNav({ titles, step, onGo }: { readonly titles: readonly string[]; readonly step: number; readonly onGo: (step: number) => void }) {
  const { t } = usePrefs();
  return (
    <div className="home-howto-nav">
      <button type="button" className="home-howto-arrow" onClick={() => onGo(step - 1)} aria-label={t('Previous')}>
      </button>
      {titles.map((title, i) => (
        <button key={title} type="button" className="home-howto-dot" aria-label={`${i + 1}. ${title}`} aria-current={i === step ? 'step' : undefined} onClick={() => onGo(i)} />
      ))}
      <button type="button" className="home-howto-arrow" onClick={() => onGo(step + 1)} aria-label={t('Next')}>
      </button>
    </div>
  );
}

/** "Como jogar" (conteúdo provisório): um passo por vez, setas e pontos para navegar. */
function HowToPlay() {
  const { t } = usePrefs();
  const [step, setStep] = useState(0);
  const steps = [
    {
      title: t('Move'),
      text: t('Walk around the map with the arrow keys.'),
      keys: (
        <span className="home-howto-arrows">
          <Key action="up" />
          <Key action="left" />
          <Key action="down" />
          <Key action="right" />
        </span>
      ),
    },
    { title: t('Shoot'), text: t('Fire rockets at the other team.'), keys: <Key action="fire" /> },
    {
      title: t('Run and strafe'),
      text: t('Hold one to run; hold the other to keep aiming while you move.'),
      keys: (
        <>
          <Key action="run" />
          <Key action="strafe" />
        </>
      ),
    },
    { title: t('Power-ups'), text: t('Shield, turbo, power, shadow and the deathbringer: pick them up on the map.'), keys: <Icon name="shield" size={64} /> },
    { title: t('Need help?'), text: t('Press it during a match to see every key.'), keys: <Key action="help" /> },
  ];
  const current = steps[step]!;
  const go = (to: number) => setStep((to + steps.length) % steps.length);
  return (
    <section className="home-box home-howto" aria-labelledby="home-howto-title">
      <h2 id="home-howto-title" className="home-box-title">
        {t('How to play')}
      </h2>
      <div className="home-howto-step" aria-live="polite">
        <div className="home-howto-keys">{current.keys}</div>
        <h3 className="home-howto-title">
          {step + 1}. {current.title}
        </h3>
        <p className="home-howto-text">{current.text}</p>
      </div>
      <CarouselNav titles={steps.map((x) => x.title)} step={step} onGo={go} />
    </section>
  );
}

/** As 4 últimas partidas de quem entrou: data, mapa, resultado e K/D; cada uma leva à partida. */
export function RecentMatchesSlide({ username }: { readonly username: string }) {
  const { t, prefs } = usePrefs();
  const history = useApi<{ matches: HistoryEntry[] }>(`/players/${encodeURIComponent(username)}/matches?limit=4`, false, 'matches');
  if (history.data === undefined && !history.error) return <p className="ui-muted">{t('Loading...')}</p>;
  if (history.error) return <p className="ui-muted">{t('Could not reach the server.')}</p>;
  const matches = history.data?.matches ?? [];
  if (matches.length === 0) return <p className="home-howto-text">{t('No matches yet. "Play now" starts one.')}</p>;
  return (
    <ul className="home-recent">
      <li className="home-recent-head" aria-hidden="true">
        <span>{t('Date')}</span>
        <span>{t('Map')}</span>
        <span>{t('Result')}</span>
        <span>K/D</span>
      </li>
      {matches.map((m) => {
        const mine = m.player.team === 0 ? m.redScore : m.blueScore;
        const theirs = m.player.team === 0 ? m.blueScore : m.redScore;
        return (
          <li key={m.id}>
            <Link to={`/matches/${m.id}`}>
              <span className="ui-muted">{new Date(m.endedAt).toLocaleDateString(prefs.locale, { day: '2-digit', month: '2-digit' })}</span>
              <span className="home-recent-map">{m.mapTitle}</span>
              {mine > theirs ? <Badge tone="success">{t('Win')}</Badge> : mine < theirs ? <Badge tone="danger">{t('Loss')}</Badge> : <Badge>{t('Draw')}</Badge>}
              <strong>
                {m.player.kills}/{m.player.deaths}
              </strong>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Banner de uma rede: o ícone grande, o convite e o botão que abre o link. */
function SocialSlide({ name, text, action }: { readonly name: string; readonly text: string; readonly action: string }) {
  const social = SOCIAL.find((x) => x.name === name)!;
  return (
    <div className="home-social-banner">
      <svg className="home-social-banner-icon" width="72" height="72" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
        <path d={social.path} />
      </svg>
      <p className="home-howto-text">{text}</p>
      <a className="ui-button ui-button-primary ui-button-md" href={social.url} target="_blank" rel="noopener noreferrer">
        {action}
      </a>
    </div>
  );
}

/**
 * Cartão da direita para quem entrou (no lugar do "Como jogar"): as últimas partidas e os banners do
 * Instagram, do WhatsApp e do Discord, um por vez, com as mesmas setas e pontos.
 */
function PlayerInfoBox({ username }: { readonly username: string }) {
  const { t } = usePrefs();
  const [step, setStep] = useState(0);
  const slides = [
    { title: t('Your recent matches'), body: <RecentMatchesSlide username={username} /> },
    { title: 'Instagram', body: <SocialSlide name="Instagram" text={t('Follow Outgun on Instagram: news, clips and behind the scenes.')} action={t('Follow')} /> },
    { title: 'WhatsApp', body: <SocialSlide name="WhatsApp" text={t('Join the WhatsApp group and set up matches with everyone.')} action={t('Join the group')} /> },
    { title: 'Discord', body: <SocialSlide name="Discord" text={t('Join our Discord: find a team, chat and follow the news.')} action={t('Join the server')} /> },
  ];
  const current = slides[step]!;
  const go = (to: number) => setStep((to + slides.length) % slides.length);
  return (
    <section className="home-box home-howto" aria-labelledby="home-info-title">
      <h2 id="home-info-title" className="home-box-title">
        {current.title}
      </h2>
      <div className="home-howto-step" aria-live="polite">
        {current.body}
      </div>
      <CarouselNav titles={slides.map((x) => x.title)} step={step} onGo={go} />
    </section>
  );
}

/** Cartão da direita: "Como jogar" para o convidado; partidas e redes para quem entrou. */
export function HomeInfoBox() {
  const { user } = useAccount();
  return user ? <PlayerInfoBox username={user.username} /> : <HowToPlay />;
}

/** Logo da Steam (Simple Icons, CC0-1.0; marca da Valve, usada só para levar à loja). */
function SteamLogo() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z" />
    </svg>
  );
}

/** Globo do selo "Também na web". */
function WebLogo() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M2.5 12h19M12 2.5c2.6 2.7 3.9 5.9 3.9 9.5s-1.3 6.8-3.9 9.5M12 2.5C9.4 5.2 8.1 8.4 8.1 12s1.3 6.8 3.9 9.5" />
    </svg>
  );
}

/**
 * Selo embaixo do "Como jogar": no navegador, leva à Steam;
 * dentro do app da Steam, abre o site no navegador do sistema (o app abriria o próprio site nele
 * mesmo). Nos apps anteriores ao `openExternal`, o selo não aparece.
 */
export function SteamLink() {
  const { t } = usePrefs();
  if (isDesktopClient()) {
    const open = desktopBridge()?.openExternal;
    if (!open) return null;
    return (
      <a
        className="home-steam"
        href={location.origin}
        onClick={(ev) => {
          ev.preventDefault();
          open(location.origin);
        }}
      >
        <WebLogo />
        <span className="home-steam-text">
          <small>{t('Also on the web')}</small>
          <strong>{t('Open Outgun on the web')}</strong>
        </span>
      </a>
    );
  }
  return (
    <a className="home-steam" href={STEAM_STORE_URL} target="_blank" rel="noopener noreferrer">
      <SteamLogo />
      <span className="home-steam-text">
        <small>{t('Also on Steam')}</small>
        <strong>{t('Open Outgun on Steam')}</strong>
      </span>
    </a>
  );
}

/**
 * Redes do Outgun no rodapé da tela inicial. Endereços a definir: sem endereço, o ícone aparece mas
 * não leva a lugar nenhum. Ícones do Simple Icons (CC0-1.0); as marcas são dos donos.
 */
const SOCIAL: readonly { readonly name: string; readonly url: string; readonly path: string }[] = [
  { name: 'Instagram', url: 'https://www.instagram.com/outgunctf/', path: 'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077' },
  { name: 'Discord', url: 'https://discord.gg/G3JqEUmwb', path: 'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z' },
  { name: 'WhatsApp', url: 'https://chat.whatsapp.com/G639HMXaVZMGUvEefqErji', path: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z' },
];

/** Rodapé da tela inicial: a navegação em caixa alta, as redes e o legal. */
export function HomeFooter() {
  const { t } = usePrefs();
  const links = useNavLinks();
  return (
    <footer className="home-footer">
      <div className="home-footer-row">
        <nav className="home-footer-nav" aria-label={t('Main navigation')}>
          {links.map(([to, label]) => (
            <NavLink key={to} to={to}>
              {label}
            </NavLink>
          ))}
        </nav>
        <ul className="home-social" aria-label={t('Outgun on social media')}>
          {SOCIAL.map((s) => (
            <li key={s.name}>
              <a href={s.url || undefined} target="_blank" rel="noopener noreferrer" aria-label={s.name} title={s.name}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                  <path d={s.path} />
                </svg>
              </a>
            </li>
          ))}
        </ul>
      </div>
      <nav className="home-footer-legal" aria-label={t('Legal')}>
        {!isPhone() && <Link to="/download">{t('Play on your computer')}</Link>}
        <Link to="/about">{t('About')}</Link>
        <Link to="/terms">{t('Terms')}</Link>
        <Link to="/privacy">{t('Privacy')}</Link>
        <SourceLink />
      </nav>
    </footer>
  );
}
