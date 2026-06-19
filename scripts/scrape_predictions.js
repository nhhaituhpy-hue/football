/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' });

const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_KEY.includes('your_')) {
  console.error('Missing Supabase credentials in env.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const nameMap = {
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
  'thụy điển': 'SWE',
  'tunisia': 'TUN',
  'thổ nhĩ kỳ': 'TUR',
  'thổ n. k.': 'TUR',
  'uruguay': 'URU',
  'mỹ': 'USA',
  'usa': 'USA',
  'uzbekistan': 'UZB'
};

function getTeamCode(name) {
  if (!name) return null;
  const clean = name.toLowerCase().trim();
  return nameMap[clean] || null;
}

function getTeamNames(code, defaultName) {
  const names = Object.keys(nameMap).filter(k => nameMap[k] === code);
  if (defaultName && !names.includes(defaultName.toLowerCase().trim())) {
    names.push(defaultName.toLowerCase().trim());
  }
  return names;
}

function findScorePrediction($, homeCode, homeName, awayCode, awayName) {
  const homeTerms = getTeamNames(homeCode, homeName);
  const awayTerms = getTeamNames(awayCode, awayName);
  const mediaTerms = [
    'sportskeeda', 'sports mole', 'sportsmole', 'standard', 'whoscored', 'mole', 
    'siêu máy tính', 'máy tính', 'nhà báo', 'chuyên gia',
    'phạt góc', 'thẻ phạt', 'bàn thắng', 'thẻ vàng', 'góc'
  ];
  
  // 1. Look for sentences/paragraphs in content_detail
  const blocks = [];
  $('#content_detail').find('p, li, h2, h3, h4').each((i, el) => {
    const txt = $(el).text().trim();
    if (txt) blocks.push(txt);
  });
  
  const scoreRegex = /\b\d+\s*[-–]\s*\d+\b/;
  
  for (const block of blocks) {
    const blockLower = block.toLowerCase();
    if (mediaTerms.some(term => blockLower.includes(term))) continue;

    // Split block into sentences
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
  
  // 2. Fallback: Look for a paragraph/list item that has "Dự đoán tỷ số" and both team names,
  // where the next sibling paragraph has the score pattern.
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

function getVietnamYMD(kickoffUtc) {
  const matchDate = new Date(kickoffUtc);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(matchDate);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${url}, HTTP ${response.status}`);
  }
  return response.text();
}

function getParagraphsUntilNextHeadingOrLi($, startEl) {
  let result = [];
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

function parsePredictionPage(html, url) {
  const $ = cheerio.load(html);
  const title = $('h1#title_detail').text().trim() || $('h1').first().text().trim();
  const sapo = $('.sapo_detail').text().trim();

  // 1. Parse Lực lượng (Force info)
  let forceInfo = { home: '', away: '' };
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

  // 2. Parse Phong độ & Đối đầu
  let formInfo = { home: '', away: '', h2h: '' };
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

  // 3. Parse Dự đoán chi tiết
  let predictionInfo = { goals: '', corners: '', cards: '', score: '' };
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

  // 4. Parse Truyền thông dự đoán
  let mediaPrediction = {};
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

  // 5. Parse Full analysis text
  let fullAnalysis = '';
  const analysisHeader = $('h2').filter((i, el) => {
    const txt = $(el).text().toLowerCase();
    return txt.includes('nhận định') && !txt.includes('tỷ số') && !txt.includes('lực lượng') && !txt.includes('phong độ');
  }).first();
  if (analysisHeader.length) {
    let paragraphs = [];
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
    // Fallback: take all paragraphs in content_detail
    let paragraphs = [];
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

async function main() {
  const startedAt = new Date().toISOString();
  console.log('Fetching livescores page to find prediction links...');

  try {
    const livescoresUrl = 'https://thethao247.vn/livescores/the-gioi/vo-dich-the-gioi/';
    const livescoresHtml = await fetchHtml(livescoresUrl);
    const $ = cheerio.load(livescoresHtml);

    // Extract prediction links
    const predictionLinks = [];
    $('a').each((i, a) => {
      const href = $(a).attr('href');
      const text = $(a).text().trim();
      if (href && href.includes('nhan-dinh') && href.endsWith('.html') && text.includes('Nhận định')) {
        if (!predictionLinks.some(link => link.url === href)) {
          predictionLinks.push({ url: href, text });
        }
      }
    });

    console.log(`Found ${predictionLinks.length} prediction links:`, predictionLinks);

    // Get all matches from Supabase to match
    const { data: dbMatches, error: matchesError } = await supabase
      .from('wc2026_matches')
      .select('id, kickoff_utc, home_team_code, away_team_code, home_team_name, away_team_name, status');
    
    if (matchesError) throw matchesError;

    console.log(`Retrieved ${dbMatches.length} matches from database.`);

    let matchedCount = 0;

    for (const link of predictionLinks) {
      console.log(`Processing prediction link: ${link.url}`);
      try {
        // Fetch and parse the detail page
        const detailHtml = await fetchHtml(link.url);
        const parsed = parsePredictionPage(detailHtml, link.url);

        // Attempt matching to a database match
        // Extract teams from URL or Title
        // URL format: https://thethao247.vn/190556-nhan-dinh-ch-sec-vs-nam-phi-23h00-ngay-18-06-2026-d423741.html
        // We clean up and look for team names
        const cleanTitle = parsed.title.toLowerCase().replace('nhận định', '').trim();
        const teamParts = cleanTitle.split(/ vs | vs\. | gặp | - /);

        if (teamParts.length >= 2) {
          const teamAStr = teamParts[0].trim();
          const teamBStr = teamParts[1].split(':')[0].trim();

          const codeA = getTeamCode(teamAStr);
          const codeB = getTeamCode(teamBStr);

          console.log(`Extracted team strings: "${teamAStr}" (${codeA}) vs "${teamBStr}" (${codeB})`);

          if (codeA && codeB) {
            // Find match in DB
            // Check matching team codes
            const matchedMatches = dbMatches.filter(m => 
              ((m.home_team_code === codeA && m.away_team_code === codeB) ||
               (m.home_team_code === codeB && m.away_team_code === codeA))
            );

            console.log(`Found ${matchedMatches.length} code-matched matches in DB.`);

            if (matchedMatches.length > 0) {
              // Further verify using Date if there are multiple matches, or just match the single one.
              // Extract date from URL: e.g. 18-06-2026
              const dateMatch = link.url.match(/(\d{2})-(\d{2})-(\d{4})/);
              let urlDateYMD = '';
              if (dateMatch) {
                urlDateYMD = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
              }

              let finalMatch = matchedMatches[0];

              if (matchedMatches.length > 1 && urlDateYMD) {
                // Find the one on the same date
                const dateMatched = matchedMatches.find(m => getVietnamYMD(m.kickoff_utc) === urlDateYMD);
                if (dateMatched) finalMatch = dateMatched;
              }

              console.log(`Successfully matched to match ID ${finalMatch.id} (${finalMatch.home_team_code} vs ${finalMatch.away_team_code})`);

              // Try to find a refined score prediction using the new regex logic
              const mainScore = findScorePrediction(cheerio.load(detailHtml), finalMatch.home_team_code, finalMatch.home_team_name, finalMatch.away_team_code, finalMatch.away_team_name);
              if (mainScore) {
                console.log(`Found refined score prediction: "${mainScore}"`);
                parsed.prediction_info.score = mainScore;
              }

              // Save to Database
              const predictionRow = {
                match_id: finalMatch.id,
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

              const { error: upsertError } = await supabase
                .from('wc2026_match_predictions')
                .upsert(predictionRow);

              if (upsertError) {
                console.error(`Failed to upsert prediction for match ${finalMatch.id}:`, upsertError.message);
              } else {
                console.log(`Successfully saved prediction for match ID ${finalMatch.id} to Supabase.`);
                matchedCount++;
              }
            } else {
              console.warn(`Could not find a matching match in DB for ${codeA} vs ${codeB}.`);
            }
          } else {
            console.warn(`Could not map team strings to codes: "${teamAStr}" -> ${codeA}, "${teamBStr}" -> ${codeB}`);
          }
        } else {
          console.warn(`Could not parse team names from title: "${parsed.title}"`);
        }
      } catch (err) {
        console.error(`Error processing prediction link ${link.url}:`, err);
      }
    }

    // Write Sync Log
    const finishedAt = new Date().toISOString();
    const log = {
      source: 'thethao247_predictions',
      status: 'success',
      message: `Successfully scraped and saved ${matchedCount} predictions out of ${predictionLinks.length} links found.`,
      rows_read: predictionLinks.length,
      rows_written: matchedCount,
      started_at: startedAt,
      finished_at: finishedAt
    };
    
    await supabase.from('wc2026_api_sync_log').insert(log);
    console.log('Scraping and matching complete.');

  } catch (error) {
    console.error('Error during prediction scraping sync:', error);
    // Write Error Log
    try {
      await supabase.from('wc2026_api_sync_log').insert({
        source: 'thethao247_predictions',
        status: 'error',
        message: error.message,
        started_at: startedAt,
        finished_at: new Date().toISOString()
      });
    } catch (logErr) {
      console.error('Failed to log error to sync logs:', logErr.message);
    }
    process.exit(1);
  }
}

main();
