import * as cheerio from 'cheerio';
import { getSupabaseRows, upsertSupabaseRows } from '../repositories/supabase';
import { getVietnamYMD } from '../utils';

export const nameMap: Record<string, string> = {
  'cộng hòa séc': 'CZE',
  'ch séc': 'CZE',
  'séc': 'CZE',
  'nam phi': 'RSA',
  'thụy sĩ': 'SUI',
  'bosnia & herzegovina': 'BIH',
  'bosnia-herzegovina': 'BIH',
  'bosnia': 'BIH',
  'canada': 'CAN',
  'qatar': 'QAT',
  'uzbekistan': 'UZB',
  'colombia': 'COL',
  'algeria': 'ALG',
  'argentina': 'ARG',
  'úc': 'AUS',
  'australia': 'AUS',
  'áo': 'AUT',
  'bỉ': 'BEL',
  'brazil': 'BRA',
  'bờ biển ngà': 'CIV',
  'côte d\'ivoire': 'CIV',
  'congo dr': 'COD',
  'chdc congo': 'COD',
  'cabo verde': 'CPV',
  'cape verde': 'CPV',
  'croatia': 'CRO',
  'curaçao': 'CUW',
  'curacao': 'CUW',
  'ecuador': 'ECU',
  'ai cập': 'EGY',
  'anh': 'ENG',
  'tây ban nha': 'ESP',
  'pháp': 'FRA',
  'đức': 'GER',
  'ghana': 'GHA',
  'haiti': 'HAI',
  'iran': 'IRN',
  'iraq': 'IRQ',
  'jordan': 'JOR',
  'nhật bản': 'JPN',
  'hàn quốc': 'KOR',
  'ả rập saudi': 'KSA',
  'saudi arabia': 'KSA',
  'ma rốc': 'MAR',
  'morocco': 'MAR',
  'mexico': 'MEX',
  'hà lan': 'NED',
  'na uy': 'NOR',
  'new zealand': 'NZL',
  'panama': 'PAN',
  'paraguay': 'PAR',
  'bồ đào nha': 'POR',
  'scotland': 'SCO',
  'senegal': 'SEN',
  'thụy diễn': 'SWE',
  'thụy điển': 'SWE',
  'tunisia': 'TUN',
  'thổ nhĩ kỳ': 'TUR',
  'thổ n. k.': 'TUR',
  'uruguay': 'URU',
  'mỹ': 'USA',
  'usa': 'USA'
};

export function getTeamCode(name: string | null | undefined): string | null {
  if (!name) return null;
  const clean = name.toLowerCase().trim();
  return nameMap[clean] || null;
}

export function getTeamNames(code: string | null | undefined, defaultName: string | null | undefined): string[] {
  if (!code) return [];
  const names = Object.keys(nameMap).filter(k => nameMap[k] === code);
  if (defaultName && !names.includes(defaultName.toLowerCase().trim())) {
    names.push(defaultName.toLowerCase().trim());
  }
  return names;
}

export function findScorePrediction($: cheerio.CheerioAPI, homeCode: string, homeName: string, awayCode: string, awayName: string): string {
  const homeTerms = getTeamNames(homeCode, homeName);
  const awayTerms = getTeamNames(awayCode, awayName);
  const mediaTerms = [
    'sportskeeda', 'sports mole', 'sportsmole', 'standard', 'whoscored', 'mole', 
    'siêu máy tính', 'máy tính', 'nhà báo', 'chuyên gia',
    'phạt góc', 'thẻ phạt', 'bàn thắng', 'thẻ vàng', 'góc'
  ];
  
  const blocks: string[] = [];
  $('#content_detail').find('p, li, h2, h3, h4').each((i, el) => {
    const txt = $(el).text().trim();
    if (txt) blocks.push(txt);
  });
  
  const scoreRegex = /\b\d+\s*[-–]\s*\d+\b/;
  
  for (const block of blocks) {
    const blockLower = block.toLowerCase();
    if (mediaTerms.some(term => blockLower.includes(term))) continue;

    const sentences = block.split(/[.!?\n]/);
    for (let sentence of sentences) {
      sentence = sentence.trim();
      if (!sentence) continue;
      
      const sentenceLower = sentence.toLowerCase();
      
      if (sentenceLower.includes('dự đoán')) {
        if (scoreRegex.test(sentence)) {
          const hasHome = homeTerms.some(term => sentenceLower.includes(term));
          const hasAway = awayTerms.some(term => sentenceLower.includes(term));
          
          if (hasHome && hasAway) {
            return sentence;
          }
        }
      }
    }
  }
  
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockLower = block.toLowerCase();
    if (blockLower.includes('dự đoán tỷ số') && !blockLower.includes('truyền thông')) {
      const hasHome = homeTerms.some(term => blockLower.includes(term));
      const hasAway = awayTerms.some(term => blockLower.includes(term));
      
      if (hasHome && hasAway && i + 1 < blocks.length) {
        const nextBlock = blocks[i + 1];
        if (scoreRegex.test(nextBlock)) {
          return `${block}: ${nextBlock}`;
        }
      }
    }
  }
  
  return '';
}

export function getParagraphsUntilNextHeadingOrLi($: cheerio.CheerioAPI, startEl: cheerio.Cheerio<any>): string {
  const result: string[] = [];
  let current = startEl;
  if (startEl.is('li') && startEl.parent().is('ul, ol')) {
    current = startEl.parent();
  }
  let next = current.next();
  while (next.length && !next.is('h2, h3, h4, li, ul, ol')) {
    if (next.is('p')) {
      const text = next.text().trim();
      if (text) {
        result.push(text);
      }
    }
    next = next.next();
  }
  return result.join('\n\n');
}

export function parsePredictionPage(html: string, url: string): any {
  const $ = cheerio.load(html);
  const title = $('h1#title_detail').text().trim() || $('h1').first().text().trim();
  const sapo = $('.sapo_detail').text().trim();

  const forceInfo = { home: '', away: '' };
  const forceHeader = $('h2, h3').filter((i, el) => $(el).text().toLowerCase().includes('lực lượng')).first();
  if (forceHeader.length) {
    const nextList = forceHeader.nextAll('ul, ol').first();
    if (nextList.length) {
      nextList.find('li').each((i, li) => {
        const text = $(li).text().trim();
        const parts = text.split(':');
        const prefix = parts[0] ? parts[0].trim() : '';
        const mappedCode = getTeamCode(prefix);

        if (mappedCode) {
          if (i === 0) forceInfo.home = text;
          else if (i === 1) forceInfo.away = text;
        } else {
          if (i === 0) forceInfo.home = text;
          if (i === 1) forceInfo.away = text;
        }
      });
    }
  }

  const formInfo = { home: '', away: '', h2h: '' };
  const formHeader = $('h2, h3').filter((i, el) => $(el).text().toLowerCase().includes('phong độ')).first();
  if (formHeader.length) {
    const nextList = formHeader.nextAll('ul, ol').first();
    if (nextList.length) {
      nextList.find('li').each((i, li) => {
        const text = $(li).text().trim();
        if (text.toLowerCase().includes('lịch sử đối đầu') || text.toLowerCase().includes('đối đầu')) {
          formInfo.h2h = text;
        } else {
          if (i === 0) formInfo.home = text;
          if (i === 1) formInfo.away = text;
        }
      });
    }
  }

  const predictionInfo = { goals: '', corners: '', cards: '', score: '' };
  $('#content_detail').find('li, p, h3, h4').each((i, el) => {
    const text = $(el).text().trim();
    if (text.toLowerCase().includes('dự đoán số bàn thắng') || text.toLowerCase().includes('dự đoán bàn thắng')) {
      const parsed = getParagraphsUntilNextHeadingOrLi($, $(el));
      if (parsed && parsed.trim() && parsed.trim().length > predictionInfo.goals.length) {
        predictionInfo.goals = parsed.trim();
      }
    } else if (text.toLowerCase().includes('dự đoán phạt góc')) {
      const parsed = getParagraphsUntilNextHeadingOrLi($, $(el));
      if (parsed && parsed.trim() && parsed.trim().length > predictionInfo.corners.length) {
        predictionInfo.corners = parsed.trim();
      }
    } else if (text.toLowerCase().includes('dự đoán thẻ phạt')) {
      const parsed = getParagraphsUntilNextHeadingOrLi($, $(el));
      if (parsed && parsed.trim() && parsed.trim().length > predictionInfo.cards.length) {
        predictionInfo.cards = parsed.trim();
      }
    } else if (text.toLowerCase().includes('dự đoán tỷ số') && !text.toLowerCase().includes('truyền thông')) {
      let scoreText = '';
      let current = $(el);
      if ($(el).is('li') && $(el).parent().is('ul, ol')) {
        current = $(el).parent();
      }
      let next = current.next();
      while (next.length && !next.is('h2, h3, h4, li, ul, ol')) {
        if (next.is('p')) {
          scoreText += next.text().trim() + ' ';
        }
        next = next.next();
      }
      scoreText = scoreText.trim();
      if (scoreText) {
        if (scoreText.length > predictionInfo.score.length) {
          predictionInfo.score = scoreText;
        }
      } else if (!predictionInfo.score) {
        predictionInfo.score = text;
      }
    }
  });

  const mediaPrediction: Record<string, string> = {};
  const mediaHeader = $('h3, h2').filter((i, el) => $(el).text().toLowerCase().includes('truyền thông') || $(el).text().toLowerCase().includes('sportskeeda')).first();
  if (mediaHeader.length) {
    const nextList = mediaHeader.nextAll('ul, ol').first();
    if (nextList.length) {
      nextList.find('li').each((i, li) => {
        const text = $(li).text().trim();
        const parts = text.split(':');
        if (parts.length >= 2) {
          const mediaName = parts[0].replace('dự đoán', '').trim();
          mediaPrediction[mediaName] = parts.slice(1).join(':').trim();
        } else {
          mediaPrediction[`Media ${i + 1}`] = text;
        }
      });
    }
  }

  let fullAnalysis = '';
  const analysisHeader = $('h2').filter((i, el) => {
    const txt = $(el).text().toLowerCase();
    return txt.includes('nhận định') && !txt.includes('tỷ số') && !txt.includes('lực lượng') && !txt.includes('phong độ');
  }).first();
  if (analysisHeader.length) {
    const paragraphs: string[] = [];
    let next = analysisHeader.next();
    while (next.length && !next.is('h2, h3, h4')) {
      if (next.is('p')) {
        const text = next.text().trim();
        if (text) {
          paragraphs.push(text);
        }
      }
      next = next.next();
    }
    fullAnalysis = paragraphs.join('\n\n');
  } else {
    const paragraphs: string[] = [];
    $('#content_detail').find('p').each((i, p) => {
      const text = $(p).text().trim();
      if (text && !text.toLowerCase().includes('sportskeeda') && !text.toLowerCase().includes('sports mole')) {
        paragraphs.push(text);
      }
    });
    fullAnalysis = paragraphs.slice(Math.floor(paragraphs.length / 2)).join('\n\n');
  }

  return {
    source_url: url,
    title,
    sapo,
    force_info: forceInfo,
    form_info: formInfo,
    prediction_info: predictionInfo,
    media_prediction: mediaPrediction,
    full_analysis: fullAnalysis
  };
}

import { runLoggingJob } from '../utils/logger';

export async function syncPredictionsToday(env: any): Promise<{ status: string; message: string; scraped_count?: number }> {
  console.log('Starting syncPredictionsToday scraper...');
  try {
    const result = await runLoggingJob(env, 'prediction-sync', async (correlationId) => {
      // 1. Get matches from Supabase
      const dbMatches = await getSupabaseRows(env, '/rest/v1/wc2026_matches?select=*')
        .catch(error => {
          console.warn('Failed to fetch matches from Supabase:', error.message);
          return [];
        });

      const now = new Date();
      const todayYMD = getVietnamYMD(now);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowYMD = getVietnamYMD(tomorrow);

      const todayMatches = dbMatches.filter(m => {
        const matchYMD = getVietnamYMD(m.kickoff_utc);
        return matchYMD === todayYMD || matchYMD === tomorrowYMD;
      });

      console.log(`[${correlationId}] Found ${todayMatches.length} matches scheduled for today (${todayYMD}) or tomorrow (${tomorrowYMD}).`);
      if (todayMatches.length === 0) {
        return {
          rowsRead: 0,
          rowsWritten: 0,
          message: `No matches scheduled for today (${todayYMD}) or tomorrow (${tomorrowYMD}). Skipping scraper.`
        };
      }

      const todayMatchTeams = todayMatches.map(m => ({
        match: m,
        homeCodes: getTeamNames(m.home_team_code, m.home_team_name),
        awayCodes: getTeamNames(m.away_team_code, m.away_team_name),
      }));

      // 2. Fetch livescores page
      const livescoresUrl = 'https://thethao247.vn/livescores/the-gioi/vo-dich-the-gioi/';
      const response = await fetch(livescoresUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch livescores page: HTTP ${response.status}`);
      }
      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract prediction links
      const predictionLinks: { url: string; text: string }[] = [];
      $('a').each((i, a) => {
        const href = $(a).attr('href');
        const text = $(a).text().trim();
        if (href && href.includes('nhan-dinh') && href.endsWith('.html') && text.includes('Nhận định')) {
          if (!predictionLinks.some(link => link.url === href)) {
            predictionLinks.push({ url: href, text });
          }
        }
      });

      console.log(`[${correlationId}] Found ${predictionLinks.length} prediction links total on page.`);

      // 3. Filter prediction links that match today's matches
      const linksToScrape: { link: { url: string; text: string }; match: any }[] = [];
      for (const link of predictionLinks) {
        const textLower = link.text.toLowerCase();
        const urlLower = link.url.toLowerCase();

        const matchedMatch = todayMatchTeams.find(t => {
          const homeMatched = t.homeCodes.some(name => {
            const cleanName = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
            return textLower.includes(name) || urlLower.replace(/-/g, '').includes(cleanName);
          });
          const awayMatched = t.awayCodes.some(name => {
            const cleanName = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
            return textLower.includes(name) || urlLower.replace(/-/g, '').includes(cleanName);
          });
          return homeMatched && awayMatched;
        });

        if (matchedMatch) {
          linksToScrape.push({
            link,
            match: matchedMatch.match
          });
        }
      }

      console.log(`[${correlationId}] Filtered down to ${linksToScrape.length} links corresponding to today's matches.`);

      let matchedCount = 0;
      for (const item of linksToScrape) {
        const { link, match } = item;
        console.log(`[${correlationId}] Scraping prediction for match ID ${match.id} (${match.home_team_code} vs ${match.away_team_code}) from: ${link.url}`);
        try {
          const detailRes = await fetch(link.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          if (!detailRes.ok) {
            console.warn(`Failed to fetch prediction detail: HTTP ${detailRes.status}`);
            continue;
          }
          const detailHtml = await detailRes.text();
          const parsed = parsePredictionPage(detailHtml, link.url);

          const mainScore = findScorePrediction(cheerio.load(detailHtml), match.home_team_code, match.home_team_name, match.away_team_code, match.away_team_name);
          if (mainScore) {
            console.log(`[${correlationId}] Found refined score prediction: "${mainScore}"`);
            parsed.prediction_info.score = mainScore;
          }

          const predictionRow = {
            match_id: match.id,
            source_url: link.url,
            title: parsed.title,
            sapo: parsed.sapo,
            force_info: parsed.force_info,
            form_info: parsed.form_info,
            prediction_info: parsed.prediction_info,
            media_prediction: parsed.media_prediction,
            full_analysis: parsed.full_analysis,
            updated_at: new Date().toISOString()
          };

          await upsertSupabaseRows(env, '/rest/v1/wc2026_match_predictions', [predictionRow]);
          console.log(`[${correlationId}] Successfully saved prediction for match ID ${match.id} to Supabase.`);
          matchedCount++;
        } catch (err) {
          console.error(`[${correlationId}] Error scraping prediction link ${link.url}:`, err);
        }
      }

      return {
        rowsRead: linksToScrape.length,
        rowsWritten: matchedCount,
        message: `Worker successfully scraped and saved ${matchedCount} predictions for today's matches.`
      };
    });

    return {
      status: 'success',
      message: result.message || 'Predictions sync completed successfully.',
      scraped_count: result.rowsWritten
    };
  } catch (error: any) {
    return {
      status: 'error',
      message: error.message
    };
  }
}
