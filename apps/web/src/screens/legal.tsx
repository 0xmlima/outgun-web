// SPDX-License-Identifier: GPL-2.0-or-later
// Termos de uso, política de privacidade e "Sobre" (OG-107). O conteúdo vem de @outgun/content
// (o inventário de dados é conferido contra o banco por um teste da API). Em português para pt-BR;
// nos outros idiomas, em inglês.
import { DATA_INVENTORY, ORIGINAL_CREDITS, PRIVACY_SECTIONS, PRIVACY_VERSION, TERMS_SECTIONS, TERMS_VERSION, type Bilingual, type LegalSection } from '@outgun/content';
import { Link, useNavigate } from 'react-router';
import { SOURCE_URL } from '../app/Shell.js';
import { usePrefs } from '../app/prefs.js';
import { TextPage } from '../ui/TextPage.js';

function useLegalText(): (text: Bilingual) => string {
  const { prefs } = usePrefs();
  return (text) => text[prefs.locale === 'pt-BR' ? 'pt-BR' : 'en'];
}

function Sections({ sections }: { sections: readonly LegalSection[] }) {
  const tx = useLegalText();
  return (
    <>
      {sections.map((s) => (
        <section key={s.title.en} className="stats-section legal">
          <h2>{tx(s.title)}</h2>
          {s.paragraphs.map((p) => (
            <p key={p.en} className="stats-line">
              {tx(p)}
            </p>
          ))}
        </section>
      ))}
    </>
  );
}

/** Contato do responsável pelo serviço (VITE_OPERATOR_CONTACT no build). */
function OperatorContact() {
  const { t } = usePrefs();
  const contact = import.meta.env.VITE_OPERATOR_CONTACT;
  return <p className="stats-line">{t('Operator contact: $1', contact || t('to be defined by the operator'))}</p>;
}

export function TermsScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  return (
    <TextPage caption={t('Terms of use')} onBack={() => void navigate(-1)}>
      <p className="stats-note">{t('Version $1', TERMS_VERSION)}</p>
      <Sections sections={TERMS_SECTIONS} />
      <p className="stats-line text-link">
        <Link to="/privacy">{t('Privacy policy')}</Link>
      </p>
    </TextPage>
  );
}

export function PrivacyScreen() {
  const { t } = usePrefs();
  const tx = useLegalText();
  const navigate = useNavigate();
  return (
    <TextPage caption={t('Privacy policy')} onBack={() => void navigate(-1)}>
      <p className="stats-note">{t('Version $1', PRIVACY_VERSION)}</p>
      <Sections sections={PRIVACY_SECTIONS.slice(0, 1)} />
      <OperatorContact />
      <section className="stats-section legal">
        <h2>{t('What we keep, why and for how long')}</h2>
        <table className="stats-table wide">
          <thead>
            <tr>
              <th>{t('Data')}</th>
              <th>{t('Why')}</th>
              <th>{t('For how long')}</th>
            </tr>
          </thead>
          <tbody>
            {DATA_INVENTORY.map((d) => (
              <tr key={d.what.en}>
                <td className="name wrap">{tx(d.what)}</td>
                <td className="name wrap">{tx(d.why)}</td>
                <td className="name wrap">{tx(d.retention)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <Sections sections={PRIVACY_SECTIONS.slice(1)} />
    </TextPage>
  );
}

export function AboutScreen() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  return (
    <TextPage caption={t('About Outgun Web')} onBack={() => void navigate('/')}>
      <section className="stats-section legal">
        <p className="stats-line">{t('Outgun is a 2D multiplayer capture-the-flag game from 2002-2011, loved by Finnish and Brazilian players. Outgun Web brings version 1.0.3 to the browser: same rules, physics and maps, nothing to install.')}</p>
        <h2>{t('How to play')}</h2>
        <p className="stats-line">{t('Arrows move, Ctrl shoots, Shift runs; take the enemy flag to your base. Press F1 in game for the scoreboard and Esc for the menu. All keys can be changed in Options > Controls.')}</p>
        <h2>{t('Credits')}</h2>
        {ORIGINAL_CREDITS.map((g) => (
          <p key={g.role} className="stats-line">
            {g.role}: {g.people.join(', ')}
          </p>
        ))}
        <h2>{t('Free software')}</h2>
        <p className="stats-line text-link">
          {t('Outgun and Outgun Web are free software under the GNU GPL (version 2 or later).')}{' '}
          {SOURCE_URL.startsWith('/') ? <Link to={SOURCE_URL}>{t('Source code (GPL)')}</Link> : <a href={SOURCE_URL}>{t('Source code (GPL)')}</a>}
        </p>
        <OperatorContact />
        <p className="stats-line text-link">
          <Link to="/terms">{t('Terms of use')}</Link> · <Link to="/privacy">{t('Privacy policy')}</Link>
        </p>
      </section>
    </TextPage>
  );
}
