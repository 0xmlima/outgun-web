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
import { api } from '../app/api.js';
import { type EmphasizeFlags, type MinimapPlayers, type NeighborMarkers, type Prefs, QUICK_MESSAGE_LENGTH, type ShowNames, type ShowStats, type SkipMaps, usePrefs, type ViewOverBorder } from '../app/prefs.js';
import { ChoiceField, FieldGroup, SliderField, TextField, ToggleField } from '../ui/Field.js';
import { MenuList } from '../ui/MenuList.js';
import { Page } from '../ui/Page.js';
import { Panel } from '../ui/Panel.js';
import { Tabs } from '../ui/Tabs.js';
import { ControlsPanel } from './ControlsScreen.js';

/** Limites de FPS oferecidos (o original aceita 1..10000; 60 é o padrão). */
const FPS_LIMITS = [30, 50, 60, 75, 100, 120, 144, 200, 240, 10000];

/** Troca de lugar a cor selecionada com a vizinha (`Colorselect::handleKey` com Ctrl). */
export function moveColor(colors: readonly number[], selected: number, delta: -1 | 1, carry: boolean): { colors: number[]; selected: number } {
  const next = selected + delta;
  if (next < 0 || next >= colors.length) return { colors: [...colors], selected };
  const out = [...colors];
  if (carry) [out[selected], out[next]] = [out[next]!, out[selected]!];
  return { colors: out, selected: next };
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
function FavoriteColors({ label, colors, order, disabled, onChange }: { label: string; colors: readonly string[]; order: readonly number[]; disabled: boolean; onChange: (order: number[]) => void }) {
  const [selected, setSelected] = useState(0);
  const move = (delta: -1 | 1, carry: boolean) => {
    const r = moveColor(order, selected, delta, carry);
    setSelected(r.selected);
    if (carry) onChange(r.colors);
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
            onClick={() => !disabled && setSelected(i)}
          />
        ))}
      </div>
    </div>
  );
}

export function OptionsScreen() {
  const { t, prefs, setPrefs } = usePrefs();
  const { user } = useAccount();
  const navigate = useNavigate();
  const { section } = useParams();
  const tab = optionsTab(section);
  const lists = useManifestLists();
  const [ranking, setRanking] = useState<boolean | null>(null);
  useEffect(() => {
    if (tab !== 'game' || !user) return;
    let alive = true;
    void api<{ participate: boolean }>('/account/ranking').then(
      (r) => alive && setRanking(r.participate),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [tab, user]);

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
              <FavoriteColors label={t('Favorite colors')} colors={lists.playerColours} order={prefs.favoriteColors} disabled={prefs.randomColor} onChange={(favoriteColors) => setPrefs({ favoriteColors })} />
              {toggle('randomColor', 'Use random color')}
              <ToggleField
                label={t('Take part in the ranking')}
                checked={user ? (ranking ?? true) : false}
                disabled={!user || ranking === null}
                hint={user ? undefined : t('needs an account')}
                onChange={(next) => {
                  setRanking(next);
                  void api('/account/ranking', { method: 'PUT', body: { participate: next } }).catch(() => setRanking(!next));
                }}
              />
            </FieldGroup>
          </Panel>
          <Panel title={t('Game options')}>
            <FieldGroup>
              {toggle('lagPrediction', 'Lag prediction')}
              <SliderField label={t('Lag prediction amount')} value={prefs.lagPredictionAmount} min={0} max={10} disabled={!prefs.lagPrediction} onChange={(v) => setPrefs({ lagPredictionAmount: v })} />
              <SliderField label={t('Bandwidth for out-of-room players (cps)')} value={prefs.minimapBandwidth} min={0} max={640} step={20} onChange={(v) => setPrefs({ minimapBandwidth: v })} />
              {toggle('shareNetStats', 'Send anonymous network statistics')}
              {toggle('showFlagMessages', 'Show flag messages')}
              {toggle('showKillMessages', 'Show killing messages')}
              {select<ShowStats>('showStats', 'Show stats after the round', [
                ['off', 'off'],
                ['teams', 'teams'],
                ['players', 'players'],
              ])}
              {toggle('showServerInfo', 'Show server info when connected')}
              {toggle('stayDeadInMenus', 'Stay dead when in a menu at round start')}
              {toggle('underlineAccounts', 'Underline players with an account')}
              {select<SkipMaps>('skipMaps', 'Skip maps in rotation', [
                ['none', 'none'],
                ['dimmed', 'dimmed'],
                ['highlighted', 'all but highlighted'],
              ])}
            </FieldGroup>
          </Panel>
          <Panel title={t('Quick messages')}>
            <FieldGroup>
              {toggle('quickMessagesEnabled', 'Enable quick messages')}
              {toggle('quickMessagesImmediate', 'Send message immediately')}
              {prefs.quickMessages.map((text, i) => (
                <TextField
                  key={i}
                  label={t('Alt+$1', String((i + 1) % 10))}
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
              {named('Colour theme', prefs.colourTheme, lists.colourThemes, '<default>', (colourTheme) => setPrefs({ colourTheme }))}
              {toggle('preferThemeColours', 'Prefer main theme colours')}
              {named('Background theme', prefs.backgroundTheme, lists.backgrounds, '<no background>', (backgroundTheme) => setPrefs({ backgroundTheme }))}
              {toggle('preferThemeBackground', 'Prefer main theme background')}
            </FieldGroup>
          </Panel>
          <Panel title={t('Graphic options')}>
            <FieldGroup>
              {select<ShowNames>('showNames', 'Show player names', [
                ['never', 'never'],
                ['sameRoom', 'in same room'],
                ['always', 'always'],
              ])}
              <SliderField label={t('Rooms on screen in each direction in game')} value={prefs.visibleRooms} min={1} max={20} onChange={(v) => setPrefs({ visibleRooms: v })} />
              {toggle('scroll', 'Scrolling')}
              {toggle('lessTransparency', 'Less transparency effects')}
              {toggle('continuousTextures', 'Continuous textures between rooms')}
              {select<MinimapPlayers>('minimapPlayers', 'Disappeared players on minimap', [
                ['fade', 'fade out'],
                ['hideEarly', 'hide early'],
                ['hideLate', 'hide late'],
              ])}
              {toggle('highlightReturnedFlags', 'Highlight returned and dropped flags')}
              {select<EmphasizeFlags>('emphasizeFlags', 'Make flags extra-visible', [
                ['never', 'never'],
                ['multiRoom', 'multi-roomed'],
                ['always', 'always'],
              ])}
              {toggle('oldFlagPositions', 'Show flag disappearance positions')}
              {toggle('spawnHighlight', 'Highlight self after spawn')}
              {select<NeighborMarkers>('neighborMarkers', 'Markers for nearby players and flags in game', [
                ['never', 'never'],
                ['oneRoom', 'single-roomed'],
                ['always', 'always'],
              ])}
              {toggle('boxVisibleArea', 'Box visible area on map in game')}
              {select<ViewOverBorder>('viewOverBorder', 'Let view follow over map border', [
                ['never', 'never'],
                ['mapDoesntFit', "when all rooms aren't shown"],
                ['mapWraps', 'if the border has doorways'],
                ['always', 'always'],
              ])}
              {toggle('repeatMap', 'Allow parts of map to repeat on screen')}
              {toggle('highlightUnknownMaps', 'Highlight maps not in the game')}
              <SliderField label={t('Stats screen alpha')} value={prefs.statsAlpha} min={0} max={255} step={15} onChange={(v) => setPrefs({ statsAlpha: v })} />
              {toggle('mapInfoMode', 'Map info mode')}
              <ChoiceField
                label={t('FPS limit')}
                value={String(FPS_LIMITS.includes(prefs.fpsLimit) ? prefs.fpsLimit : 60)}
                options={FPS_LIMITS.map((v) => ({ value: String(v), label: String(v) }))}
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
            <ToggleField label={t('Play the soundtrack')} checked={prefs.musicEnabled} onChange={(musicEnabled) => setPrefs({ musicEnabled })} hint={t('"Outgun Epic" in the menus; the other tracks shuffled in Casual matches.')} />
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
    <Page title={t('Options')} onBack={() => void navigate('/')} backLabel={t('Back')}>
      <Tabs
        label={t('Options')}
        value={tab}
        onChange={(next) => void navigate(`/options/${next}`, { replace: true })}
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
    </Page>
  );
}
