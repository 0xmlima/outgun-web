// SPDX-License-Identifier: GPL-2.0-or-later
// Cliente web do Outgun: React para menus e overlays; o jogo roda num canvas próprio (OG-060).
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { PrefsProvider } from './app/prefs.js';
import { Root, Shell } from './app/Shell.js';
import { ControlsScreen } from './screens/ControlsScreen.js';
import {
  CreditsScreen,
  HelpScreen,
  HomeScreen,
  LoginScreen,
  OptionsScreen,
  SourceScreen,
} from './screens/menus.js';
import './styles.css';

// O jogo (e, a partir do OG-061, o PixiJS) só é baixado ao entrar na partida.
const GameScreen = lazy(() => import('./screens/GameScreen.js'));

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <Shell />,
        children: [
          { index: true, element: <HomeScreen /> },
          { path: 'options', element: <OptionsScreen /> },
          { path: 'options/controls', element: <ControlsScreen /> },
          { path: 'help', element: <HelpScreen /> },
          { path: 'credits', element: <CreditsScreen /> },
          { path: 'source', element: <SourceScreen /> },
          { path: 'login', element: <LoginScreen /> },
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
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

const container = document.getElementById('root');
if (container)
  createRoot(container).render(
    <StrictMode>
      <PrefsProvider>
        <RouterProvider router={router} />
      </PrefsProvider>
    </StrictMode>,
  );
