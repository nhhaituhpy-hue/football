/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env.local' });
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');

// 1. Khởi tạo Supabase client
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: Thiếu cấu hình Supabase URL hoặc Key trong biến môi trường.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. Các hàm chuẩn hóa tên đội bóng và so khớp
const ALIASES = {
  'korea republic': ['korea republic', 'south korea', 'korea'],
  'usa': ['usa', 'united states', 'u.s.a.'],
  'congo dr': ['congo dr', 'dr congo', 'congo'],
  'cabo verde': ['cabo verde', 'cape verde'],
  'czechia': ['czechia', 'czech republic'],
};

function normalizeText(text) {
  if (!text) return '';
  return text.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Loại bỏ dấu tiếng Việt/ký tự đặc biệt kiểu Curaçao -> Curacao
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Chỉ giữ lại chữ cái, số, khoảng trắng và dấu gạch ngang
    .replace(/\s+/g, ' ')
    .trim();
}

function getTeamSearchTerms(name) {
  const norm = normalizeText(name);
  if (ALIASES[norm]) {
    return ALIASES[norm];
  }
  return [norm];
}

function matchHighlight(homeName, awayName, titleText) {
  const normTitle = normalizeText(titleText);
  const homeTerms = getTeamSearchTerms(homeName);
  const awayTerms = getTeamSearchTerms(awayName);

  const homeMatches = homeTerms.some(term => normTitle.includes(term));
  const awayMatches = awayTerms.some(term => normTitle.includes(term));

  return homeMatches && awayMatches;
}

// 3. Hàm chính chạy Scraping và Sync
async function main() {
  // Lấy ngày hôm nay theo múi giờ Việt Nam (UTC+7)
  const now = new Date();
  const localTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
  const year = localTime.getUTCFullYear();
  const month = String(localTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localTime.getUTCDate()).padStart(2, '0');
  const todayLocalDateStr = `${year}-${month}-${day}`;

  const startOfToday = `${todayLocalDateStr}T00:00:00+07:00`;
  const endOfToday = `${todayLocalDateStr}T23:59:59+07:00`;

  console.log(`--- [RUN] ${new Date().toISOString()} ---`);
  console.log(`Tìm trận đấu hôm nay (UTC+7): ${todayLocalDateStr}`);
  console.log(`Khoảng thời gian UTC+7: ${startOfToday} -> ${endOfToday}`);

  // Bước A: Truy vấn các trận đấu trong hôm nay có phase = 'FT' và highlight_url null
  const { data: matches, error: fetchError } = await supabase
    .from('wc2026_matches')
    .select('id, home_team_name, away_team_name, kickoff_utc, phase, highlight_url')
    .eq('phase', 'FT')
    .is('highlight_url', null)
    .gte('kickoff_utc', startOfToday)
    .lte('kickoff_utc', endOfToday);

  if (fetchError) {
    console.error('Lỗi khi truy vấn database:', fetchError);
    process.exit(1);
  }

  if (!matches || matches.length === 0) {
    console.log('Xác nhận: Không có trận đấu nào hôm nay đã kết thúc (FT) bị thiếu highlight_url. Dừng script.');
    process.exit(0);
  }

  console.log(`Tìm thấy ${matches.length} trận đấu cần tìm highlight URL:`);
  matches.forEach(m => console.log(`- [ID: ${m.id}] ${m.home_team_name} vs ${m.away_team_name}`));

  // Tự động tìm đường dẫn Chrome hệ thống nếu có (tiện cho chạy local và CI)
  const fs = require('fs');
  function getExecutablePath() {
    if (process.env.GITHUB_ACTIONS || process.env.CI) {
      if (fs.existsSync('/usr/bin/google-chrome')) {
        return '/usr/bin/google-chrome';
      }
      return undefined;
    }
    const winPaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    for (const path of winPaths) {
      if (fs.existsSync(path)) {
        console.log(`[LOCAL] Tìm thấy Chrome tại: ${path}`);
        return path;
      }
    }
    return undefined;
  }

  // Bước B: Khởi chạy Puppeteer để cào trang FIFA Highlights
  console.log('Đang khởi động trình duyệt cào dữ liệu FIFA...');
  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };
  const execPath = getExecutablePath();
  if (execPath) {
    launchOptions.executablePath = execPath;
  }

  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const fifaUrl = 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/highlights';
    console.log(`Đang truy cập: ${fifaUrl}`);
    
    // Tải trang và đợi 10s cho Javascript render các thẻ link của SPA
    await page.goto(fifaUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 10000));

    // Lấy toàn bộ các thẻ link liên quan đến video watch/highlight
    const links = await page.evaluate(() => {
      const results = [];
      const anchors = document.querySelectorAll('a');
      anchors.forEach(a => {
        const href = a.getAttribute('href') || '';
        const text = a.innerText || '';
        const title = a.getAttribute('title') || '';
        const ariaLabel = a.getAttribute('aria-label') || '';

        if (href.includes('/watch/') || href.includes('/highlights/')) {
          results.push({
            href,
            text: text.trim(),
            title: title.trim(),
            ariaLabel: ariaLabel.trim()
          });
        }
      });
      return results;
    });

    console.log(`Đã tìm thấy tổng cộng ${links.length} link watch/highlight trên trang FIFA.`);

    // Bước C: So khớp từng trận đấu và cập nhật vào Supabase
    for (const match of matches) {
      console.log(`Đang tìm kiếm highlight cho trận: ${match.home_team_name} vs ${match.away_team_name}...`);
      
      let matchedLink = null;
      for (const link of links) {
        const searchMetadata = `${link.text} ${link.title} ${link.ariaLabel}`;
        if (matchHighlight(match.home_team_name, match.away_team_name, searchMetadata)) {
          matchedLink = link.href;
          break;
        }
      }

      if (matchedLink) {
        // Đảm bảo URL tuyệt đối
        const absoluteUrl = matchedLink.startsWith('/') 
          ? `https://www.fifa.com${matchedLink}` 
          : matchedLink;

        console.log(`=> Tìm thấy link khớp: ${absoluteUrl}`);

        // Cập nhật vào DB
        const { error: updateError } = await supabase
          .from('wc2026_matches')
          .update({ highlight_url: absoluteUrl, updated_at: new Date().toISOString() })
          .eq('id', match.id);

        if (updateError) {
          console.error(`Lỗi khi cập nhật trận đấu ${match.id}:`, updateError);
        } else {
          console.log(`[SUCCESS] Đã cập nhật highlight_url cho trận ID: ${match.id}`);
        }
      } else {
        console.log(`[WARN] Không tìm thấy link highlight phù hợp trên trang FIFA cho trận này.`);
      }
    }

  } catch (err) {
    console.error('Lỗi trong quá trình chạy scraping:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }

  console.log('Hoàn thành tiến trình đồng bộ.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
