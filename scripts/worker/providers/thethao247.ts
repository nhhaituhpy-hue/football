import { CACHE_TTL_SECONDS, USER_AGENTS } from '../config';

export function parseEventsHtml(html: string, matchId: number): any[] {
  const events: any[] = [];
  const itemRegex = /<div class="summary-item d-flex px-2 fs-13 justify-content-between\s*(flex-row|flex-row-reverse)">([\s\S]*?)<div class="end-block">[\s\S]*?<\/div>\s*<\/div>/g;

  let match;
  let index = 0;
  while ((match = itemRegex.exec(html)) !== null) {
    const direction = match[1]; // 'flex-row' or 'flex-row-reverse'
    const blockContent = match[2];

    const isHomeTeam = direction !== 'flex-row-reverse';

    // Extract minute
    const centerMatch = blockContent.match(/<div class="center-block[^"]*">([\s\S]*?)<\/div>/);
    let minute = 0;
    if (centerMatch) {
      const minText = centerMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().replace("'", "");
      minute = parseInt(minText, 10) || 0;
    }

    // Extract event type
    const titleMatch = blockContent.match(/<title>([^<]*)<\/title>/);
    const eventTypeRaw = titleMatch ? titleMatch[1].toLowerCase().trim() : 'other';

    // Skip player substitutions entirely
    if (eventTypeRaw.includes('substitution') || eventTypeRaw.includes('thay người')) {
      continue;
    }

    let eventType = 'other';
    if (eventTypeRaw.includes('goal')) {
      eventType = 'goal';
    } else if (eventTypeRaw.includes('yellow card') || eventTypeRaw.includes('thẻ vàng')) {
      eventType = 'card_yellow';
    } else if (eventTypeRaw.includes('red card') || eventTypeRaw.includes('thẻ đỏ')) {
      eventType = 'card_red';
    } else if (eventTypeRaw.includes('var')) {
      eventType = 'var';
    }

    // Extract player name and detail
    const startBlockMatch = blockContent.match(/<div class="start-block[^"]*">([\s\S]*?)<\/div>\s*<\/div>/);
    let playerName = '';
    let detail = null;
    if (startBlockMatch) {
      const content = startBlockMatch[1];
      const strongMatch = content.match(/<strong>([\s\S]*?)<\/strong>/);
      const spanMatch = content.match(/<span[^>]*>([\s\S]*?)<\/span>/);

      playerName = strongMatch ? strongMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
      const detailRaw = spanMatch ? spanMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
      if (detailRaw) {
        detail = detailRaw;
      }
    }

    events.push({
      id: `scraped_event_${matchId}_${index++}`,
      match_id: Number(matchId),
      event_type: eventType,
      minute,
      player_name: playerName,
      detail,
      is_home_team: isHomeTeam
    });
  }
  return events;
}

export async function fetchMatchEventsDetail(url: string, matchId: number): Promise<any[]> {
  if (!url) return [];

  const randomUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const response = await fetch(url, {
    headers: {
      'User-Agent': randomUserAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
  } as any);

  if (!response.ok) {
    throw new Error(`Detail page returned HTTP ${response.status}`);
  }

  const html = await response.text();
  return parseEventsHtml(html, matchId);
}

export async function fetchThethao247Live(env: any): Promise<any[]> {
  const url = env.THETHAO247_LIVE_URL || 'https://thethao247.vn/livescores/the-gioi/vo-dich-the-gioi/';

  const randomUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  const response = await fetch(url, {
    headers: {
      'User-Agent': randomUserAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
  } as any);

  if (!response.ok) {
    throw new Error(`Thethao247 returned HTTP ${response.status}`);
  }

  const html = await response.text();
  const blocks = html.match(/<li class="match-info box-event-one-style2[\s\S]*?<\/li>/g) || [];
  const matches: any[] = [];

  for (const block of blocks) {
    const homeMatch = block.match(/data-home-name="([^"]*)"/);
    const awayMatch = block.match(/data-away-name="([^"]*)"/);
    if (!homeMatch || !awayMatch) continue;

    const homeName = homeMatch[1].trim();
    const awayName = awayMatch[1].trim();

    // Extract scores
    const scoreBlockMatch = block.match(/<div class="score">([\s\S]*?)<\/div>/);
    let homeScore = null;
    let awayScore = null;
    if (scoreBlockMatch) {
      const scoreHtml = scoreBlockMatch[1];
      const spans = scoreHtml.match(/<span[^>]*>\s*([\d\?]+)\s*<\/span>/g);
      if (spans && spans.length >= 2) {
        const hMatch = spans[0].match(/>\s*([\d\?]+)\s*</);
        const aMatch = spans[1].match(/>\s*([\d\?]+)\s*</);
        if (hMatch && hMatch[1] !== '?') homeScore = Number(hMatch[1].trim());
        if (aMatch && aMatch[1] !== '?') awayScore = Number(aMatch[1].trim());
      }
    }

    // Extract time / minute early
    const timeBlockMatch = block.match(/<div class="time">([\s\S]*?)<\/div>/);
    let timeText = '';
    if (timeBlockMatch) {
      const timeHtml = timeBlockMatch[1];
      timeText = timeHtml.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }

    // Extract status
    const moreBlockMatch = block.match(/<div class="more">([\s\S]*?)<\/div>/);
    let statusText = '';
    if (moreBlockMatch) {
      statusText = moreBlockMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }

    const isLive = block.includes('is_live') || block.includes('blink_me') || statusText.toLowerCase().includes('live');
    const isFinished = 
      statusText.toLowerCase() === 'ft' || statusText.toLowerCase() === 'hết giờ' || statusText.toLowerCase().includes('finished') || statusText.toLowerCase().includes('ended') ||
      timeText.toLowerCase() === 'ft' || timeText.toLowerCase() === 'hết giờ' || timeText.toLowerCase().includes('finished') || timeText.toLowerCase().includes('ended');

    let minute = null;
    let isHt = false;
    if (timeBlockMatch && isLive) {
      const matchMin = timeText.match(/(\d+)/);
      if (matchMin) {
        minute = Number(matchMin[1]);
      }
      if (timeText.toUpperCase().includes('HT') || timeText.includes('giữa hiệp') || timeText.toLowerCase() === 'hết hiệp 1') {
        isHt = true;
      }
    }

    const urlMatch = block.match(/onclick="window\.location\.href='([^']*)'/);
    const detailUrl = urlMatch ? urlMatch[1] : null;

    matches.push({
      homeName,
      awayName,
      homeScore,
      awayScore,
      status: isLive ? 'live' : isFinished ? 'finished' : 'scheduled',
      minute,
      isHt,
      detailUrl,
      redCards: { home: 0, away: 0 },
      yellowCards: { home: 0, away: 0 }
    });
  }

  return matches;
}
