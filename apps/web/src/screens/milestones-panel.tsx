// SPDX-License-Identifier: GPL-2.0-or-later
// Marcos do perfil (OG-393, RN-SOC-03/06): seções por grupo com ícone (OG-395), progresso dos marcos
// com alvo, raridade e os secretos. O texto de um secreto só vem da API para quem o desbloqueou;
// bloqueado, ele é "Marco secreto · ???" com o ícone genérico, sem nome nem condição.
import { MILESTONE_TOTALS, MILESTONES, milestoneIconSvg, milestoneTarget, publicMilestoneIcon, secretMilestoneIcon, type MilestoneGroup, type MilestoneIconSpec } from '@outgun/content';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { usePrefs } from '../app/prefs.js';
import { Panel } from '../ui/Panel.js';
import { date, type Profile } from './stats.js';

const GROUPS: readonly Exclude<MilestoneGroup, 'secret'>[] = ['progress', 'flag', 'defense', 'combat', 'ranked', 'social', 'clan', 'humor'];
const GROUP_LABELS: Readonly<Record<MilestoneGroup, string>> = {
  progress: 'Progress',
  flag: 'Flag',
  defense: 'Defense',
  combat: 'Combat',
  ranked: 'Ranked',
  social: 'Social',
  clan: 'Clan',
  humor: 'Humor',
  secret: 'Secrets',
};

function Icon({ spec, locked }: { spec: MilestoneIconSpec; locked: boolean }) {
  // SVG gerado pelo catálogo (sem texto do usuário)
  return <span className="milestone-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: milestoneIconSvg(spec, { locked }) }} />;
}

interface Got {
  achievedAt: string;
  matchId: string | null;
}

function Card(props: { spec: MilestoneIconSpec; name: string; description: string; got: Got | undefined; progress?: { value: number; target: number; hours: boolean } | undefined; rarity: number | undefined; extra?: string | undefined }) {
  const { t, prefs } = usePrefs();
  const { got, progress } = props;
  const share = props.rarity === undefined ? null : props.rarity < 0.001 && props.rarity > 0 ? '<0.1' : (props.rarity * 100).toFixed(props.rarity < 0.1 ? 1 : 0);
  const unit = (v: number) => (progress?.hours ? Math.floor(v / 3600) : v);
  return (
    <li className={got ? 'won' : 'locked'}>
      <Icon spec={props.spec} locked={!got} />
      <div className="milestone-body">
        <strong>{props.name}</strong>
        <span className="ui-muted">{props.description}</span>
        {got ? (
          <span className="profile-milestone-date">{got.matchId ? <Link to={`/matches/${got.matchId}`}>{date(got.achievedAt, prefs.locale)}</Link> : date(got.achievedAt, prefs.locale)}</span>
        ) : progress ? (
          <span className="milestone-progress">
            <span className="milestone-bar" role="progressbar" aria-valuemin={0} aria-valuemax={progress.target} aria-valuenow={Math.min(progress.value, progress.target)}>
              <span style={{ width: `${Math.min(100, (progress.value / progress.target) * 100)}%` }} />
            </span>
            <span className="ui-muted">
              {unit(Math.min(progress.value, progress.target))}/{unit(progress.target)}
              {progress.hours ? ' h' : ''}
            </span>
          </span>
        ) : (
          <span className="ui-muted">{t('Locked')}</span>
        )}
        {share !== null && <span className="ui-muted milestone-rarity">{t('$1% of players', share)}</span>}
        {props.extra && <span className="ui-muted milestone-rarity">{props.extra}</span>}
      </div>
    </li>
  );
}

export function MilestonesPanel({ p }: { p: Profile }) {
  const { t, prefs } = usePrefs();
  const l = prefs.locale === 'pt-BR' ? 'pt-BR' : 'en';
  const won = new Map(p.milestones.map((m) => [m.id, m]));
  const secrets = p.secrets ?? { total: 0, unlocked: [] };
  const total = MILESTONES.length + secrets.total;
  const progressOf = (id: string) => {
    const target = milestoneTarget(id);
    const value = p.milestoneProgress?.[id];
    return target === undefined || value === undefined ? undefined : { value, target, hours: MILESTONE_TOTALS[id]?.counter === 'playSeconds' };
  };
  const hidden = secrets.total - secrets.unlocked.length;
  // chegou pelo link dos marcos (tela inicial): rola até o painel
  useEffect(() => {
    if (location.hash === '#milestones') document.getElementById('milestones')?.scrollIntoView({ block: 'start' });
  }, []);
  return (
    <Panel id="milestones" title={`${t('Milestones')} · ${won.size}/${total}`}>
      {GROUPS.map((g) => {
        const list = MILESTONES.filter((m) => m.group === g);
        if (list.length === 0) return null;
        return (
          <section key={g} className="milestone-group">
            <h3>
              {t(GROUP_LABELS[g])} · {list.filter((m) => won.has(m.id)).length}/{list.length}
            </h3>
            <ul className="profile-milestones">
              {list.map((m) => (
                <Card key={m.id} spec={publicMilestoneIcon(m.id)!} name={m.name[l]} description={m.description[l]} got={won.get(m.id)} progress={progressOf(m.id)} rarity={p.milestoneRarity?.[m.id]} />
              ))}
            </ul>
          </section>
        );
      })}
      {secrets.total > 0 && (
        <section className="milestone-group">
          <h3>
            {t(GROUP_LABELS.secret)} · {secrets.unlocked.length}/{secrets.total}
          </h3>
          {hidden > 0 && <p className="ui-muted">{hidden === 1 ? t('1 secret left to discover') : t('$1 secrets left to discover', String(hidden))}</p>}
          <ul className="profile-milestones">
            {secrets.unlocked.map((s) => (
              <Card
                key={s.id}
                spec={secretMilestoneIcon(true)}
                name={s.name[l]}
                description={s.description[l]}
                got={won.get(s.id)}
                rarity={p.milestoneRarity?.[s.id]}
                extra={s.firstBy ? t('Discovered first by $1', s.firstBy) : undefined}
              />
            ))}
            {Array.from({ length: hidden }, (_, i) => (
              <Card key={`hidden-${i}`} spec={secretMilestoneIcon(false)} name={t('Secret milestone')} description="???" got={undefined} rarity={undefined} />
            ))}
          </ul>
        </section>
      )}
    </Panel>
  );
}
