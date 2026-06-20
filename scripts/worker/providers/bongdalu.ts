import { CACHE_TTL_SECONDS, USER_AGENTS } from '../config';
import { removeNeutralSuffix } from '../utils';

export function parseJsArrayLiteral(str: string): any[] | null {
  const tokens: any[] = [];
  let i = 0;
  while (i < str.length) {
    const char = str[i];
    if (char === '[' || char === ']' || char === ',') {
      tokens.push(char);
      i++;
    } else if (char === "'" || char === '"') {
      const quote = char;
      let val = '';
      i++;
      while (i < str.length && str[i] !== quote) {
        if (str[i] === '\\') {
          val += str[i + 1];
          i += 2;
        } else {
          val += str[i];
          i++;
        }
      }
      tokens.push({ type: 'string', value: val });
      i++; 
    } else if (/\s/.test(char)) {
      i++; 
    } else {
      let val = '';
      while (i < str.length && str[i] !== ',' && str[i] !== ']' && str[i] !== '[' && !/\s/.test(str[i])) {
        val += str[i];
        i++;
      }
      if (val === 'true' || val === 'True') {
        tokens.push(true);
      } else if (val === 'false' || val === 'False') {
        tokens.push(false);
      } else if (val === 'null') {
        tokens.push(null);
      } else if (val === '') {
        // empty
      } else if (!isNaN(Number(val))) {
        tokens.push(Number(val));
      } else {
        tokens.push(val); 
      }
    }
  }

  if (tokens[0] !== '[') return null;
  const result: any[] = [];
  let expectedValue = true; 
  
  for (let t = 1; t < tokens.length - 1; t++) {
    const tok = tokens[t];
    if (tok === ',') {
      if (expectedValue) {
        result.push(null);
      }
      expectedValue = true;
    } else if (tok === ']') {
      break;
    } else {
      const val = (tok && typeof tok === 'object' && tok.type === 'string') ? tok.value : tok;
      result.push(val);
      expectedValue = false;
    }
  }
  if (expectedValue && result.length > 0 && tokens[tokens.length - 2] === ',') {
    result.push(null);
  }
  return result;
}

export function parseBongdaluJs(jsText: string): { A: any[]; B: any[]; C: any[]; matchcount: number; sclasscount: number; lastCreateTime_bfIndex: string } {
  const A: any[] = [];
  const B: any[] = [];
  const C: any[] = [];
  let matchcount = 0;
  let sclasscount = 0;
  let lastCreateTime_bfIndex = '';

  const worldCupBIndices = new Set<number>();
  const aCandidates: string[] = [];

  let pos = 0;
  while (pos < jsText.length) {
    let nextNL = jsText.indexOf('\n', pos);
    if (nextNL === -1) nextNL = jsText.length;

    // Fast check: Skip leading spaces if any
    let start = pos;
    while (start < nextNL && (jsText[start] === ' ' || jsText[start] === '\t' || jsText[start] === '\r')) {
      start++;
    }

    if (start < nextNL) {
      const char = jsText[start];
      if (char === 'A' && jsText[start + 1] === '[') {
        aCandidates.push(jsText.substring(start, nextNL));
      } else if (char === 'B' && jsText[start + 1] === '[') {
        const line = jsText.substring(start, nextNL);
        const lineLower = line.toLowerCase();
        if (lineLower.includes('world cup') || lineLower.includes('worldcup')) {
          const closeIdx = line.indexOf(']');
          if (closeIdx !== -1) {
            const idx = parseInt(line.substring(2, closeIdx), 10);
            const eqIdx = line.indexOf('=', closeIdx);
            if (eqIdx !== -1) {
              let arrStr = line.substring(eqIdx + 1).trim();
              if (arrStr.endsWith(';')) arrStr = arrStr.slice(0, -1);
              B[idx] = parseJsArrayLiteral(arrStr);
              worldCupBIndices.add(idx);
            }
          }
        }
      } else if (char === 'v') {
        const line = jsText.substring(start, nextNL);
        if (line.startsWith('var matchcount')) {
          const eqIdx = line.indexOf('=');
          if (eqIdx !== -1) {
            let valStr = line.substring(eqIdx + 1).trim();
            if (valStr.endsWith(';')) valStr = valStr.slice(0, -1);
            matchcount = parseInt(valStr, 10);
          }
        } else if (line.startsWith('var sclasscount')) {
          const eqIdx = line.indexOf('=');
          if (eqIdx !== -1) {
            let valStr = line.substring(eqIdx + 1).trim();
            if (valStr.endsWith(';')) valStr = valStr.slice(0, -1);
            sclasscount = parseInt(valStr, 10);
          }
        } else if (line.startsWith('var lastCreateTime_bfIndex')) {
          const eqIdx = line.indexOf('=');
          if (eqIdx !== -1) {
            let valStr = line.substring(eqIdx + 1).trim();
            if (valStr.endsWith(';')) valStr = valStr.slice(0, -1);
            if (valStr.startsWith('"') || valStr.startsWith("'")) {
              lastCreateTime_bfIndex = valStr.slice(1, -1);
            } else {
              lastCreateTime_bfIndex = valStr;
            }
          }
        }
      }
    }
    pos = nextNL + 1;
  }

  // Parse only A matches that belong to World Cup leagues
  for (let i = 0; i < aCandidates.length; i++) {
    const line = aCandidates[i];
    const eqIdx = line.indexOf('=[');
    if (eqIdx !== -1) {
      const content = line.substring(eqIdx + 2);
      const commaIdx = content.indexOf(',');
      if (commaIdx !== -1) {
        const nextCommaIdx = content.indexOf(',', commaIdx + 1);
        if (nextCommaIdx !== -1) {
          const leagueIdStr = content.substring(commaIdx + 1, nextCommaIdx).trim();
          const leagueIdx = parseInt(leagueIdStr, 10);
          if (worldCupBIndices.has(leagueIdx)) {
            const closeIdx = line.indexOf(']');
            if (closeIdx !== -1) {
              const idx = parseInt(line.substring(2, closeIdx), 10);
              let arrStr = line.substring(eqIdx + 1).trim();
              if (arrStr.endsWith(';')) arrStr = arrStr.slice(0, -1);
              A[idx] = parseJsArrayLiteral(arrStr);
            }
          }
        }
      }
    }
  }

  return { A, B, C, matchcount, sclasscount, lastCreateTime_bfIndex };
}

export async function fetchBongdaluLive(env: any): Promise<any[]> {
  const url = env.BONGDALU_LIVE_URL || "https://free.bongdalu.group/gf/data/bf_vn_nt.js";
  const randomUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  const response = await fetch(url, {
    headers: {
      'User-Agent': randomUserAgent,
      'Accept': '*/*',
      'Referer': 'https://free.bongdalu.group/free/freesoccer',
    },
    cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
  } as any);

  if (!response.ok) {
    throw new Error(`Bongdalu returned HTTP ${response.status}`);
  }

  const jsText = await response.text();
  const parsed = parseBongdaluJs(jsText);
  const { A, B } = parsed;

  const matches: any[] = [];
  for (let i = 1; i < A.length; i++) {
    const match = A[i];
    if (!match) continue;

    const leagueInfo = B[match[1]];
    if (!leagueInfo) continue;

    const leagueId = leagueInfo[0];
    const leagueNameEn = leagueInfo[1] || '';
    const leagueNameVi = leagueInfo[8] || '';

    const isWorldCup = 
      leagueId === 75 || 
      leagueNameEn.toLowerCase().includes('world cup') || 
      leagueNameVi.toLowerCase().includes('world cup');

    if (!isWorldCup) continue;

    const homeName = removeNeutralSuffix(match[4]);
    const awayName = removeNeutralSuffix(match[5]);

    const bongdaluStatus = match[8];
    let status = 'scheduled';
    let phase = null;
    let minute = null;
    let isHt = false;

    if (bongdaluStatus === 0) {
      status = 'scheduled';
    } else if (bongdaluStatus === -1) {
      status = 'finished';
      phase = 'FT';
      minute = 90;
    } else if (bongdaluStatus > 0) {
      status = 'live';
      isHt = bongdaluStatus === 2;

      // Mapping phase từ status code Bongdalu (đã xác nhận từ dữ liệu live):
      // 1=Hiệp 1, 2=Nghỉ giữa hiệp, 3=Hiệp 2, 4=Hiệp phụ, 5=Penalty
      if (bongdaluStatus === 1) {
        phase = '1H';
      } else if (bongdaluStatus === 2) {
        phase = 'HT';
        minute = 45;
      } else if (bongdaluStatus === 3) {
        phase = '2H';
      } else if (bongdaluStatus === 4) {
        phase = 'ET';
      } else if (bongdaluStatus === 5) {
        phase = 'PEN';
      } else {
        phase = '1H';
      }
    } else {
      // Các trạng thái âm (ngoài -1 đã xử lý ở trên)
      if (bongdaluStatus === -10) {
        status = 'cancelled';
      } else if (bongdaluStatus === -11) {
        status = 'scheduled'; // To be determined
      } else if (bongdaluStatus === -12 || bongdaluStatus === -14) {
        status = 'postponed';
      } else if (bongdaluStatus === -13) {
        status = 'cancelled'; // Interrupted
      } else {
        status = 'scheduled';
      }
    }

    const homeScore = match[9] !== null && match[9] !== undefined ? Number(match[9]) : null;
    const awayScore = match[10] !== null && match[10] !== undefined ? Number(match[10]) : null;

    matches.push({
      homeName,
      awayName,
      homeScore,
      awayScore,
      status,
      phase,
      minute,
      isHt,
      // match[7] = thời gian bắt đầu giai đoạn hiện tại từ Bongdalu
      bongdaluPeriodStart: match[7] || null,
      redCards: {
        home: Number(match[13]) || 0,
        away: Number(match[14]) || 0
      },
      yellowCards: {
        home: Number(match[15]) || 0,
        away: Number(match[16]) || 0
      }
    });
  }

  return matches;
}
