// SPDX-License-Identifier: GPL-2.0-or-later
// Textos novos da versão web (plataforma, modos de jogo D-10). A chave é o texto em inglês, como no
// resto do jogo. Somente Latin-1 (as fontes originais não têm outros glifos).
import type { Locale } from './index.js';

export const WEB_TEXTS: Partial<Record<Locale, Readonly<Record<string, string>>>> = {
  'pt-BR': {
    Casual: 'Casual',
    Ranked: 'Ranqueado',
    'Casual: power-ups on, guests welcome, does not count for the ranking.': 'Casual: com power-ups, aberto a convidados, não conta para o ranking.',
    'Ranked: no power-ups, account required, counts for the ranking.': 'Ranqueado: sem power-ups, exige conta, conta para o ranking.',
    'Play now': 'Jogar agora',
    'Play as guest': 'Jogar como convidado',
    'Sign in': 'Entrar',
    'Sign out': 'Sair',
    'Create account': 'Criar conta',
    Username: 'Nome de usuário',
    Password: 'Senha',
    'E-mail (used only to recover your password)': 'E-mail (usado só para recuperar a senha)',
    'Forgot your password?': 'Esqueceu a senha?',
    'Username or e-mail': 'Nome de usuário ou e-mail',
    'Send recovery link': 'Enviar link de recuperação',
    'If the account exists, a recovery link was sent to its e-mail. The link expires in 30 minutes.':
      'Se a conta existir, um link de recuperação foi enviado ao e-mail dela. O link expira em 30 minutos.',
    'New password': 'Nova senha',
    'Invalid username or password.': 'Nome de usuário ou senha inválidos.',
    'Too many attempts. Wait $1 seconds and try again.': 'Muitas tentativas. Aguarde $1 segundos e tente de novo.',
    'This username is already taken.': 'Este nome de usuário já está em uso.',
    'The password must have at least 8 characters.': 'A senha precisa ter pelo menos 8 caracteres.',
    'Ranked matches require an account.': 'Partidas ranqueadas exigem uma conta.',
    Ranking: 'Ranking',
    'Season $1': 'Temporada $1',
    Rooms: 'Salas',
    'Create private room': 'Criar sala privada',
    Credits: 'Créditos',
    'Source code (GPL)': 'Código-fonte (GPL)',
  },
};
