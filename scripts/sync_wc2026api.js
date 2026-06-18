/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const WC2026_API_BASE_URL = process.env.WC2026_API_BASE_URL || 'https://api.wc2026api.com';
const WC2026_API_KEY = process.env.WC2026_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY && !SUPABASE_KEY.includes('your_')) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

const ROUND_LABELS = {
  group: 'Vòng bảng',
  R32: 'Vòng 32 đội',
  R16: 'Vòng 16 đội',
  QF: 'Tứ kết',
  SF: 'Bán kết',
  '3rd': 'Tranh hạng ba',
  final: 'Chung kết',
};

const TEAM_VI = {
  ALG: 'Algeria',
  ARG: 'Argentina',
  AUS: 'Úc',
  AUT: 'Áo',
  BEL: 'Bỉ',
  BIH: 'Bosnia-Herzegovina',
  BRA: 'Brazil',
  CAN: 'Canada',
  CIV: 'Bờ Biển Ngà',
  COD: 'Congo DR',
  COL: 'Colombia',
  CPV: 'Cabo Verde',
  CRO: 'Croatia',
  CUW: 'Curaçao',
  CZE: 'Czechia',
  ECU: 'Ecuador',
  EGY: 'Ai Cập',
  ENG: 'Anh',
  ESP: 'Tây Ban Nha',
  FRA: 'Pháp',
  GER: 'Đức',
  GHA: 'Ghana',
  HAI: 'Haiti',
  IRN: 'Iran',
  IRQ: 'Iraq',
  JOR: 'Jordan',
  JPN: 'Nhật Bản',
  KOR: 'Hàn Quốc',
  KSA: 'Ả Rập Saudi',
  MAR: 'Ma Rốc',
  MEX: 'Mexico',
  NED: 'Hà Lan',
  NOR: 'Na Uy',
  NZL: 'New Zealand',
  PAN: 'Panama',
  PAR: 'Paraguay',
  POR: 'Bồ Đào Nha',
  QAT: 'Qatar',
  RSA: 'Nam Phi',
  SCO: 'Scotland',
  SEN: 'Senegal',
  SUI: 'Thụy Sĩ',
  SWE: 'Thụy Điển',
  TUN: 'Tunisia',
  TUR: 'Thổ Nhĩ Kỳ',
  URU: 'Uruguay',
  USA: 'Mỹ',
  UZB: 'Uzbekistan',
};

const FLAG_CODES = {
  ALG: 'dz',
  ARG: 'ar',
  AUS: 'au',
  AUT: 'at',
  BEL: 'be',
  BIH: 'ba',
  BRA: 'br',
  CAN: 'ca',
  CIV: 'ci',
  COD: 'cd',
  COL: 'co',
  CPV: 'cv',
  CRO: 'hr',
  CUW: 'cw',
  CZE: 'cz',
  ECU: 'ec',
  EGY: 'eg',
  ENG: 'gb-eng',
  ESP: 'es',
  FRA: 'fr',
  GER: 'de',
  GHA: 'gh',
  HAI: 'ht',
  IRN: 'ir',
  IRQ: 'iq',
  JOR: 'jo',
  JPN: 'jp',
  KOR: 'kr',
  KSA: 'sa',
  MAR: 'ma',
  MEX: 'mx',
  NED: 'nl',
  NOR: 'no',
  NZL: 'nz',
  PAN: 'pa',
  PAR: 'py',
  POR: 'pt',
  QAT: 'qa',
  RSA: 'za',
  SCO: 'gb-sct',
  SEN: 'sn',
  SUI: 'ch',
  SWE: 'se',
  TUN: 'tn',
  TUR: 'tr',
  URU: 'uy',
  USA: 'us',
  UZB: 'uz',
};

if (!WC2026_API_KEY || WC2026_API_KEY.includes('your_')) {
  throw new Error('Missing WC2026_API_KEY in .env.local');
}

async function fetchApi(path) {
  const response = await fetch(`${WC2026_API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${WC2026_API_KEY}` },
  });

  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

function normalizeStatus(status, phase) {
  if (status === 'completed' || phase === 'FT' || phase === 'FT_PEN') return 'finished';
  if (status === 'live' || status === 'in_progress') return 'live';
  if (status === 'postponed') return 'postponed';
  if (status === 'cancelled') return 'cancelled';
  return 'scheduled';
}

function mapTeam(team) {
  const flagCode = FLAG_CODES[team.code];
  return {
    id: team.id,
    code: team.code,
    name_en: team.name,
    name_vi: TEAM_VI[team.code] || team.name,
    group_name: team.group_name,
    flag_url: team.flag_url || (flagCode ? `https://flagcdn.com/w160/${flagCode}.png` : null),
    source_payload: team,
    updated_at: new Date().toISOString(),
  };
}

function mapMatch(match) {
  return {
    id: match.id,
    match_number: match.match_number,
    round_code: match.round,
    round_name: ROUND_LABELS[match.round] || match.round,
    group_name: match.group_name,
    home_team_id: match.home_team_id,
    away_team_id: match.away_team_id,
    home_team_name: match.home_team,
    away_team_name: match.away_team,
    home_team_code: match.home_team_code,
    away_team_code: match.away_team_code,
    stadium_id: match.stadium_id,
    stadium_name: match.stadium,
    stadium_city: match.stadium_city,
    stadium_country: match.stadium_country,
    kickoff_utc: match.kickoff_utc,
    status: normalizeStatus(match.status, match.phase),
    phase: match.phase,
    home_score: match.home_score,
    away_score: match.away_score,
    home_pen: match.home_pen,
    away_pen: match.away_pen,
    source_payload: match,
    updated_at: new Date().toISOString(),
  };
}

// SQL Formatting Helpers
function escapeSqlString(str) {
  if (str === null || str === undefined) return 'null';
  return `'${String(str).replace(/'/g, "''")}'`;
}

function escapeSqlJson(obj) {
  if (obj === null || obj === undefined) return "'{}'::jsonb";
  return `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;
}

function escapeSqlNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return 'null';
  return Number(num);
}

function escapeSqlTimestamp(isoStr) {
  if (!isoStr) return 'null';
  return `'${isoStr}'::timestamptz`;
}

function getTeamsBulkInsertSql(teams) {
  const valuesList = teams.map(team => `  (${escapeSqlNumber(team.id)}, ${escapeSqlString(team.code)}, ${escapeSqlString(team.name_en)}, ${escapeSqlString(team.name_vi)}, ${escapeSqlString(team.group_name)}, ${escapeSqlString(team.flag_url)}, ${escapeSqlJson(team.source_payload)}, ${escapeSqlTimestamp(team.updated_at)})`).join(',\n');

  return `INSERT INTO wc2026_teams (id, code, name_en, name_vi, group_name, flag_url, source_payload, updated_at) VALUES
${valuesList}
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  name_en = EXCLUDED.name_en,
  name_vi = EXCLUDED.name_vi,
  group_name = EXCLUDED.group_name,
  flag_url = EXCLUDED.flag_url,
  source_payload = EXCLUDED.source_payload,
  updated_at = EXCLUDED.updated_at;`;
}

function getMatchesBulkInsertSql(matches) {
  const valuesList = matches.map(match => `  (${escapeSqlNumber(match.id)}, ${escapeSqlNumber(match.match_number)}, ${escapeSqlString(match.round_code)}, ${escapeSqlString(match.round_name)}, ${escapeSqlString(match.group_name)}, ${escapeSqlNumber(match.home_team_id)}, ${escapeSqlNumber(match.away_team_id)}, ${escapeSqlString(match.home_team_name)}, ${escapeSqlString(match.away_team_name)}, ${escapeSqlString(match.home_team_code)}, ${escapeSqlString(match.away_team_code)}, ${escapeSqlNumber(match.stadium_id)}, ${escapeSqlString(match.stadium_name)}, ${escapeSqlString(match.stadium_city)}, ${escapeSqlString(match.stadium_country)}, ${escapeSqlTimestamp(match.kickoff_utc)}, ${escapeSqlString(match.status)}, ${escapeSqlString(match.phase)}, ${escapeSqlNumber(match.home_score)}, ${escapeSqlNumber(match.away_score)}, ${escapeSqlNumber(match.home_pen)}, ${escapeSqlNumber(match.away_pen)}, ${escapeSqlJson(match.source_payload)}, ${escapeSqlTimestamp(match.updated_at)})`).join(',\n');

  return `INSERT INTO wc2026_matches (
  id, match_number, round_code, round_name, group_name,
  home_team_id, away_team_id, home_team_name, away_team_name,
  home_team_code, away_team_code, stadium_id, stadium_name,
  stadium_city, stadium_country, kickoff_utc, status, phase,
  home_score, away_score, home_pen, away_pen, source_payload, updated_at
) VALUES
${valuesList}
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
  updated_at = EXCLUDED.updated_at;`;
}

function getLogInsertSql(log) {
  return `INSERT INTO wc2026_api_sync_log (source, status, message, rows_read, rows_written, started_at, finished_at) VALUES (
  ${escapeSqlString(log.source)},
  ${escapeSqlString(log.status)},
  ${escapeSqlString(log.message)},
  ${escapeSqlNumber(log.rows_read)},
  ${escapeSqlNumber(log.rows_written)},
  ${escapeSqlTimestamp(log.started_at)},
  ${escapeSqlTimestamp(log.finished_at)}
);`;
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log('Fetching teams and matches from wc2026api...');

  try {
    const [teams, matches] = await Promise.all([fetchApi('/teams'), fetchApi('/matches')]);

    console.log(`Fetched ${teams.length} teams and ${matches.length} matches.`);

    const mappedTeams = teams.map(mapTeam);
    const mappedMatches = matches.map(mapMatch);

    // Create scripts/seeds directory if it doesn't exist
    const seedsDir = path.join(__dirname, 'seeds');
    if (!fs.existsSync(seedsDir)) {
      fs.mkdirSync(seedsDir, { recursive: true });
    }

    // 1. Write teams seed
    let teamsSql = `-- World Cup 2026 Teams Seed SQL\nBEGIN;\n\n`;
    teamsSql += getTeamsBulkInsertSql(mappedTeams) + '\n\n';
    teamsSql += `COMMIT;\n`;
    fs.writeFileSync(path.join(seedsDir, 'seed_teams.sql'), teamsSql, 'utf8');
    console.log('Generated seed_teams.sql');

    // 2. Write matches seeds (chunked by 25 matches per file)
    const chunkSize = 25;
    let partNum = 1;
    for (let i = 0; i < mappedMatches.length; i += chunkSize) {
      const chunk = mappedMatches.slice(i, i + chunkSize);
      let matchesSql = `-- World Cup 2026 Matches Seed SQL (Part ${partNum})\nBEGIN;\n\n`;
      matchesSql += getMatchesBulkInsertSql(chunk) + '\n\n';
      matchesSql += `COMMIT;\n`;
      fs.writeFileSync(path.join(seedsDir, `seed_matches_part${partNum}.sql`), matchesSql, 'utf8');
      console.log(`Generated seed_matches_part${partNum}.sql with ${chunk.length} matches.`);
      partNum++;
    }

    // 3. Write sync log seed
    const finishedAt = new Date().toISOString();
    const logSql = getLogInsertSql({
      source: 'wc2026api',
      status: 'success',
      message: `Synced ${mappedTeams.length} teams and ${mappedMatches.length} matches.`,
      rows_read: teams.length + matches.length,
      rows_written: mappedTeams.length + mappedMatches.length,
      started_at: startedAt,
      finished_at: finishedAt,
    });

    let logSqlContent = `-- World Cup 2026 Sync Log Seed SQL\nBEGIN;\n\n`;
    logSqlContent += logSql + '\n\n';
    logSqlContent += `COMMIT;\n`;
    fs.writeFileSync(path.join(seedsDir, 'seed_log.sql'), logSqlContent, 'utf8');
    console.log('Generated seed_log.sql');

    console.log(`Successfully generated all SQL seed files in ${seedsDir}`);

    // 4. Optionally write directly to Supabase if config is present (useful in GitHub Actions)
    if (supabase) {
      console.log('Writing directly to Supabase database...');
      await upsertInChunks('wc2026_teams', mappedTeams);
      await upsertInChunks('wc2026_matches', mappedMatches);
      await writeSyncLog({
        source: 'wc2026api',
        status: 'success',
        message: `Synced ${mappedTeams.length} teams and ${mappedMatches.length} matches.`,
        rows_read: teams.length + matches.length,
        rows_written: mappedTeams.length + mappedMatches.length,
        started_at: startedAt,
        finished_at: finishedAt,
      });
      console.log('Successfully updated Supabase database.');
    } else {
      console.log('Skipping direct Supabase write (missing real service role key).');
    }
  } catch (error) {
    console.error('Error during data fetch or SQL generation:', error);
    if (supabase) {
      await writeSyncLog({
        source: 'wc2026api',
        status: 'error',
        message: error.message,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      }).catch(() => {});
    }
    throw error;
  }
}

async function upsertInChunks(table, rows, chunkSize = 500) {
  let written = 0;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk);
    if (error) throw error;
    written += chunk.length;
  }
  return written;
}

async function writeSyncLog(log) {
  const { error } = await supabase.from('wc2026_api_sync_log').insert(log);
  if (error) console.error('Failed to write sync log:', error.message);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main, mapMatch, mapTeam };
