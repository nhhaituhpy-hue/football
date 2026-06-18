const cheerio = require('cheerio');
const fs = require('fs');

function parse() {
  const html = fs.readFileSync('scratch/thethao_response.html', 'utf8');
  const $ = cheerio.load(html);
  
  const aHome = $('a.name').filter((i, el) => $(el).text().trim() === 'Bồ Đào Nha');
  
  if (aHome.length > 0) {
    const group = aHome.closest('.group');
    const parent = group.parent();
    console.log('Parent tag & class:', parent.get(0).tagName, 'class:', parent.attr('class'));
    console.log('Parent HTML:');
    console.log($.html(parent));
  }
}

parse();
