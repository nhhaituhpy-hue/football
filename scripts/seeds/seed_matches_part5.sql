-- World Cup 2026 Matches Seed SQL (Part 5)
BEGIN;

INSERT INTO wc2026_matches (
  id, match_number, round_code, round_name, group_name,
  home_team_id, away_team_id, home_team_name, away_team_name,
  home_team_code, away_team_code, stadium_id, stadium_name,
  stadium_city, stadium_country, kickoff_utc, status, phase,
  home_score, away_score, home_pen, away_pen, source_payload, updated_at
) VALUES
  (76, 101, 'SF', 'Bán kết', null, null, null, null, null, null, null, 2, 'AT&T Stadium', 'Arlington, TX', 'USA', '2026-07-14T19:00:00.000Z'::timestamptz, 'scheduled', 'PRE', null, null, null, null, '{"id":76,"match_number":101,"round":"SF","group_name":null,"home_team_id":null,"home_team":null,"home_team_code":null,"home_team_flag":null,"away_team_id":null,"away_team":null,"away_team_code":null,"away_team_flag":null,"stadium_id":2,"stadium":"AT&T Stadium","stadium_city":"Arlington, TX","stadium_country":"USA","kickoff_utc":"2026-07-14T19:00:00.000Z","home_score":null,"away_score":null,"home_pen":null,"away_pen":null,"status":"scheduled","phase":"PRE"}'::jsonb, '2026-06-17T16:12:12.815Z'::timestamptz),
  (102, 102, 'SF', 'Bán kết', null, null, null, null, null, null, null, 17, 'Mercedes-Benz Stadium', 'Atlanta, GA', 'USA', '2026-07-15T19:00:00.000Z'::timestamptz, 'scheduled', 'PRE', null, null, null, null, '{"id":102,"match_number":102,"round":"SF","group_name":null,"home_team_id":null,"home_team":null,"home_team_code":null,"home_team_flag":null,"away_team_id":null,"away_team":null,"away_team_code":null,"away_team_flag":null,"stadium_id":17,"stadium":"Mercedes-Benz Stadium","stadium_city":"Atlanta, GA","stadium_country":"USA","kickoff_utc":"2026-07-15T19:00:00.000Z","home_score":null,"away_score":null,"home_pen":null,"away_pen":null,"status":"scheduled","phase":"PRE"}'::jsonb, '2026-06-17T16:12:12.815Z'::timestamptz),
  (84, 103, '3rd', 'Tranh hạng ba', null, null, null, null, null, null, null, 5, 'Hard Rock Stadium', 'Miami Gardens, FL', 'USA', '2026-07-18T21:00:00.000Z'::timestamptz, 'scheduled', 'PRE', null, null, null, null, '{"id":84,"match_number":103,"round":"3rd","group_name":null,"home_team_id":null,"home_team":null,"home_team_code":null,"home_team_flag":null,"away_team_id":null,"away_team":null,"away_team_code":null,"away_team_flag":null,"stadium_id":5,"stadium":"Hard Rock Stadium","stadium_city":"Miami Gardens, FL","stadium_country":"USA","kickoff_utc":"2026-07-18T21:00:00.000Z","home_score":null,"away_score":null,"home_pen":null,"away_pen":null,"status":"scheduled","phase":"PRE"}'::jsonb, '2026-06-17T16:12:12.815Z'::timestamptz),
  (73, 104, 'final', 'Chung kết', null, null, null, null, null, null, null, 1, 'MetLife Stadium', 'East Rutherford, NJ', 'USA', '2026-07-19T19:00:00.000Z'::timestamptz, 'scheduled', 'PRE', null, null, null, null, '{"id":73,"match_number":104,"round":"final","group_name":null,"home_team_id":null,"home_team":null,"home_team_code":null,"home_team_flag":null,"away_team_id":null,"away_team":null,"away_team_code":null,"away_team_flag":null,"stadium_id":1,"stadium":"MetLife Stadium","stadium_city":"East Rutherford, NJ","stadium_country":"USA","kickoff_utc":"2026-07-19T19:00:00.000Z","home_score":null,"away_score":null,"home_pen":null,"away_pen":null,"status":"scheduled","phase":"PRE"}'::jsonb, '2026-06-17T16:12:12.815Z'::timestamptz)
ON CONFLICT (id) DO UPDATE SET
  match_number = EXCLUDED.match_number,
  round_code = EXCLUDED.round_code,
  round_name = EXCLUDED.round_name,
  group_name = EXCLUDED.group_name,
  home_team_id = EXCLUDED.home_team_id,
  away_team_id = EXCLUDED.away_team_id,
  home_team_name = EXCLUDED.home_team_name,
  away_team_name = EXCLUDED.away_team_name,
  home_team_code = EXCLUDED.home_team_code,
  away_team_code = EXCLUDED.away_team_code,
  stadium_id = EXCLUDED.stadium_id,
  stadium_name = EXCLUDED.stadium_name,
  stadium_city = EXCLUDED.stadium_city,
  stadium_country = EXCLUDED.stadium_country,
  kickoff_utc = EXCLUDED.kickoff_utc,
  status = EXCLUDED.status,
  phase = EXCLUDED.phase,
  home_score = EXCLUDED.home_score,
  away_score = EXCLUDED.away_score,
  home_pen = EXCLUDED.home_pen,
  away_pen = EXCLUDED.away_pen,
  source_payload = EXCLUDED.source_payload,
  updated_at = EXCLUDED.updated_at;

COMMIT;
