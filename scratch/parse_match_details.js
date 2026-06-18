const cheerio = require('cheerio');
const fs = require('fs');

function parse() {
  const html = fs.readFileSync('scratch/thethao_response.html', 'utf8');
  const $ = cheerio.load(html);
  
  // Find the anchor with text "Bồ Đào Nha"
  const aHome = $('a.name').filter((i, el) => $(el).text().trim() === 'Bồ Đào Nha');
  
  if (aHome.length > 0) {
    console.log('Found Bồ Đào Nha!');
    // Let's traverse up to the container of the match item
    // The class was "match-info box-event-one-style2..." in other sections. Let's see what is the ancestor
    const matchRow = aHome.closest('.match-info, .match-item, tr, li, div.match, div');
    
    // Print the outer HTML of the closest container
    console.log('Closest container class:', matchRow.attr('class'));
    console.log('Closest container outer HTML:');
    console.log($.html(matchRow));
    
    // Also, print the parent's parent of aHome
    const parentContainer = aHome.parent().parent();
    console.log('\nParent container class:', parentContainer.attr('class'));
    console.log('Parent container HTML:');
    console.log($.html(parentContainer));
  } else {
    console.log('Could not find anchor with text "Bồ Đào Nha"');
  }
}

parse();
