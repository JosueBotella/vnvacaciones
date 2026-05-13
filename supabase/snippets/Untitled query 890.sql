pg_dump "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  --data-only \
  --no-owner \
  --no-privileges \
  --file=~/ensayo_dump.sql