// SPDX-License-Identifier: GPL-2.0-or-later
// Opções do jogador (OG-068, spec plan/specs/opcoes-jogador.md): os submenus do `Menu_options` do
// original com as opções que fazem sentido no navegador. As removidas (modo de vídeo, joystick da
// Allegro, arquivos de log, senha de ranking, relatório de bugs) estão listadas na spec. No design
// system v2 (OG-202): uma página com abas; as URLs antigas de cada submenu abrem a aba que o contém.
import { catalog, LOCALES } from '@outgun/i18n';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { loadManifest } from '../assets.js';
import { useAccount } from '../app/account.js';
import { desktopBridge, type DisplayModes, FPS_UNLIMITED, fpsUnlocked } from '../app/install.js';
import { BOT_LEVEL_CHOICES, CASUAL_MAX_BOTS, HUD_SCALES, type Prefs, QUICK_MESSAGE_LENGTH, type ShowNames, type ShowStats, type SkipMaps, usePrefs } from '../app/prefs.js';
import { useSaveStatus } from '../app/prefs-sync.js';
import { IS_MAC } from '../game/input/shortcuts.js';
import { Button } from '../ui/Button.js';
import { ChoiceField, FieldGroup, SliderField, TextField, ToggleField } from '../ui/Field.js';
import { MenuList } from '../ui/MenuList.js';
import { Page } from '../ui/Page.js';
import { Panel } from '../ui/Panel.js';
import { Tabs } from '../ui/Tabs.js';
import { ControlsPanel } from './ControlsScreen.js';
import { ALL_COLORS, colourKey, EXTRA_COLOUR_DEFAULTS, isMedalColor, medalColor } from '@outgun/protocol';
import { api } from '../app/api.js';

/**
 * Limites de FPS (OG-400, "liberar geral"): no cliente desktop o FPS é sempre livre e nunca fica
 * abaixo de 240 (automático); no navegador quem manda é a taxa do monitor, então não há o que escolher.
 */
const FPS_LIMITS = fpsUnlocked() ? [0, 360, 480, FPS_UNLIMITED] : [0];

/** "1920x1080@144" → "1920 × 1080 · 144 Hz". */
const modeLabel = (mode: string) => mode.replace(/^(\d+)x(\d+)@(\d+)$/, '$1 × $2 · $3 Hz');

/**
 * Resolução do monitor (OG-401, cliente para Windows): o modo vale em tela cheia e o Windows volta à
 * resolução normal ao trocar de janela ou sair do jogo. Escolher não aplica: cada troca apaga a tela
 * por um instante, então só o botão aplica.
 */
function DisplayModeField() {
  const { t } = usePrefs();
  const bridge = desktopBridge();
  const [info, setInfo] = useState<DisplayModes | null>(() => bridge?.displayModes?.() ?? null);
  const [choice, setChoice] = useState(() => info?.current ?? 'system');
  if (!bridge?.setDisplayMode || !info || info.modes.length === 0) return null;
  const applied = info.current ?? 'system';
  const system = info.system ? `${t('system')} (${modeLabel(info.system)})` : t('system');
  return (
    <>
      <ChoiceField
        label={t('Monitor resolution')}
        value={choice}
        options={[{ value: 'system', label: system }, ...info.modes.map((m) => ({ value: m, label: modeLabel(m) }))]}
        hint={info.launch ? t('The launch option --resolution=$1 is in use; this choice applies without it.', info.launch) : t('Full screen only (F11). Alt+Tab and leaving the game bring back the normal resolution.')}
        onChange={setChoice}
      />
      {choice !== applied && (
        <div className="options-hud-edit">
          <Button
            onClick={() => {
              bridge.setDisplayMode?.(choice === 'system' ? null : choice);
              setInfo(bridge.displayModes?.() ?? null);
            }}
          >
            {t('Apply resolution')}
          </Button>
          <span>{t('The screen may go black for a moment.')}</span>
        </div>
      )}
    </>
  );
}

/** Troca de lugar a cor selecionada com a vizinha (`Colorselect::handleKey` com Ctrl). */
export function moveColor(colors: readonly number[], selected: number, delta: -1 | 1, carry: boolean): { colors: number[]; selected: number } {
  const next = selected + delta;
  if (next < 0 || next >= colors.length) return { colors: [...colors], selected };
  const out = [...colors];
  if (carry) [out[selected], out[next]] = [out[next]!, out[selected]!];
  return { colors: out, selected: next };
}

/** A cor `index` vira a primeira favorita; as outras seguem na ordem (OG-285). */
export function preferColor(colors: readonly number[], index: number): number[] {
  const chosen = colors[index];
  if (chosen === undefined || index === 0) return [...colors];
  return [chosen, ...colors.filter((_, i) => i !== index)];
}

export function useManifestLists() {
  const [lists, setLists] = useState<{ themes: string[]; colourThemes: string[]; backgrounds: string[]; soundThemes: string[]; playerColours: string[] }>({
    themes: [],
    backgrounds: [],
    colourThemes: [],
    soundThemes: [],
    playerColours: [],
  });
  useEffect(() => {
    let alive = true;
    void loadManifest().then((m) => {
      if (!alive || !m) return;
      setLists({
        themes: Object.keys(m.graphics),
        colourThemes: Object.entries(m.graphics).filter(([, v]) => v.colours).map(([k]) => k),
        backgrounds: Object.entries(m.graphics).filter(([, v]) => v.graphics.background).map(([k]) => k),
        soundThemes: Object.keys(m.sounds),
        playerColours: Array.from({ length: ALL_COLORS }, (_, i) => m.defaultColours[colourKey(i)] ?? EXTRA_COLOUR_DEFAULTS[colourKey(i)] ?? '#888888'),
      });
    });
    return () => {
      alive = false;
    };
  }, []);
  return lists;
}

export type OptionsTab = 'game' | 'graphics' | 'sounds' | 'controls' | 'language';
export const OPTIONS_TABS: readonly OptionsTab[] = ['game', 'graphics', 'sounds', 'controls', 'language'];

/** Aba de cada endereço `/options/:section` (os submenus antigos continuam valendo). */
export function optionsTab(section: string | undefined): OptionsTab {
  switch (section) {
    case 'player':
    case 'quick-messages':
      return 'game';
    case 'theme':
      return 'graphics';
    default:
      return OPTIONS_TABS.includes(section as OptionsTab) ? (section as OptionsTab) : 'game';
  }
}

/** Cores favoritas (`Colorselect`): ←/→ escolhem a cor; Ctrl+←/→ (ou +/−) levam a cor junto. */
/** Amostra da cor; a medalha com o brilho metálico, como no boneco (OG-411). */
export const swatchBackground = (c: number, colour: string | undefined) => (isMedalColor(c) ? `linear-gradient(160deg, #ffffff 0%, ${colour ?? '#888888'} 45%, ${colour ?? '#888888'} 100%)` : (colour ?? '#888888'));

/** Ordem mostrada: a paleta e, para o pódio do mês anterior, a medalha dele (as outras somem). */
export function shownColors(order: readonly number[], medal: number | null): number[] {
  const mine = medal ? medalColor(medal) : undefined;
  const out = order.filter((c) => !isMedalColor(c) || c === mine);
  if (mine !== undefined && !out.includes(mine)) out.push(mine);
  return out;
}

function FavoriteColors({ label, hint, colors, order, disabled, onChange, medalTitle }: { label: string; hint: string; colors: readonly string[]; order: readonly number[]; disabled: boolean; onChange: (order: number[]) => void; medalTitle?: string }) {
  const [selected, setSelected] = useState(0);
  const move = (delta: -1 | 1, carry: boolean) => {
    const r = moveColor(order, selected, delta, carry);
    setSelected(r.selected);
    if (carry) onChange(r.colors);
  };
  const prefer = (i: number) => {
    onChange(preferColor(order, i));
    setSelected(0);
  };
  return (
    <div className="ui-field">
      <span className="ui-field-label" id="favorite-colors">
        {label}
      </span>
      <div
        className={disabled ? 'options-colors disabled' : 'options-colors'}
        role="listbox"
        aria-labelledby="favorite-colors"
        aria-disabled={disabled || undefined}
        aria-activedescendant={`favorite-color-${selected}`}
        tabIndex={disabled ? -1 : 0}
        data-ui-control=""
        onKeyDown={(ev) => {
          if (disabled) return;
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            return prefer(selected);
          }
          const left = ev.key === 'ArrowLeft' || ev.key === '+';
          const right = ev.key === 'ArrowRight' || ev.key === '-';
          if (!left && !right) return;
          ev.preventDefault();
          move(left ? -1 : 1, ev.ctrlKey || ev.metaKey || ev.key === '+' || ev.key === '-');
        }}
      >
        {order.map((c, i) => (
          <span
            key={c}
            id={`favorite-color-${i}`}
            role="option"
            aria-selected={i === selected}
            aria-label={String(i + 1)}
            className={i === selected ? 'swatch selected' : 'swatch'}
            title={isMedalColor(c) ? medalTitle : undefined}
            style={{ background: swatchBackground(c, colors[c]) }}
            onClick={() => !disabled && prefer(i)}
          />
        ))}
      </div>
      <p className="ui-field-hint">{hint}</p>
    </div>
  );
}

/** Onde as opções ficam salvas e se o envio para a conta deu certo (OG-285). */
export function SaveStatusLine({ account }: { account: boolean }) {
  const { t } = usePrefs();
  const status = useSaveStatus();
  const text = !account
    ? 'Changes are saved automatically on this browser.'
    : status === 'saving'
      ? 'Saving to your account...'
      : status === 'saved'
        ? 'Saved to your account.'
        : status === 'error'
          ? 'Could not save to your account; changes are kept on this browser.'
          : 'Changes are saved automatically to your account.';
  return (
    <span role="status" className={status === 'error' && account ? 'options-save error' : 'options-save'}>
      {t(text)}
    </span>
  );
}

/**
 * Abas das Opções: na página `/options` e por cima da partida, pelo menu do Esc (OG-339). `inGame`
 * esconde o que sairia da partida (editor do HUD).
 */
export function OptionsBody({ tab, onTab, inGame = false }: { readonly tab: OptionsTab; readonly onTab: (tab: OptionsTab) => void; readonly inGame?: boolean }) {
  const { t, prefs, setPrefs } = usePrefs();
  const { user } = useAccount();
  const navigate = useNavigate();
  const lists = useManifestLists();
  // pódio do mês anterior (OG-411): a cor da medalha aparece entre as favoritas
  const [medal, setMedal] = useState<number | null>(null);
  useEffect(() => {
    if (!user) return setMedal(null);
    let alive = true;
    api<{ medal?: number | null }>(`/players/${encodeURIComponent(user.username)}`).then(
      (p) => alive && setMedal(p.medal ?? null),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [user]);

  type BoolKey = { [K in keyof Prefs]: Prefs[K] extends boolean ? K : never }[keyof Prefs];
  const toggle = (key: BoolKey, label: string, disabled = false) => (
    <ToggleField label={t(label)} checked={prefs[key]} disabled={disabled} onChange={(on) => setPrefs({ [key]: on } as Partial<Prefs>)} />
  );
  const select = <T extends string>(key: keyof Prefs, label: string, options: readonly [T, string][]) => (
    <ChoiceField
      label={t(label)}
      value={prefs[key] as T}
      options={options.map(([value, text]) => ({ value, label: t(text) }))}
      onChange={(value) => setPrefs({ [key]: value } as Partial<Prefs>)}
    />
  );
  /** Escolha numa lista de nomes (temas); `''` aparece como `empty`. */
  const named = (label: string, value: string, names: readonly string[], empty: string | null, onChange: (v: string) => void) => {
    const all = empty === null ? names : ['', ...names];
    return (
      <ChoiceField
        label={t(label)}
        value={value}
        disabled={all.length < 2}
        options={(all.includes(value) ? all : [value, ...all]).map((v) => ({ value: v, label: v || t(empty ?? '') }))}
        onChange={onChange}
      />
    );
  };

  let content;
  switch (tab) {
    case 'game':
      content = (
        <>
          <Panel title={t('Player options')}>
            <FieldGroup>
              {user ? (
                <TextField label={t('Name')} value={user.username} onChange={() => {}} disabled hint={t('logged in as $1', user.username)} />
              ) : (
                <TextField label={t('Name')} value={prefs.playerName} onChange={(v) => setPrefs({ playerName: v })} maxLength={15} hint={t('guest')} />
              )}
              <FavoriteColors label={t('Favorite colors')} hint={t('Click a colour to make it your first choice; Ctrl+arrows reorder.')} colors={lists.playerColours} order={shownColors(prefs.favoriteColors, medal)} disabled={prefs.randomColor} onChange={(favoriteColors) => setPrefs({ favoriteColors })} medalTitle={t('Medal of the top 3 of last month')} />
              {toggle('randomColor', 'Use random color')}
            </FieldGroup>
          </Panel>
          <Panel title={t('Game options')}>
            <FieldGroup>
              {toggle('lagPrediction', 'Lag prediction')}
              <SliderField label={t('Lag prediction amount')} value={prefs.lagPredictionAmount} min={0} max={10} disabled={!prefs.lagPrediction} onChange={(v) => setPrefs({ lagPredictionAmount: v })} />
              {toggle('shareNetStats', 'Send anonymous network statistics')}
              {toggle('showInputLatency', 'Show input latency')}
              {toggle('showFlagMessages', 'Show flag messages')}
              {toggle('showKillMessages', 'Show killing messages')}
              {select<ShowStats>('showStats', 'Show stats after the round', [
                ['off', 'off'],
                ['teams', 'teams'],
                ['players', 'players'],
              ])}
              {toggle('underlineAccounts', 'Underline players with an account')}
              {select<SkipMaps>('skipMaps', 'Skip maps in rotation', [
                ['none', 'none'],
                ['dimmed', 'dimmed'],
                ['highlighted', 'all but highlighted'],
              ])}
            </FieldGroup>
          </Panel>
          <Panel title={t('Bots in your Casual rooms')}>
            <FieldGroup>
              <SliderField label={t('Number of bots')} value={prefs.casualBots} min={0} max={CASUAL_MAX_BOTS} onChange={(v) => setPrefs({ casualBots: v })} />
              <ChoiceField
                label={t('Bot level')}
                value={String(prefs.casualBotLevel)}
                options={BOT_LEVEL_CHOICES.map(([value, text]) => ({ value: String(value), label: t(text) }))}
                onChange={(v) => setPrefs({ casualBotLevel: Number(v) })}
                hint={t('Used when you create a private room and, as the room owner, from the next game on (game menu).')}
              />
            </FieldGroup>
          </Panel>
          <Panel title={t('Quick messages')}>
            <FieldGroup>
              {toggle('quickMessagesEnabled', 'Enable quick messages')}
              {toggle('quickMessagesImmediate', 'Send message immediately')}
              {prefs.quickMessages.map((text, i) => (
                <TextField
                  key={i}
                  label={t(IS_MAC ? 'Option+$1' : 'Alt+$1', String((i + 1) % 10))}
                  value={text}
                  maxLength={QUICK_MESSAGE_LENGTH}
                  onChange={(v) => setPrefs({ quickMessages: prefs.quickMessages.map((m, j) => (j === i ? v : m)) })}
                />
              ))}
            </FieldGroup>
          </Panel>
        </>
      );
      break;
    case 'graphics':
      content = (
        <>
          <Panel title={t('Theme')}>
            <FieldGroup>
              {named('Theme', prefs.graphicsTheme, lists.themes, '<no theme>', (graphicsTheme) => setPrefs({ graphicsTheme }))}
            </FieldGroup>
          </Panel>
          <Panel title={t('Menus')}>
            <FieldGroup>
              <ChoiceField
                label={t('Menu look')}
                value={prefs.menuTheme}
                options={[
                  { value: 'campo', label: t('Field (green, like the rooms)') },
                  { value: 'placar', label: t('Scoreboard (black, like the scoreboard)') },
                ]}
                onChange={(menuTheme) => setPrefs({ menuTheme })}
                hint={t('Only the screens outside the game change.')}
              />
            </FieldGroup>
          </Panel>
          <Panel title={t('Graphic options')}>
            <FieldGroup>
              <ChoiceField
                label={t('HUD scale')}
                value={prefs.hudScale}
                options={HUD_SCALES.map((value) => ({ value, label: value === 'auto' ? t('automatic (by screen size)') : `${value}×` }))}
                onChange={(hudScale) => setPrefs({ hudScale })}
                hint={t('Size of the chat, scoreboard and bars during the game.')}
              />
              <ChoiceField
                label={t('HUD style')}
                value={prefs.hudStyle}
                options={[
                  { value: 'classic', label: t('Classic (like the original)') },
                  { value: 'modern', label: t('Modern (big room, frags on TAB)') },
                  { value: 'custom', label: t('Custom') },
                ]}
                onChange={(hudStyle) => setPrefs({ hudStyle })}
                hint={t('Nothing is drawn over the room in any style.')}
              />
              {toggle('classicFragsOnTab', 'Classic HUD: frags only on TAB', prefs.hudStyle !== 'classic')}
              <div className="options-hud-edit">
                {!inGame && <Button onClick={() => void navigate('/options/hud')}>{t('Edit custom HUD...')}</Button>}
                <span>{t('Opens an example match where you move, resize and hide each part of the HUD.')}</span>
              </div>
              {select<ShowNames>('showNames', 'Show player names', [
                ['never', 'never'],
                ['sameRoom', 'in same room'],
                ['always', 'always'],
              ])}
              <SliderField label={t('Rooms on screen in each direction in game')} value={prefs.visibleRooms} min={1} max={20} onChange={(v) => setPrefs({ visibleRooms: v })} />
              {toggle('showNumbers', 'Show player numbers')}
              {toggle('spawnHighlight', 'Highlight self after spawn')}
              {toggle('scroll', 'Scrolling')}
              {toggle('lessTransparency', 'Less transparency effects')}
              {toggle('continuousTextures', 'Continuous textures between rooms')}
              <DisplayModeField />
              <ChoiceField
                label={t('FPS limit')}
                value={String(FPS_LIMITS.includes(prefs.fpsLimit) ? prefs.fpsLimit : 0)}
                options={FPS_LIMITS.map((v) => ({ value: String(v), label: v === 0 ? t(fpsUnlocked() ? 'automatic (240)' : 'monitor refresh rate') : v === FPS_UNLIMITED ? t('unlimited') : String(v) }))}
                hint={fpsUnlocked() ? undefined : t(desktopBridge() ? 'Reopen the game to unlock the FPS.' : 'Browsers draw at most once per monitor refresh. The desktop client (Steam) can go above it.')}
                onChange={(v) => setPrefs({ fpsLimit: Number(v) })}
              />
            </FieldGroup>
          </Panel>
        </>
      );
      break;
    case 'sounds':
      content = (
        <>
        <Panel title={t('Soundtrack')}>
          <FieldGroup>
            <ToggleField label={t('Play the soundtrack')} checked={prefs.musicEnabled} onChange={(musicEnabled) => setPrefs({ musicEnabled })} hint={t('The main theme opens the menus; then all tracks rotate. In Casual matches, every track but the theme, shuffled.')} />
            <SliderField label={t('Music volume')} value={prefs.musicVolume} min={0} max={100} step={5} format={(v) => `${v}%`} disabled={!prefs.musicEnabled} onChange={(musicVolume) => setPrefs({ musicVolume })} />
          </FieldGroup>
        </Panel>
        <Panel title={t('Sound effects')}>
          <FieldGroup>
            {toggle('soundEnabled', 'Sounds enabled')}
            <SliderField label={t('Volume')} value={prefs.soundVolume} min={0} max={255} step={15} format={(v) => `${Math.round((v / 255) * 100)}%`} disabled={!prefs.soundEnabled} onChange={(v) => setPrefs({ soundVolume: v })} />
            {named('Theme', prefs.soundTheme, lists.soundThemes, null, (soundTheme) => setPrefs({ soundTheme }))}
          </FieldGroup>
        </Panel>
        </>
      );
      break;
    case 'controls':
      content = <ControlsPanel />;
      break;
    case 'language':
      content = (
        <MenuList
          label={t('Choose language')}
          items={LOCALES.map((locale) => ({
            label: catalog(locale).name,
            aside: locale === prefs.locale ? '✓' : undefined,
            onActivate: () => setPrefs({ locale }),
          }))}
        />
      );
      break;
  }

  return (
      <Tabs
        label={t('Options')}
        value={tab}
        onChange={onTab}
        tabs={[
          { id: 'game', label: t('Game') },
          { id: 'graphics', label: t('Graphics') },
          { id: 'sounds', label: t('Audio') },
          { id: 'controls', label: t('Controls') },
          { id: 'language', label: t('Language') },
        ]}
      >
        <div className="ui-stack options-tab">{content}</div>
      </Tabs>
  );
}

export function OptionsScreen() {
  const { t } = usePrefs();
  const { user } = useAccount();
  const navigate = useNavigate();
  const { section } = useParams();
  return (
    <Page title={t('Options')} subtitle={<SaveStatusLine account={!!user} />} onBack={() => void navigate('/')} backLabel={t('Back')}>
      <OptionsBody tab={optionsTab(section)} onTab={(next) => void navigate(`/options/${next}`, { replace: true })} />
    </Page>
  );
}
