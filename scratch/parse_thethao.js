const cheerio = require('cheerio');
const fs = require('fs');

function parse() {
  const html = fs.readFileSync('scratch/thethao_response.html', 'utf8');
  const $ = cheerio.load(html);
  
  console.log('--- Analyzing HTML Structure ---');
  
  // Find all match list container or items
  // Let's look for sections or list items
  const matchGroups = [];
  
  // Let's find league tables or containers
  $('.box_livescore').each((i, el) => {
    const leagueName = $(el).find('.title-country, .title-league, h2, h3').text().trim();
    console.log(`\nLeague Container ${i}: "${leagueName}"`);
    
    // Within this container, let's look for match items
    $(el).find('.item-livescore, .match-item, tr, li, div').each((j, item) => {
      const className = $(item).attr('class') || '';
      const idName = $(item).attr('id') || '';
      
      // Filter for item elements
      if (className.includes('item') || className.includes('match') || idName.includes('match') || className.includes('row')) {
        const text = $(item).text().replace(/\s+/g, ' ').trim();
        if (text.length > 10 && text.length < 200) {
          console.log(`  Item ${j} [Class: "${className}", ID: "${idName}"]: "${text}"`);
        }
      }
    });
  });

  console.log('\n--- Searching for Portugal or Congo or World Cup ---');
  // Let's find any text containing Portugal or Congo DR or World Cup
  $('*').each((i, el) => {
    const text = $(el).text().trim();
    if (text.includes('Bồ Đào Nha') || text.includes('Congo') || text.includes('Portugal') || text.includes('World Cup')) {
      const tagName = el.tagName;
      const className = $(el).attr('class') || '';
      // Only log leaf elements to avoid printing the whole page
      if ($(el).children().length === 0) {
        console.log(`Tag: <${tagName} class="${className}">: "${text}"`);
      }
    }
  });
}

parse();
