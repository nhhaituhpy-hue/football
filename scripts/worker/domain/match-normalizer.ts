import { cleanName } from '../utils';

export const ROUND_LABELS: Record<string, string> = {
  group: 'Vòng bảng',
  R32: 'Vòng 32 đội',
  R16: 'Vòng 16 đội',
  QF: 'Tứ kết',
  SF: 'Bán kết',
  '3rd': 'Tranh hạng ba',
  final: 'Chung kết',
};

export const TEAM_VI: Record<string, string> = {
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

export const FLAG_CODES: Record<string, string> = {
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

export function teamMatches(team: any, scrapedName: string): boolean {
  const cleanScraped = cleanName(scrapedName);
  const cleanVi = cleanName(team.name_vi);
  const cleanEn = cleanName(team.name_en);
  const cleanCode = cleanName(team.code);

  if (cleanScraped === cleanVi || cleanScraped === cleanEn || cleanScraped === cleanCode) {
    return true;
  }

  // Common synonym normalization helpers
  if (cleanScraped.includes('congo') && cleanVi.includes('congo')) return true;
  if (cleanScraped.includes('my') && cleanVi.includes('my')) return true;
  if (cleanScraped.includes('hoaky') && cleanVi.includes('my')) return true;
  if (cleanScraped.includes('uc') && cleanVi.includes('uc')) return true;
  if ((cleanScraped.includes('arab') || cleanScraped.includes('arap')) && (cleanVi.includes('saudi') || cleanEn.includes('saudi'))) return true;
  if (cleanScraped.includes('sec') && (cleanVi.includes('czechia') || cleanEn.includes('czechia'))) return true;
  if (cleanScraped === 'thonk' && cleanVi === 'thonhiky') return true;

  return false;
}

export function findMatchingMatch(dbMatches: any[], teamsById: Map<number, any>, scraped: any): any | null {
  if (!dbMatches || !Array.isArray(dbMatches)) return null;

  return dbMatches.find(m => {
    const homeTeam = teamsById.get(m.home_team_id);
    const awayTeam = teamsById.get(m.away_team_id);
    if (!homeTeam || !awayTeam) return false;

    const homeMatch = teamMatches(homeTeam, scraped.homeName);
    const awayMatch = teamMatches(awayTeam, scraped.awayName);
    return homeMatch && awayMatch;
  }) || null;
}

export function normalizeApiStatus(status: string, phase: string | null | undefined): string {
  if (status === 'completed' || phase === 'FT' || phase === 'FT_PEN') return 'finished';
  if (status === 'live' || status === 'in_progress') return 'live';
  if (status === 'postponed') return 'postponed';
  if (status === 'cancelled') return 'cancelled';
  return 'scheduled';
}

export function mapApiTeam(team: any): any {
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

export function mapApiMatch(match: any): any {
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
    status: normalizeApiStatus(match.status, match.phase),
    phase: match.phase,
    home_score: match.home_score,
    away_score: match.away_score,
    home_pen: match.home_pen,
    away_pen: match.away_pen,
    source_payload: match,
    updated_at: new Date().toISOString(),
  };
}
