-- World Cup 2026 Sync Log Seed SQL
BEGIN;

INSERT INTO wc2026_api_sync_log (source, status, message, rows_read, rows_written, started_at, finished_at) VALUES (
  'wc2026api',
  'success',
  'Synced 48 teams and 104 matches.',
  152,
  152,
  '2026-06-17T16:12:12.100Z'::timestamptz,
  '2026-06-17T16:12:12.833Z'::timestamptz
);

COMMIT;
