# Patches no Outgun original

Alterações nos fontes originais **só** para o oráculo (ex.: gravação de traces no OG-003). Cada arquivo `NNN-descricao.patch` é aplicado com `patch -p1` dentro de `src/`, na ordem alfabética, durante o build da imagem (`tools/parity/docker/Dockerfile`). Os arquivos em `src/` do repositório nunca são editados.

Hoje não há patches: o OG-002 compila o original sem alterações (apenas flags de compilação).
