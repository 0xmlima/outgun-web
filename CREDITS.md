# Créditos

O **Outgun Web** é um port para navegador do **Outgun 1.0.3**, jogo livre (GNU GPL v2 ou posterior) criado pelos autores abaixo. Todo o mérito do design, das regras, dos mapas, dos gráficos e dos sons é deles. A lista completa está em `README.txt` (seção CREDITS) e é exibida no jogo a partir de `packages/content/src/credits.ts`.

## Outgun original

| Contribuição                           | Autores                                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Programação (0.5.0)                    | Fabiana Cecin (Spinal); rotina de nomes aleatórios por Renato Hentschke                                                                                            |
| Programação (1.0)                      | Niko Ritari (Nix), Jani Rivinoja (Huntta); efeitos especiais de colisão por Fabiana Cecin; bots por Peter Kosyh (Gloomy), com modificações de Niko Ritari          |
| Temas gráficos                         | Jani Rivinoja, Joonas Rivinoja, Thomaz de Oliveira dos Reis (ThOR27), Renato Felix e Thales Zajdsznajder                                                           |
| Fontes                                 | Jani Rivinoja                                                                                                                                                      |
| Tema de som                            | Visa-Valtteri Pimiä                                                                                                                                                |
| Traduções                              | Finlandês: Jani Rivinoja e Niko Ritari · Português (BR): Thomaz de Oliveira dos Reis e Caio Monteiro (Nosferatu) · Italiano: Alessandro Ferrentino (Lo Scassatore) |
| Mapas                                  | Cebs, coiote, Devil, evilKaioh, Flyer, Gloomy, Huntta, jarule, Kiss, Luque, Nosferatu, PHiN, Rubens, shadow, Slim, Spinal, ThOR27, th3b3st                         |
| Relatos de bugs (1.0.0 beta em diante) | ThOR27, Spinal, Nosferatu, Joonas, PHiN, coiote, rFrota, K4, Zigue, Syrus, Miague, SnoOpY                                                                          |

Sites do projeto original: <http://outgun.mbnet.fi/> e <http://outgun.sf.net/> (comunidade brasileira).

## Bibliotecas usadas pelo original

Allegro, HawkNL e Pthreads-win32. O port web não usa essas bibliotecas; elas aparecem apenas no oráculo de testes (`tools/parity/`).

## Dados de terceiros no port

- Lista de senhas comuns recusadas no cadastro (`apps/api/src/auth/common-passwords.ts`, OG-104): derivada de "10k-most-common" do [SecLists](https://github.com/danielmiessler/SecLists), Copyright (c) 2018 Daniel Miessler, licença MIT.

## Fonte da interface

- **Inter** (OG-200, D-35), de Rasmus Andersson e colaboradores — <https://rsms.me/inter/>. Licença **SIL Open Font License 1.1** (OFL-1.1); distribuída pelo pacote `@fontsource-variable/inter`, servida pelo próprio site (subconjunto latino). A OFL permite incluir a fonte em qualquer software; ela não pode ser vendida sozinha.
- **Russo One** (Jovanny Lemonad), **Saira Condensed** e **Saira Stencil One** (Omnibus-Type) e **Chakra Petch** (Cadson Demak): fontes dos estilos do número de jogador (OG-413). Licença **SIL Open Font License 1.1** (OFL-1.1); distribuídas pelos pacotes `@fontsource/*` e servidas pelo próprio site.

## Música

- **Trilha sonora** (OG-220, D-38): **Thiago Anuszkiewicz**. Vinte faixas em `songs/` ("Outgun Main Theme" abre o menu, depois as faixas se revezam; nas partidas, todas menos o tema), licenciadas sob **Creative Commons Atribuição-CompartilhaIgual 4.0 Internacional** (CC BY-SA 4.0, <https://creativecommons.org/licenses/by-sa/4.0/>): podem ser copiadas, remixadas e redistribuídas, inclusive fora do jogo, desde que creditem o autor e que obras derivadas usem a mesma licença (ver `songs/LICENSE.txt`). Os créditos também aparecem na tela de créditos e no manifesto de assets.

## Licença

O código original e o port são distribuídos sob a **GNU General Public License, versão 2 ou (a seu critério) qualquer versão posterior** — texto completo em `COPYING`. Arquivos novos do port levam o cabeçalho `SPDX-License-Identifier: GPL-2.0-or-later`, verificado por `pnpm check:licenses`, que também bloqueia dependências de produção com licença incompatível.
