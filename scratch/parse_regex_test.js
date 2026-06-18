const fs = require('fs');

function parseWithRegex() {
  const html = fs.readFileSync('scratch/thethao_response.html', 'utf8');
  
  // Find all <li class="match-info ..."> ... </li> blocks
  // Since <li> can contain nested tags, we can match non-greedily from <li class="match-info to </li>
  // But wait, there might be other <li> tags inside, but we know each match block ends with </li>
  // We can find all matches by split or regex
  const liRegex = /<li class="match-info box-event-one-style2[^>]*>([\s\S]*?)<\/li>/g;
  let match;
  const matches = [];

  // Reset regex index
  liRegex.lastIndex = 0;
  
  // Find all li elements
  const blocks = html.match(/<li class="match-info box-event-one-style2[\s\S]*?<\/li>/g) || [];
  
  console.log(`Found ${blocks.length} raw match blocks via regex.`);

  for (const block of blocks) {
    // Extract data-home-name and data-away-name
    const homeMatch = block.match(/data-home-name="([^"]*)"/);
    const awayMatch = block.match(/data-away-name="([^"]*)"/);
    if (!homeMatch || !awayMatch) continue;

    const homeName = homeMatch[1];
    const awayName = awayMatch[1];

    // Extract score
    // Look for <div class="score">...</div>
    // Inside it, look for <span class="text-danger"> or <span> with scores
    // <span[^>]*>\s*(\d+|\?)\s*<\/span>
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

    // Extract time / minute
    // Look for <span class="time">\s*(\d+)\s*</span> or similar inside <div class="time">
    const timeBlockMatch = block.match(/<div class="time">([\s\S]*?)<\/div>/);
    let timeText = '';
    let minute = null;
    if (timeBlockMatch) {
      const timeHtml = timeBlockMatch[1];
      // Strip html tags
      timeText = timeHtml.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      
      const matchMin = timeText.match(/(\d+)/);
      // Only extract minute if the match is live (has class is_live or has blink_me)
      const isLive = block.includes('is_live') || block.includes('blink_me');
      if (isLive && matchMin) {
        minute = Number(matchMin[1]);
      }
    }

    // Extract status from <div class="more">
    const moreBlockMatch = block.match(/<div class="more">([\s\S]*?)<\/div>/);
    let statusText = '';
    if (moreBlockMatch) {
      statusText = moreBlockMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }

    const isLive = block.includes('is_live') || statusText.toLowerCase().includes('live');
    const isFinished = statusText.toLowerCase() === 'ft' || statusText.toLowerCase() === 'hết giờ' || statusText.toLowerCase().includes('finished') || statusText.toLowerCase().includes('ended');

    matches.push({
      homeName,
      awayName,
      timeText,
      statusText,
      homeScore,
      awayScore,
      status: isLive ? 'live' : isFinished ? 'finished' : 'scheduled',
      minute
    });
  }

  // Filter for World Cup matches
  const wcMatches = matches.filter(m => 
    m.homeName.includes('Bồ Đào Nha') || m.awayName.includes('Congo') ||
    m.homeName.includes('Anh') || m.awayName.includes('Croatia')
  );
  
  console.log('Regex parsed WC matches:');
  console.log(JSON.stringify(wcMatches, null, 2));
}

parseWithRegex();
