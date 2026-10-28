// SPDX-License-Identifier: GPL-2.0-or-later
// Página /dev/ui (só no desenvolvimento): todos os componentes do design system v2 (OG-200) para
// revisão visual. Textos fixos em pt-BR: não é tela do jogador.
import { useState } from 'react';
import { Badge, Button } from '../ui/Button.js';
import { ChoiceField, FieldGroup, SliderField, TextField, ToggleField } from '../ui/Field.js';
import { useGamepadKeys } from '../ui/gamepad.js';
import { MenuList } from '../ui/MenuList.js';
import { Panel } from '../ui/Panel.js';
import { StyleRadar } from '../ui/StyleRadar.js';
import { STYLE_AXES, type StyleAxisValue } from '../ui/style-radar.js';
import { Table } from '../ui/Table.js';
import { Tabs } from '../ui/Tabs.js';
import { useToast } from '../ui/Toast.js';

const COLORS = ['--surface-0', '--surface-1', '--surface-2', '--surface-3', '--border', '--accent', '--danger'];
const TEXTS = ['--text', '--text-muted', '--text-accent', '--text-success', '--text-warning', '--text-danger', '--text-team-red', '--text-team-blue'];

interface Player {
  readonly name: string;
  readonly clan: string;
  readonly rating: number;
  readonly kills: number;
  readonly deaths: number;
}

const PLAYERS: readonly Player[] = [
  { name: 'Huntta', clan: 'OG', rating: 1834, kills: 412, deaths: 260 },
  { name: 'Nosferatu', clan: 'BR', rating: 1720, kills: 377, deaths: 301 },
  { name: 'ThOR27', clan: 'BR', rating: 1655, kills: 290, deaths: 244 },
  { name: 'Spinal', clan: '', rating: 1512, kills: 198, deaths: 230 },
];

/** Radar de exemplo (OG-470): percentis na ordem fixa dos eixos e valores brutos ilustrativos. */
const radar = (p: readonly number[]): StyleAxisValue[] => STYLE_AXES.map((axis, i) => ({ axis, percentile: p[i]!, value: axis === 'accuracy' ? p[i]! / 250 : axis === 'survival' ? 20 + p[i]! : p[i]! / 12 }));
const RADAR_A = radar([88, 72, 40, 25, 35, 50]);
const RADAR_B = radar([30, 45, 60, 92, 55, 70]);
const RADAR_C = radar([50, 20, 85, 40, 90, 35]);

export default function DevUiScreen() {
  useGamepadKeys();
  const toast = useToast();
  const [name, setName] = useState('Jogador');
  const [password, setPassword] = useState('123');
  const [mode, setMode] = useState<'casual' | 'ranked'>('casual');
  const [music, setMusic] = useState(true);
  const [volume, setVolume] = useState(70);
  const [tab, setTab] = useState<'overview' | 'matches' | 'teammates'>('overview');
  const [last, setLast] = useState('—');

  return (
    <div className="ui-page">
      <div className="ui-container ui-stack">
        <header className="ui-stack">
          <h1 style={{ fontSize: 'var(--text-2xl)' }}>Design system v2</h1>
          <p className="ui-muted">
            OG-200 · fonte Inter · tokens em <code>src/ui/tokens.css</code> · teclado, mouse, toque e gamepad
          </p>
        </header>

        <Panel title="Cores e texto">
          <div className="ui-row">
            {COLORS.map((c) => (
              <div key={c} className="ui-stack" style={{ gap: 'var(--space-1)', width: '7.5rem' }}>
                <div style={{ height: '3rem', background: `var(${c})`, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }} />
                <small className="ui-muted">{c}</small>
              </div>
            ))}
          </div>
          <div className="ui-row">
            {TEXTS.map((c) => (
              <span key={c} style={{ color: `var(${c})` }}>
                {c}
              </span>
            ))}
          </div>
          <div className="ui-stack" style={{ gap: 'var(--space-1)' }}>
            {(['2xl', 'xl', 'lg', 'md', 'sm', 'xs'] as const).map((s) => (
              <span key={s} style={{ fontSize: `var(--text-${s})` }}>
                {s} · Áá Çç Ää Öö Åå — Jogar agora, Pelaa nyt, Gioca ora
              </span>
            ))}
          </div>
        </Panel>

        <Panel title="Botões e selos" actions={<Button variant="ghost">Ação</Button>}>
          <div className="ui-row">
            <Button variant="primary" size="lg">
              Jogar agora
            </Button>
            <Button variant="primary">Primário</Button>
            <Button>Secundário</Button>
            <Button variant="ghost">Discreto</Button>
            <Button variant="danger">Apagar conta</Button>
            <Button disabled>Desabilitado</Button>
          </div>
          <div className="ui-row">
            <Badge>Convidado</Badge>
            <Badge tone="accent">Casual</Badge>
            <Badge tone="success">Online</Badge>
            <Badge tone="warning">Beta</Badge>
            <Badge tone="danger">Ranked</Badge>
          </div>
        </Panel>

        <div className="ui-row" style={{ alignItems: 'stretch' }}>
          <Panel title="Lista de opções" className="ui-grow">
            <MenuList
              label="Menu de exemplo"
              items={[
                { label: 'Jogar agora', description: 'Entra numa sala casual com vaga', onActivate: () => setLast('Jogar agora') },
                { label: 'Salas', aside: <Badge tone="success">12 online</Badge>, onActivate: () => setLast('Salas') },
                { label: 'Ranking', onActivate: () => setLast('Ranking') },
                { label: 'Replays', description: 'Em breve', disabled: true, onActivate: () => setLast('Replays') },
                { label: 'Opções', onActivate: () => setLast('Opções') },
              ]}
              onBack={() => setLast('Esc')}
            />
            <p className="ui-muted">Último: {last}</p>
          </Panel>

          <Panel title="Campos" className="ui-grow">
            <FieldGroup label="Campos de exemplo">
              <TextField label="Nome" value={name} onChange={setName} maxLength={15} hint="Até 15 caracteres." />
              <TextField label="Senha" type="password" value={password} onChange={setPassword} error={password.length < 8 ? 'A senha precisa ter pelo menos 8 caracteres.' : undefined} />
              <ChoiceField
                label="Modo"
                value={mode}
                options={[
                  { value: 'casual', label: 'Casual' },
                  { value: 'ranked', label: 'Ranked' },
                ]}
                onChange={setMode}
              />
              <ToggleField label="Trilha sonora" checked={music} onChange={setMusic} hint="Música no menu e nas partidas casuais." />
              <SliderField label="Volume da música" value={volume} min={0} max={100} step={5} format={(v) => `${v}%`} onChange={setVolume} disabled={!music} />
            </FieldGroup>
          </Panel>
        </div>

        <Panel title="Abas e tabela">
          <Tabs
            label="Perfil"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'overview', label: 'Visão geral' },
              { id: 'matches', label: 'Partidas' },
              { id: 'teammates', label: 'Companheiros' },
            ]}
          >
            <Table
              caption="Ranking de exemplo"
              rows={tab === 'teammates' ? [] : PLAYERS}
              rowKey={(p) => p.name}
              onRowActivate={(p) => toast(`Perfil de ${p.name}`, 'accent')}
              empty="Nenhum companheiro ainda."
              columns={[
                { key: 'pos', header: '#', cell: (p) => PLAYERS.indexOf(p) + 1, align: 'end' },
                { key: 'name', header: 'Jogador', cell: (p) => <strong>{p.name}</strong> },
                { key: 'clan', header: 'Clã', cell: (p) => p.clan || '—' },
                { key: 'rating', header: 'Rating', cell: (p) => p.rating, align: 'end' },
                { key: 'kills', header: 'Kills', cell: (p) => p.kills, align: 'end' },
                { key: 'deaths', header: 'Deaths', cell: (p) => p.deaths, align: 'end' },
              ]}
            />
          </Tabs>
        </Panel>

        <Panel title="Radar de estilo">
          <div className="ui-row" style={{ alignItems: 'flex-start' }}>
            <StyleRadar caption="Uma série" series={[{ key: 'a', label: 'Huntta', axes: RADAR_A }]} />
            <StyleRadar
              caption="Duas séries"
              series={[
                { key: 'a', label: 'Huntta', axes: RADAR_A },
                { key: 'b', label: 'Nosferatu', axes: RADAR_B },
              ]}
            />
            <StyleRadar
              caption="Três séries e sombra"
              series={[
                { key: 'a', label: 'Huntta', axes: RADAR_A },
                { key: 'b', label: 'Nosferatu', axes: RADAR_B },
                { key: 'c', label: 'ThOR27', axes: RADAR_C },
              ]}
              shadow={{ key: 'top', label: 'Top 10 do mês', axes: radar([70, 70, 70, 70, 70, 70]) }}
            />
            <StyleRadar
              caption="Temporada passada tracejada"
              series={[
                { key: 'now', label: 'Esta temporada', axes: RADAR_A },
                { key: 'before', label: 'Temporada passada', axes: RADAR_C, dashed: true, color: 'var(--text-muted)' },
              ]}
            />
            <StyleRadar caption="Sem dados" series={[]} empty="Jogue 3 ranqueadas para ver o radar" />
          </div>
          <div className="ui-row">
            {[RADAR_A, RADAR_B, RADAR_C].map((axes, n) => (
              <StyleRadar key={n} mini caption={`Mini ${n + 1}`} series={[{ key: 'm', label: 'Membro', axes }]} />
            ))}
            <StyleRadar mini caption="Mini sem dados" series={[]} empty="—" />
          </div>
        </Panel>

        <Panel title="Avisos">
          <div className="ui-row">
            <Button onClick={() => toast('Opções salvas.')}>Neutro</Button>
            <Button onClick={() => toast('Conta criada!', 'success')}>Sucesso</Button>
            <Button onClick={() => toast('Conexão instável.', 'warning')}>Atenção</Button>
            <Button onClick={() => toast('Não foi possível entrar na sala.', 'danger')}>Erro</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
