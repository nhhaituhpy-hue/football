const cheerio = require('cheerio');

async function test() {
  try {
    const response = await fetch('https://thethao247.vn/livescores/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });
    
    console.log('HTTP Status:', response.status);
    const html = await response.text();
    const $ = cheerio.load(html);
    
    console.log('Page Title:', $('title').text());
    
    // Let's log some interesting elements
    console.log('Iframes found:', $('iframe').length);
    $('iframe').each((i, el) => {
      console.log(`Iframe ${i} src:`, $(el).attr('src'));
    });

    console.log('Div elements with class/id containing "live" or "match" or "score":');
    $('div').each((i, el) => {
      const id = $(el).attr('id') || '';
      const cls = $(el).attr('class') || '';
      if (id.includes('live') || id.includes('match') || id.includes('score') ||
          cls.includes('live') || cls.includes('match') || cls.includes('score')) {
        console.log(`Div - ID: "${id}", Class: "${cls}"`);
      }
    });

    // Write HTML to file for manual inspection if needed
    const fs = require('fs');
    fs.writeFileSync('scratch/thethao_response.html', html, 'utf8');
    console.log('Saved HTML response to scratch/thethao_response.html');
  } catch (error) {
    console.error('Error:', error);
  }
}

test();
