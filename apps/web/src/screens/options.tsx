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
import { desktopBridge, FPS_UNLIMITED } from '../app/install.js';
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

/** Limites de FPS oferecidos (o original aceita 1..10000; 60 é o padrão). */
// 0 = sem limite (o navegador ainda segue a taxa de atualização do monitor)
/** FPS acima da taxa do monitor: só no cliente desktop com o VSync desligado nesta abertura (OG-373). */
const fpsUnlocked = desktopBridge()?.frameRateActive() === 'unlocked';
/** 0 = automático (taxa do monitor; 240 sem VSync); "sem limite" de verdade só sem VSync. */
const FPS_LIMITS = [0, 30, 50, 60, 75, 100, 120, 144, 200, 240, ...(fpsUnlocked ? [FPS_UNLIMITED] : [])];

/** VSync do cliente desktop (OG-373, D-73): gravado pelo cliente e aplicado ao reabrir o jogo. */
function VsyncField() {
  const { t } = usePrefs();
  const bridge = desktopBridge();
  const [mode, setMode] = useState(() => bridge?.frameRate() ?? 'unlocked');
  if (!bridge) return null;
  const pending = mode !== bridge.frameRateActive();
  return (
    <ToggleField
      label={t('Vertical sync (VSync)')}
      checked={mode === 'vsync'}
      hint={t(pending ? 'Takes effect when you reopen the game.' : 'Off: more frames and less screen delay, but more heat and possible tearing.')}
      onChange={(on) => {
        const next = on ? 'vsync' : 'unlocked';
        bridge.setFrameRate(next);
        setMode(next);
      }}
    />
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
        playerColours: Array.from({ length: 16 }, (_, i) => m.defaultColours[`player${String(i + 1).padStart(2, '0')}`] ?? '#888888'),
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
function FavoriteColors({ label, hint, colors, order, disabled, onChange }: { label: string; hint: string; colors: readonly string[]; order: readonly number[]; disabled: boolean; onChange: (order: number[]) => void }) {
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
            style={{ background: colors[c] ?? '#888888' }}
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
              <FavoriteColors label={t('Favorite colors')} hint={t('Click a colour to make it your first choice; Ctrl+arrows reorder.')} colors={lists.playerColours} order={prefs.favoriteColors} disabled={prefs.randomColor} onChange={(favoriteColors) => setPrefs({ favoriteColors })} />
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
              {toggle('scroll', 'Scrolling')}
              {toggle('lessTransparency', 'Less transparency effects')}
              {toggle('continuousTextures', 'Continuous textures between rooms')}
              <VsyncField />
              <ChoiceField
                label={t('FPS limit')}
                value={String(FPS_LIMITS.includes(prefs.fpsLimit) ? prefs.fpsLimit : 0)}
                options={FPS_LIMITS.map((v) => ({ value: String(v), label: v === 0 ? t(fpsUnlocked ? 'automatic (240)' : 'monitor refresh rate') : v === FPS_UNLIMITED ? t('unlimited') : String(v) }))}
                hint={fpsUnlocked ? undefined : t(desktopBridge() ? 'Turn off vertical sync to go above the monitor refresh rate.' : 'Browsers draw at most once per monitor refresh. The desktop client (Steam) can go above it.')}
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
