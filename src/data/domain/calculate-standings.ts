import { Match, Team, StandingRow } from '../../types';

export function calculateStandings(matches: Match[], teams: Team[]): Record<string, StandingRow[]> {
  const temp: Record<string, Record<number, StandingRow>> = {};

  teams.forEach((team) => {
    if (!team.group_name) return;
    temp[team.group_name] ||= {};
    temp[team.group_name][team.id] = {
      team,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
    };
  });

  matches.forEach((match) => {
    if (match.round_code !== 'group') return;
    if (!match.home_team_id || !match.away_team_id || !match.home_team?.group_name || !match.away_team?.group_name) return;
    if (!match.result || match.result.status === 'scheduled') return;

    const home = temp[match.home_team.group_name]?.[match.home_team_id];
    const away = temp[match.away_team.group_name]?.[match.away_team_id];
    if (!home || !away) return;

    const homeScore = match.result.home_score;
    const awayScore = match.result.away_score;

    home.played += 1;
    away.played += 1;
    home.gf += homeScore;
    home.ga += awayScore;
    away.gf += awayScore;
    away.ga += homeScore;

    if (homeScore > awayScore) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (homeScore < awayScore) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }

    home.gd = home.gf - home.ga;
    away.gd = away.gf - away.ga;
  });

  return Object.fromEntries(
    Object.entries(temp).map(([group, rows]) => [
      group,
      Object.values(rows).sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf),
    ]),
  );
}
