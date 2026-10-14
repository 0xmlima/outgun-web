# Patches no Outgun original

Alterações nos fontes originais **só** para o oráculo (ex.: gravação de traces no OG-003). Cada arquivo `NNN-descricao.patch` é aplicado com `patch -p1` dentro de `src/` (cópia de `_legacy/src/` na imagem), na ordem alfabética, durante o build da imagem (`tools/parity/docker/Dockerfile`). Os arquivos em `_legacy/src/` do repositório nunca são editados.

Hoje não há patches: o OG-002 compila o original sem alterações (apenas flags de compilação).
