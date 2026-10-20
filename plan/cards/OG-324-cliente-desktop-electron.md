# OG-324 — Cliente para Windows (Electron) que abre o site

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S32 |
| Status | Em andamento |
| Dependências | — |
| Regras de negócio | D-58 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero baixar um instalador `.exe` e jogar o Outgun pelo atalho, sem abrir o navegador.

## Contexto
- D-58: o `.exe` é uma casca que carrega `https://outgunweb.com.br`; cada deploy do site vale na hora para o cliente, sem gerar instalador novo.
- O instalador só é refeito quando a casca muda (atualização do Electron).

## Escopo
- `apps/desktop`: janela única carregando o site (endereço configurável para testes), sem menu, tela cheia com F11, ícone do Outgun, uma instância só.
- Segurança (checklist do Electron): `contextIsolation`, `sandbox`, sem `nodeIntegration` e sem preload; navegação restrita ao domínio do jogo; links externos abrem no navegador do sistema; permissões negadas por padrão.
- Música sem esperar o primeiro gesto (`autoplay-policy`); Ctrl+W e Ctrl+R não fecham nem recarregam no meio da partida.
- Instalador NSIS para Windows x64 com `electron-builder`, gerado pelo GitHub Actions (runner Windows) sob demanda e baixado como artefato; sem assinatura digital por ora (aviso do SmartScreen).

## Critérios de aceite
- [ ] `Outgun-Setup-<versão>.exe` instala, cria atalho e abre o jogo logado na conta como no navegador.
- [ ] Links externos (GitHub, termos) abrem no navegador; nenhuma outra origem carrega na janela.

## Notas de implementação
