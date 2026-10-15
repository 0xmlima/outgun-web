// SPDX-License-Identifier: GPL-2.0-or-later
// Cliente web do Outgun: React para menus e overlays; o jogo roda num canvas próprio (OG-060).
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { AccountProvider } from './app/account.js';
import { PrefsProvider } from './app/prefs.js';
import { PrefsSync } from './app/prefs-sync.js';
import { MusicProvider } from './app/music/MusicProvider.js';
import { Root, Shell } from './app/Shell.js';
import {
  AccountScreen,
  ChangePasswordScreen,
  ChangeUsernameScreen,
  ClanTagScreen,
  DeleteAccountScreen,
  ForgotPasswordScreen,
  LoginScreen,
  RegisterScreen,
  ResetPasswordScreen,
} from './screens/account.js';
import { CreateRoomScreen, JoinRoomScreen, LobbyScreen } from './screens/lobby.js';
import { LastMatchScreen, MatchScreen } from './screens/MatchReport.js';
import { LeaderboardScreen, PlayersScreen } from './screens/Players.js';
import { ProfileScreen } from './screens/Profile.js';
import { CreditsScreen, HelpScreen, HomeScreen, ReplaysScreen, SourceScreen } from './screens/menus.js';
import { OptionsScreen } from './screens/options.js';
import { AboutScreen, PrivacyScreen, TermsScreen } from './screens/legal.js';
import { installErrorReporting } from './app/errors.js';
import './ui/tokens.css';
import './ui/components.css';
import './styles.css';

installErrorReporting();

// O jogo (e, a partir do OG-061, o PixiJS) só é baixado ao entrar na partida.
const GameScreen = lazy(() => import('./screens/GameScreen.js'));
const ReplayScreen = lazy(() => import('./screens/ReplayScreen.js'));
// painel admin (OG-087): só moderadores e admins baixam
const AdminScreen = lazy(() => import('./screens/AdminScreen.js'));
const FeedbackScreen = lazy(() => import('./screens/FeedbackScreen.js'));
const SpectateScreen = lazy(() => import('./screens/ReplayScreen.js').then((m) => ({ default: m.SpectateScreen })));
// vitrine do design system v2 (OG-200): só no desenvolvimento, fora do build de produção
const DevUiScreen = import.meta.env.DEV ? lazy(() => import('./screens/DevUiScreen.js')) : null;

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <Shell />,
        children: [
          { index: true, element: <HomeScreen /> },
          { path: 'options', element: <OptionsScreen /> },
          { path: 'options/:section', element: <OptionsScreen /> },
          { path: 'help', element: <HelpScreen /> },
          { path: 'replays', element: <ReplaysScreen /> },
          { path: 'credits', element: <CreditsScreen /> },
          { path: 'source', element: <SourceScreen /> },
          { path: 'terms', element: <TermsScreen /> },
          { path: 'privacy', element: <PrivacyScreen /> },
          { path: 'about', element: <AboutScreen /> },
          { path: 'login', element: <LoginScreen /> },
          { path: 'register', element: <RegisterScreen /> },
          { path: 'forgot-password', element: <ForgotPasswordScreen /> },
          { path: 'reset-password', element: <ResetPasswordScreen /> },
          { path: 'account', element: <AccountScreen /> },
          { path: 'account/password', element: <ChangePasswordScreen /> },
          { path: 'account/delete', element: <DeleteAccountScreen /> },
          { path: 'account/username', element: <ChangeUsernameScreen /> },
          { path: 'account/clan-tag', element: <ClanTagScreen /> },
          { path: 'rooms', element: <LobbyScreen /> },
          { path: 'rooms/new', element: <CreateRoomScreen /> },
          { path: 'rooms/:id', element: <JoinRoomScreen /> },
          { path: 'players', element: <PlayersScreen /> },
          { path: 'jogadores', element: <Navigate to="/players" replace /> },
          { path: 'players/:name', element: <ProfileScreen /> },
          { path: 'matches/:id', element: <MatchScreen /> },
          { path: 'rooms/:id/report', element: <LastMatchScreen /> },
          { path: 'ranking', element: <LeaderboardScreen /> },
          {
            path: 'feedback',
            element: (
              <Suspense fallback={null}>
                <FeedbackScreen />
              </Suspense>
            ),
          },
          {
            path: 'admin',
            element: (
              <Suspense fallback={null}>
                <AdminScreen />
              </Suspense>
            ),
          },
        ],
      },
      {
        path: 'play',
        element: (
          <Suspense fallback={null}>
            <GameScreen />
          </Suspense>
        ),
      },
      {
        path: 'spectate',
        element: (
          <Suspense fallback={null}>
            <SpectateScreen />
          </Suspense>
        ),
      },
      {
        path: 'replay',
        element: (
          <Suspense fallback={null}>
            <ReplayScreen />
          </Suspense>
        ),
      },
      ...(DevUiScreen
        ? [
            {
              path: 'dev/ui',
              element: (
                <Suspense fallback={null}>
                  <DevUiScreen />
                </Suspense>
              ),
            },
          ]
        : []),
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

const container = document.getElementById('root');
if (container)
  createRoot(container).render(
    <StrictMode>
      <PrefsProvider>
        <AccountProvider>
          <PrefsSync />
          <MusicProvider>
            <RouterProvider router={router} />
          </MusicProvider>
        </AccountProvider>
      </PrefsProvider>
    </StrictMode>,
  );
