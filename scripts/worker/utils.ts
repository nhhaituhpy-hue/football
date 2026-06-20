import { ALLOWED_ORIGINS, JSON_HEADERS } from './config';

export function getCorsOrigin(request: Request): string | null {
  const origin = request.headers.get('Origin') || '';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  return null;
}

export function makeCorsHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  const corsOrigin = getCorsOrigin(request);
  if (corsOrigin) {
    headers['Access-Control-Allow-Origin'] = corsOrigin;
  }
  return headers;
}

export function json(payload: any, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

export function jsonCors(request: Request, payload: any, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: makeCorsHeaders(request) });
}

export function getVietnamYMD(kickoffUtc: string | Date): string {
  const matchDate = new Date(kickoffUtc);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(matchDate);
  const year = parts.find(p => p.type === 'year')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';
  return `${year}-${month}-${day}`;
}

export function parseUtcDate(str: string): Date | null {
  if (!str) return null;
  const parts = str.match(/(\d+)-(\d+)-(\d+)\s+(\d+):(\d+):(\d+)/);
  if (!parts) return new Date(str);
  return new Date(Date.UTC(
    parseInt(parts[1], 10),
    parseInt(parts[2], 10) - 1,
    parseInt(parts[3], 10),
    parseInt(parts[4], 10),
    parseInt(parts[5], 10),
    parseInt(parts[6], 10)
  ));
}

export function cleanName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/&amp;/g, '')
    .replace(/amp/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove Vietnamese accents
    .replace(/[^a-z0-9]/g, '')       // Keep only alphanumeric characters
    .trim();
}

export function removeNeutralSuffix(name: string): string {
  if (!name) return '';
  return name.replace(/<font[^>]*>\s*\(N\)\s*<\/font>/gi, '')
             .replace(/\s*\(N\)\s*$/gi, '')
             .replace(/<[^>]*>/g, '')
             .trim();
}
