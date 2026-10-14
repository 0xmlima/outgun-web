# SPDX-License-Identifier: GPL-2.0-or-later
# Backup agendado do PostgreSQL (OG-103): pg_dump + envio a um armazenamento S3 compatível.
# No Fly: fly machine run <imagem> --schedule daily --app outgun-backup (segredos DATABASE_URL,
# BACKUP_S3_URI, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3).
FROM postgres:16-alpine
RUN apk add --no-cache aws-cli
COPY backup.sh restore.sh /usr/local/bin/
ENV BACKUP_DIR=/backup BACKUP_KEEP=2
CMD ["sh", "/usr/local/bin/backup.sh"]
