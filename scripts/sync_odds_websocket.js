/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Scripts: sync_odds_websocket.js
 * Description: Daemon script that connects to Odds-API.io WebSocket,
 * normalizes matches/teams, and syncs live GOAL odds (Spread & Totals) into Supabase.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const apiKey = process.env.ODDS_API_KEY || '37eb8dbab6646bbf1f5c07f35e257f27a7dc694d9627b8bd761407f8a0575725';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qblkjphwwnrexlhfqoyo.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY is not defined in .env.local');
  process.exit(1);
}

// Only keep goal-related markets to save space and keep DB clean
const ALLOWED_MARKETS = ['Spread', 'Totals', 'Asian Handicap', 'Goals Over/Under', 'Total Over/Under', 'Alternative Asian Handicap', 'Alternative Goal Line'];

// Global state cache
let dbTeams = [];
let dbMatches = [];
let teamsById = new Map();
let eventMappingCache = new Map(); // maps eventId (number) -> { home, away, date }
let matchMappingCache = new Map(); // maps eventId (number) -> matchId (number)
let lastSeq = null;
let reconnectTimeout = 1000;
let ws = null;

// Clean name utility for matching
function cleanName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/&amp;/g, '')
    .replace(/amp/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9]/g, '')       // keep only alphanumeric
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

  // Check database-defined aliases
  if (Array.isArray(team.aliases)) {
    for (const alias of team.aliases) {
      if (cleanName(alias) === cleanScraped) {
        return true;
      }
    }
  }

  // Synonym normalization
  if (cleanScraped.includes('congo') && cleanVi.includes('congo')) return true;
  if (cleanScraped.includes('my') && cleanVi.includes('my')) return true;
  if (cleanScraped.includes('hoaky') && cleanVi.includes('my')) return true;
  if (cleanScraped.includes('uc') && cleanVi.includes('uc')) return true;
  if ((cleanScraped.includes('arab') || cleanScraped.includes('arap')) && (cleanVi.includes('saudi') || cleanEn.includes('saudi'))) return true;
  if (cleanScraped.includes('sec') && (cleanVi.includes('czechia') || cleanEn.includes('czechia'))) return true;
  if (cleanScraped === 'thonk' && cleanVi === 'thonhiky') return true;
  if ((cleanScraped.includes('ivory') || cleanScraped.includes('cote')) && team.code === 'CIV') return true;

  return false;
}

// Fetch database records
async function fetchDatabaseState() {
  console.log('Loading teams and matches from Supabase...');
  try {
    const teamsRes = await fetch(`${supabaseUrl}/rest/v1/wc2026_teams?select=*`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
    });
    if (!teamsRes.ok) throw new Error(`HTTP ${teamsRes.status}`);
    dbTeams = await teamsRes.json();
    teamsById = new Map(dbTeams.map(t => [t.id, t]));
    console.log(`Loaded ${dbTeams.length} teams.`);

    const matchesRes = await fetch(`${supabaseUrl}/rest/v1/wc2026_matches?select=*`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
    });
    if (!matchesRes.ok) throw new Error(`HTTP ${matchesRes.status}`);
    dbMatches = await matchesRes.json();
    console.log(`Loaded ${dbMatches.length} matches.`);

    // Clear mapping cache to force re-evaluation
    matchMappingCache.clear();
  } catch (err) {
    console.error('Failed to fetch database state:', err.message);
  }
}

// Fetch active events from Odds API to map event ID -> team names
async function fetchOddsApiEvents() {
  console.log('Fetching events list from Odds-API.io to build ID mapping cache...');
  const eventsUrl = `https://api.odds-api.io/v3/events?sport=football&league=international-fifa-world-cup&apiKey=${apiKey}&limit=100`;
  try {
    const res = await fetch(eventsUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const events = await res.json();
    if (Array.isArray(events)) {
      events.forEach(e => {
        eventMappingCache.set(Number(e.id), { home: e.home, away: e.away, date: e.date });
      });
      console.log(`Loaded ${events.length} events into mapping cache.`);
    }
  } catch (err) {
    console.error('Failed to fetch events from Odds-API.io:', err.message);
  }
}

// Find Supabase match for an Odds API event
function findMatchedMatch(homeName, awayName, dateStr) {
  let matched = dbMatches.find(m => {
    const homeTeam = teamsById.get(m.home_team_id);
    const awayTeam = teamsById.get(m.away_team_id);
    if (!homeTeam || !awayTeam) return false;

    const homeMatch = teamMatches(homeTeam, homeName);
    const awayMatch = teamMatches(awayTeam, awayName);
    return homeMatch && awayMatch;
  });

  if (!matched && dateStr) {
    const eventTime = new Date(dateStr).getTime();
    matched = dbMatches.find(m => {
      const kickoffTime = new Date(m.kickoff_utc).getTime();
      const diffHrs = Math.abs(kickoffTime - eventTime) / (1000 * 60 * 60);
      if (diffHrs > 24) return false;

      const homeTeam = teamsById.get(m.home_team_id);
      const awayTeam = teamsById.get(m.away_team_id);
      if (!homeTeam || !awayTeam) return false;

      return teamMatches(homeTeam, homeName) || teamMatches(awayTeam, awayName);
    });
  }

  return matched || null;
}

// Get existing odds row from Supabase
async function getExistingOdds(matchId) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/wc2026_match_odds?match_id=eq.${matchId}&select=*`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.length > 0 ? data[0] : null;
  } catch (err) {
    console.warn(`Failed to fetch existing odds for match ${matchId}:`, err.message);
    return null;
  }
}

// Merge existing and new markets so we don't overwrite other markets with partial updates
function mergeMarkets(existingMarkets, newMarkets) {
  if (!Array.isArray(existingMarkets)) return newMarkets;
  const marketMap = new Map(existingMarkets.map(m => [m.name, m]));
  newMarkets.forEach(m => {
    marketMap.set(m.name, m);
  });
  return Array.from(marketMap.values());
}

// Save merged odds to Supabase
async function saveOddsToSupabase(matchId, bookmaker, markets) {
  // Only save allowed goal-related markets
  const goalMarkets = markets.filter(m => ALLOWED_MARKETS.includes(m.name));
  if (goalMarkets.length === 0) return;

  try {
    const existing = await getExistingOdds(matchId);
    const existingMarkets = existing ? existing.odds_data : [];
    
    // Only merge and save allowed markets
    const mergedMarkets = mergeMarkets(
      existingMarkets.filter(m => ALLOWED_MARKETS.includes(m.name)), 
      goalMarkets
    );

    const payload = {
      match_id: matchId,
      bookmaker: bookmaker,
      odds_data: mergedMarkets,
      updated_at: new Date().toISOString()
    };

    const res = await fetch(`${supabaseUrl}/rest/v1/wc2026_match_odds`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      console.error(`Failed to save odds for match ${matchId}: HTTP ${res.status} - ${await res.text()}`);
    } else {
      console.log(`Synced goals odds for match ${matchId} (${bookmaker}). Markets: ${mergedMarkets.map(m => m.name).join(', ')}`);
    }
  } catch (err) {
    console.error(`Error saving odds for match ${matchId}:`, err.message);
  }
}

// Connect to WebSocket
function connectWebSocket() {
  // Specify market filter to only receive goal odds, saving trial bandwidth and requests
  let wsUrl = `wss://api.odds-api.io/v3/ws?apiKey=${apiKey}&channels=odds,scores,status&sport=football&leagues=international-fifa-world-cup&markets=Spread,Totals,Asian%20Handicap,Goals%20Over/Under`;
  if (lastSeq) {
    wsUrl += `&lastSeq=${lastSeq}`;
  }

  console.log(`Connecting to WebSocket: ${wsUrl}`);
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket connection opened successfully.');
    reconnectTimeout = 1000; // reset reconnect backoff
  };

  ws.onmessage = async (event) => {
    // WebSocket packages may contain multiple line-separated JSON events
    const lines = event.data.split('\n').filter(line => line.trim() !== '');

    for (const line of lines) {
      try {
        const data = JSON.parse(line);

        if (data.type === 'welcome') {
          console.log(`Welcome message received. Connected as ${data.user_id}.`);
          return;
        }

        if (data.type === 'resync_required') {
          console.warn('Resync required by server. Clearing lastSeq and reconnecting...');
          lastSeq = null;
          ws.close();
          return;
        }

        // Track sequence number
        if (data.seq) {
          lastSeq = data.seq;
        }

        // Process message with odds
        if (data.id && Array.isArray(data.markets)) {
          const eventId = Number(data.id);
          const bookmaker = data.bookie || 'Bet365';

          let matchId = matchMappingCache.get(eventId);

          if (matchId === undefined) {
            // Find in cache
            let mappedEvent = eventMappingCache.get(eventId);
            if (!mappedEvent) {
              console.log(`Event ID ${eventId} not in cache, fetching events...`);
              await fetchOddsApiEvents();
              mappedEvent = eventMappingCache.get(eventId);
            }

            if (mappedEvent) {
              const matched = findMatchedMatch(mappedEvent.home, mappedEvent.away, mappedEvent.date);
              if (matched) {
                matchId = Number(matched.id);
                matchMappingCache.set(eventId, matchId);
                console.log(`Mapped event ${eventId} (${mappedEvent.home} vs ${mappedEvent.away}) -> Match ID ${matchId}`);
              } else {
                matchId = null;
                matchMappingCache.set(eventId, null);
                console.warn(`Could not resolve Supabase match for event ${eventId}: ${mappedEvent.home} vs ${mappedEvent.away}`);
              }
            } else {
              matchId = null;
              matchMappingCache.set(eventId, null);
              console.warn(`Could not resolve team names for event ID ${eventId}`);
            }
          }

          if (matchId) {
            await saveOddsToSupabase(matchId, bookmaker, data.markets);
          }
        }
      } catch (err) {
        console.error('Error handling WebSocket line message:', err.message, 'Line prefix:', line.substring(0, 100));
      }
    }
  };

  ws.onerror = (err) => {
    console.error('WebSocket error occurred:', err.message || err);
  };

  ws.onclose = (event) => {
    console.log(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason || 'None'}`);
    
    // Auto-reconnect with exponential backoff (max 30s)
    console.log(`Attempting reconnection in ${reconnectTimeout / 1000}s...`);
    setTimeout(() => {
      reconnectTimeout = Math.min(reconnectTimeout * 2, 30000);
      connectWebSocket();
    }, reconnectTimeout);
  };
}

async function run() {
  await fetchDatabaseState();
  await fetchOddsApiEvents();
  
  // Refresh database matches every 1 hour to keep in sync
  setInterval(fetchDatabaseState, 60 * 60 * 1000);
  // Refresh events list mapping every 4 hours
  setInterval(fetchOddsApiEvents, 4 * 60 * 60 * 1000);

  connectWebSocket();
}

run();
