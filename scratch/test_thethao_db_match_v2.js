require('dotenv').config({ path: '.env.local' });
const cheerio = require('cheerio');
const fs = require('fs');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function getDbMatches() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/wc2026_matches?select=*`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });
  return response.json();
}

async function getDbTeams() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/wc2026_teams?select=*`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });
  return response.json();
}

function cleanName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove Vietnamese accents
    .replace(/[^a-z0-9]/g, '')       // Keep only alphanumeric characters
    .trim();
}

function teamMatches(team, scrapedName) {
  const cleanScraped = cleanName(scrapedName);
  const cleanVi = cleanName(team.name_vi);
  const cleanEn = cleanName(team.name_en);
  const cleanCode = cleanName(team.code);

  if (cleanScraped === cleanVi || cleanScraped === cleanEn || cleanScraped === cleanCode) {
    return true;
  }

  // Handle some common differences (like D.R. Congo vs Congo DR)
  if (cleanScraped.includes('congo') && cleanVi.includes('congo')) return true;
  if (cleanScraped.includes('my') && cleanVi.includes('my')) return true;
  if (cleanScraped.includes('hoaky') && cleanVi.includes('my')) return true;
  if (cleanScraped.includes('uc') && cleanVi.includes('uc')) return true;
  if (cleanScraped.includes('arab') && cleanVi.includes('saudi')) return true;

  return false;
}

function findMatchingMatch(dbMatches, teamsById, scraped) {
  return dbMatches.find(m => {
    const homeTeam = teamsById.get(m.home_team_id);
    const awayTeam = teamsById.get(m.away_team_id);
    if (!homeTeam || !awayTeam) return false;

    const homeMatch = teamMatches(homeTeam, scraped.homeName);
    const awayMatch = teamMatches(awayTeam, scraped.awayName);
    return homeMatch && awayMatch;
  });
}

async function run() {
  try {
    const [dbMatches, dbTeams] = await Promise.all([getDbMatches(), getDbTeams()]);
    console.log(`Fetched ${dbMatches.length} matches and ${dbTeams.length} teams from Supabase.`);

    const teamsById = new Map(dbTeams.map(t => [t.id, t]));

    const html = fs.readFileSync('scratch/thethao_response.html', 'utf8');
    const $ = cheerio.load(html);
    
    const matches = [];
    $('li.match-info').each((i, el) => {
      const homeName = $(el).attr('data-home-name') || $(el).find('.team-a .name').text().trim();
      const awayName = $(el).attr('data-away-name') || $(el).find('.team-b .name').text().trim();
      if (!homeName || !awayName) return;

      const timeText = $(el).find('.time').first().text().replace(/\s+/g, ' ').trim();
      const statusText = $(el).find('.more').text().replace(/\s+/g, ' ').trim();
      
      const spans = $(el).find('.score span');
      let homeScore = null;
      let awayScore = null;
      if (spans.length >= 2) {
        homeScore = $(spans[0]).text().trim();
        awayScore = $(spans[1]).text().trim();
      }

      matches.push({
        homeName,
        awayName,
        timeText,
        statusText,
        homeScore: homeScore !== null && homeScore !== '' && !isNaN(Number(homeScore)) ? Number(homeScore) : null,
        awayScore: awayScore !== null && awayScore !== '' && !isNaN(Number(awayScore)) ? Number(awayScore) : null,
      });
    });

    console.log(`Parsed ${matches.length} matches from thethao247.`);

    let matchedCount = 0;
    for (const scraped of matches) {
      const match = findMatchingMatch(dbMatches, teamsById, scraped);
      if (match) {
        matchedCount++;
        console.log(`MATCHED: ${scraped.homeName} vs ${scraped.awayName} -> DB Match ID ${match.id} (${match.home_team_code} vs ${match.away_team_code})`);
      }
    }
    console.log(`Total Matched: ${matchedCount} / ${matches.length}`);
  } catch (error) {
    console.error('Error:', error);
  }
}

run();
