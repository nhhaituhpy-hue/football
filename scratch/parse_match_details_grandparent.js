const cheerio = require('cheerio');
const fs = require('fs');

function parse() {
  const html = fs.readFileSync('scratch/thethao_response.html', 'utf8');
  const $ = cheerio.load(html);
  
  const aHome = $('a.name').filter((i, el) => $(el).text().trim() === 'Bồ Đào Nha');
  
  if (aHome.length > 0) {
    const eventMain = aHome.closest('.event-main');
    const grandparent = eventMain.parent();
    console.log('Grandparent tag & class:', grandparent.get(0).tagName, 'class:', grandparent.attr('class'));
    console.log('Grandparent HTML:');
    console.log($.html(grandparent));
  }
}

parse();
