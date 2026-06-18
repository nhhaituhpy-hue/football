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
  const data = await response.json();
  if (data.error || !Array.isArray(data)) {
    console.error('Supabase error:', data);
    return [];
  }
  return data;
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

const TEAM_NAME_SYNONYMS = {
  'my': ['hoaky', 'usa', 'unitedstates', 'dtmy'],
  'hoaky': ['my', 'usa', 'unitedstates'],
  'congodr': ['drcongo', 'congo', 'chdccongo', 'drcongo'],
  'congo': ['congodr', 'drcongo', 'chdccongo', 'drcongo'],
  'hanquoc': ['southkorea', 'korea'],
  'nhatban': ['japan'],
  'uc': ['australia'],
  'saudiarabia': ['saudi', 'arabisaudi', 'arapxeut'],
  'arapxeut': ['saudi', 'arabisaudi', 'saudiarabia'],
  'taybannha': ['spain'],
  'boibiennga': ['ivorycoast', 'cotedivoire'],
  'phap': ['france'],
  'duc': ['germany'],
  'y': ['italy'],
  'halan': ['netherlands'],
  'bi': ['belgium'],
  'thuysy': ['switzerland'],
  'thuycong': ['sweden'],
  'nga': ['russia'],
  'maroc': ['morocco'],
  'aicap': ['egypt'],
  'namphi': ['southafrica'],
  'algeria': ['algeri'],
  'ecuador': ['ecuado'],
};

function nameMatches(nameA, nameB) {
  const cleanA = cleanName(nameA);
  const cleanB = cleanName(nameB);
  if (cleanA === cleanB) return true;
  
  const synsA = TEAM_NAME_SYNONYMS[cleanA] || [];
  if (synsA.includes(cleanB)) return true;
  
  const synsB = TEAM_NAME_SYNONYMS[cleanB] || [];
  if (synsB.includes(cleanA)) return true;
  
  // Check if one contains the other as a substring
  if (cleanA.length > 3 && cleanB.length > 3) {
    if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true;
  }
  
  return false;
}

function findMatchingMatch(dbMatches, scraped) {
  return dbMatches.find(m => {
    // Check if home and away teams match
    const homeMatch = nameMatches(m.home_team_name, scraped.homeName) || nameMatches(m.home_team_code, scraped.homeName);
    const awayMatch = nameMatches(m.away_team_name, scraped.awayName) || nameMatches(m.away_team_code, scraped.awayName);
    return homeMatch && awayMatch;
  });
}

async function run() {
  try {
    const dbMatches = await getDbMatches();
    console.log(`Fetched ${dbMatches.length} matches from Supabase.`);

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
      const match = findMatchingMatch(dbMatches, scraped);
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
