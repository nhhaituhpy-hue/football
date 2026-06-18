const cheerio = require('cheerio');
const fs = require('fs');

function parse() {
  const html = fs.readFileSync('scratch/thethao_response.html', 'utf8');
  const $ = cheerio.load(html);
  
  const matches = [];
  $('li.match-info').each((i, el) => {
    const homeName = $(el).attr('data-home-name') || $(el).find('.team-a .name').text().trim();
    const awayName = $(el).attr('data-away-name') || $(el).find('.team-b .name').text().trim();
    if (!homeName || !awayName) return;

    const timeText = $(el).find('.time').first().text().replace(/\s+/g, ' ').trim();
    const statusText = $(el).find('.more').text().replace(/\s+/g, ' ').trim();
    
    // Extract scores
    const spans = $(el).find('.score span');
    let homeScore = null;
    let awayScore = null;
    
    if (spans.length >= 2) {
      homeScore = $(spans[0]).text().trim();
      awayScore = $(spans[1]).text().trim();
    }

    const isLive = $(el).hasClass('is_live') || statusText.toLowerCase().includes('live');
    // Check if finished (often "FT" or class has finished markers, let's print statusText)
    const isFinished = statusText.toLowerCase() === 'ft' || statusText.toLowerCase() === 'hết giờ' || statusText.toLowerCase().includes('finished') || statusText.toLowerCase().includes('ended');

    let minute = null;
    if (isLive) {
      const matchMin = timeText.match(/(\d+)/);
      if (matchMin) {
        minute = Number(matchMin[1]);
      }
    }

    matches.push({
      homeName,
      awayName,
      timeText,
      statusText,
      homeScore: homeScore !== null && homeScore !== '' && !isNaN(Number(homeScore)) ? Number(homeScore) : null,
      awayScore: awayScore !== null && awayScore !== '' && !isNaN(Number(awayScore)) ? Number(awayScore) : null,
      status: isLive ? 'live' : isFinished ? 'finished' : 'scheduled',
      minute,
    });
  });
  
  // Filter for World Cup matches (or any match containing Bồ Đào Nha, D.R. Congo, Anh, Croatia)
  const wcMatches = matches.filter(m => 
    m.homeName.includes('Bồ Đào Nha') || m.awayName.includes('Congo') ||
    m.homeName.includes('Anh') || m.awayName.includes('Croatia')
  );
  
  console.log('All parsed WC matches (count:', wcMatches.length, '):');
  console.log(JSON.stringify(wcMatches, null, 2));
}

parse();
