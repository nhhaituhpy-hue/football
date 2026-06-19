const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '../out');

function processDir(dirPath) {
  const items = fs.readdirSync(dirPath);
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (item.startsWith('__next.')) {
        // Tìm thấy thư mục dạng __next.bracket hoặc __next.standings
        const pageTxtPath = path.join(fullPath, '__PAGE__.txt');
        if (fs.existsSync(pageTxtPath)) {
          const destName = `${item}.__PAGE__.txt`;
          const destPath = path.join(dirPath, destName);
          fs.copyFileSync(pageTxtPath, destPath);
          console.log(`Copied: ${pageTxtPath} -> ${destPath}`);
        }
      } else {
        processDir(fullPath);
      }
    }
  }
}

if (fs.existsSync(outDir)) {
  console.log('Fixing static paths in out/ directory...');
  processDir(outDir);
  console.log('Static paths fix completed.');
} else {
  console.error('Error: out/ directory does not exist. Run next build first.');
  process.exit(1);
}
