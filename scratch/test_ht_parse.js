// Test script to verify the HT parsing logic.
// Run this with Node.js to verify it outputs isHt: true and minute: null.

const mockHtml = `
<li class="match-info box-event-one-style2 is_live" onclick="window.location.href='https://thethao247.vn/livescores/detail-match-12345.html'">
  <div class="teams-container">
    <div class="team home" data-home-name="Bồ Đào Nha">Bồ Đào Nha</div>
    <div class="score">
      <span>1</span>
      <span>1</span>
    </div>
    <div class="team away" data-away-name="Pháp">Pháp</div>
  </div>
  <div class="time">HT</div>
  <div class="more">Live</div>
</li>
`;

function testParse(html) {
  const blocks = html.match(/<li class="match-info box-event-one-style2[\s\S]*?<\/li>/g) || [];
  const matches = [];

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

    // Extract status early
    const moreBlockMatch = block.match(/<div class="more">([\s\S]*?)<\/div>/);
    let statusText = '';
    if (moreBlockMatch) {
      statusText = moreBlockMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }

    const isLive = block.includes('is_live') || block.includes('blink_me') || statusText.toLowerCase().includes('live');
    const isFinished = statusText.toLowerCase() === 'ft' || statusText.toLowerCase() === 'hết giờ' || statusText.toLowerCase().includes('finished') || statusText.toLowerCase().includes('ended');

    // Extract time / minute
    const timeBlockMatch = block.match(/<div class="time">([\s\S]*?)<\/div>/);
    let timeText = '';
    let minute = null;
    let isHt = false;
    if (timeBlockMatch) {
      const timeHtml = timeBlockMatch[1];
      timeText = timeHtml.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      
      const matchMin = timeText.match(/(\d+)/);
      if (isLive) {
        if (matchMin) {
          minute = Number(matchMin[1]);
        }
        if (timeText.toUpperCase().includes('HT') || timeText.includes('giữa hiệp') || timeText.toLowerCase() === 'hết hiệp 1') {
          isHt = true;
        }
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
      detailUrl
    });
  }

  return matches;
}

console.log('Parsing mock HTML...');
const result = testParse(mockHtml);
console.log('Result:', JSON.stringify(result, null, 2));

if (result[0] && result[0].isHt === true && result[0].minute === null) {
  console.log('SUCCESS: HT match parsed correctly!');
} else {
  console.error('FAILURE: Parsing logic did not work as expected.', result);
  process.exit(1);
}
