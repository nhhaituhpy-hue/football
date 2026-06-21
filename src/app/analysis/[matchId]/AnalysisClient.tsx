'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Match, MatchPrediction, MatchOdds, OddItem, OddMarket } from '../../../types';
import { useMatchAnalysis } from '../../../data/hooks/use-match-analysis';
import { 
  Calendar, 
  MapPin, 
  Television, 
  CaretLeft, 
  Users, 
  ArrowClockwise, 
  FileText,
  Coins
} from '@phosphor-icons/react';

interface AnalysisClientProps {
  match: Match | null;
  prediction: MatchPrediction | null;
  odds: MatchOdds | null;
}

export default function AnalysisClient({ match: initialMatch, prediction: initialPrediction, odds: initialOdds }: AnalysisClientProps) {
  const matchId = initialMatch?.id || -1;
  const { match, prediction, odds } = useMatchAnalysis(
    matchId,
    initialMatch,
    initialPrediction,
    initialOdds
  );

  const toHongKongOdds = (decimalStr: string | number | null | undefined): string => {
    if (decimalStr === undefined || decimalStr === null) return '-';
    const dec = typeof decimalStr === 'number' ? decimalStr : parseFloat(decimalStr);
    if (isNaN(dec)) return '-';
    const hk = dec - 1;
    return hk >= 0 ? hk.toFixed(2) : '-';
  };

  const findMainOdd = (oddsList: OddItem[]) => {
    if (!Array.isArray(oddsList) || oddsList.length === 0) return null;
    let mainOdd = oddsList[0];
    let minDiff = Infinity;
    for (const o of oddsList) {
      const overVal = parseFloat((o.over || o.home || 2).toString());
      const underVal = parseFloat((o.under || o.away || 2).toString());
      const diff = Math.abs(overVal - 2) + Math.abs(underVal - 2);
      if (diff < minDiff) {
        minDiff = diff;
        mainOdd = o;
      }
    }
    return mainOdd;
  };

  const oddsData = odds?.odds_data || [];
  const spreadMarkets = oddsData.filter((m: OddMarket) =>
    m.name === 'Spread' || m.name === 'Asian Handicap' || m.name === 'Alternative Asian Handicap'
  );
  const allSpreads = spreadMarkets.flatMap((m: OddMarket) => m.odds || []);
  const mainSpread = findMainOdd(allSpreads);

  const totalsMarkets = oddsData.filter((m: OddMarket) =>
    m.name === 'Totals' || m.name === 'Goals Over/Under' || m.name === 'Total Over/Under' || m.name === 'Alternative Goal Line'
  );
  const allTotals = totalsMarkets.flatMap((m: OddMarket) => m.odds || []);
  const mainTotals = findMainOdd(allTotals);


  const lastUpdated = React.useMemo(() => {
    const dates = [
      match?.result?.updated_at,
      prediction?.updated_at
    ].filter(Boolean) as string[];
    
    if (dates.length === 0) return null;
    
    const latestDate = new Date(Math.max(...dates.map(d => new Date(d).getTime())));
    return latestDate.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Ho_Chi_Minh'
    }) + ' ' + latestDate.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Ho_Chi_Minh'
    });
  }, [match?.result?.updated_at, prediction?.updated_at]);

  if (!match) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center p-8 rounded-xl border border-dashed border-card-border/60 bg-card-bg/5">
        <p className="text-lg font-bold">Không tìm thấy trận đấu</p>
        <p className="text-sm text-foreground/60 mt-1">Vui lòng quay lại trang chủ và chọn một trận đấu hợp lệ.</p>
        <Link 
          href="/" 
          className="mt-4 inline-flex items-center gap-1 px-4 py-2 bg-accent-win text-white rounded-lg text-sm font-bold shadow hover:bg-accent-win/90 transition-all"
        >
          <CaretLeft size={16} weight="bold" />
          <span>Quay lại trang chủ</span>
        </Link>
      </div>
    );
  }

  const { home_team, away_team } = match;
  const homeName = home_team?.name_vi || match.home_team_name || 'Chưa xác định';
  const awayName = away_team?.name_vi || match.away_team_name || 'Chưa xác định';
  const homeCode = home_team?.code || match.home_team_code || 'TBD';
  const awayCode = away_team?.code || match.away_team_code || 'TBD';

  const formatMatchHour = (timeStr: string) => {
    try {
      const date = new Date(timeStr);
      return date.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Ho_Chi_Minh'
      });
    } catch {
      return '';
    }
  };

  const formatMatchDate = (timeStr: string) => {
    try {
      const date = new Date(timeStr);
      return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Asia/Ho_Chi_Minh'
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 pb-12 animate-fade-in overflow-x-hidden px-1">
      {/* Breadcrumb & Back button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full min-w-0 gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-foreground/50 truncate">
            <Link href="/" className="hover:text-accent-win transition-colors">Trang chủ</Link>
            <span>/</span>
            <span className="text-foreground/70 font-medium truncate">Nhận định trận đấu</span>
          </div>
          {lastUpdated && (
            <div className="text-[10px] text-foreground/40 font-medium">
              Dữ liệu cập nhật lúc: {lastUpdated}
            </div>
          )}
        </div>
        <Link 
          href="/" 
          className="inline-flex items-center gap-1 text-xs font-bold text-foreground/70 hover:text-accent-win transition-colors px-3 py-1.5 rounded bg-card-bg/40 border border-card-border/60 hover:border-accent-win/35 shadow-sm shrink-0 self-start sm:self-center"
        >
          <CaretLeft size={14} weight="bold" />
          <span>Quay lại bảng lịch đấu</span>
        </Link>
      </div>

      {/* Match Header Panel */}
      <div className="relative w-full rounded-2xl fluent-acrylic border border-card-border overflow-hidden p-4 sm:p-8 shadow-lg">
        {/* Background glow effects */}
        <div className="absolute top-0 left-0 w-1/3 h-full bg-accent-win/5 blur-3xl pointer-events-none rounded-full" />
        <div className="absolute top-0 right-0 w-1/3 h-full bg-sky-500/5 blur-3xl pointer-events-none rounded-full" />

        <div className="grid grid-cols-3 items-center justify-between gap-1 sm:gap-6 relative w-full">
          {/* Home Team */}
          <div className="flex flex-col items-center text-center min-w-0">
            <div className="relative h-12 w-12 sm:h-20 sm:w-20 rounded-xl overflow-hidden border border-card-border shadow-md bg-card-bg/25 mb-2 flex items-center justify-center shrink-0">
              {home_team?.flag_url ? (
                <Image
                  src={home_team.flag_url} 
                  alt={homeName}
                  width={80}
                  height={80}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs sm:text-lg font-bold uppercase">{homeCode}</span>
              )}
            </div>
            <h2 className="text-xs sm:text-base font-extrabold tracking-tight line-clamp-2 h-8 sm:h-12 flex items-center justify-center text-center px-1 break-words w-full" title={homeName}>
              {homeName}
            </h2>
            <span className="text-[9px] sm:text-xs text-foreground/45 uppercase tracking-widest mt-0.5">{homeCode}</span>
          </div>

          {/* Versus / Match details */}
          <div className="flex flex-col items-center px-0.5 sm:px-4 text-center border-x border-card-border/60 py-0 min-w-0 justify-center">
            <div className="px-1.5 py-0.5 rounded bg-accent-win/10 border border-accent-win/20 text-accent-win text-[8px] sm:text-[10px] font-extrabold uppercase tracking-wider mb-1.5 max-w-full truncate">
              {match.round}
            </div>
            {match.result && (match.result.status === 'live' || match.result.status === 'finished') ? (
              <div className="flex flex-col items-center mb-1.5">
                <div className="flex items-center gap-2 text-xl sm:text-3xl font-black tracking-wider leading-none">
                  <span className={match.result.status === 'live' ? 'text-red-400 drop-shadow-[0_0_8px_rgba(255,80,80,0.5)]' : 'text-foreground'}>
                    {match.result.home_score}
                  </span>
                  <span className="text-foreground/30 font-light text-lg sm:text-2xl">:</span>
                  <span className={match.result.status === 'live' ? 'text-red-400 drop-shadow-[0_0_8px_rgba(255,80,80,0.5)]' : 'text-foreground'}>
                    {match.result.away_score}
                  </span>
                </div>
                {match.result.status === 'live' && (
                  <div className="flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md text-[8px] sm:text-[10px] font-bold border bg-red-500/10 text-red-400 live-indicator-pulse border-red-500/20">
                    <span>
                      {match.result.phase === 'HT' ? 'HT' : `${match.result.current_minute || 1}'`}
                    </span>
                  </div>
                )}
                {match.result.status === 'finished' && (
                  <span className="mt-1.5 px-1.5 py-0.5 rounded bg-white/5 text-foreground/60 text-[8px] sm:text-[9px] font-bold uppercase tracking-wider">
                    Hết giờ
                  </span>
                )}
              </div>
            ) : (
              <span className="text-base sm:text-3xl font-black text-foreground/20 italic tracking-wider leading-none mb-1.5">VS</span>
            )}
            <div className="flex flex-col items-center gap-0.5 text-[8px] sm:text-[11px] font-semibold text-foreground/65 max-w-full">
              <div className="flex items-center gap-0.5">
                <Calendar size={11} className="text-accent-win shrink-0" />
                <span className="truncate">{formatMatchHour(match.match_time)}</span>
              </div>
              <span className="text-[7px] sm:text-[9px] text-foreground/45 block truncate">{formatMatchDate(match.match_time)}</span>
            </div>
          </div>

          {/* Away Team */}
          <div className="flex flex-col items-center text-center min-w-0">
            <div className="relative h-12 w-12 sm:h-20 sm:w-20 rounded-xl overflow-hidden border border-card-border shadow-md bg-card-bg/25 mb-2 flex items-center justify-center shrink-0">
              {away_team?.flag_url ? (
                <Image
                  src={away_team.flag_url} 
                  alt={awayName}
                  width={80}
                  height={80}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs sm:text-lg font-bold uppercase">{awayCode}</span>
              )}
            </div>
            <h2 className="text-xs sm:text-base font-extrabold tracking-tight line-clamp-2 h-8 sm:h-12 flex items-center justify-center text-center px-1 break-words w-full" title={awayName}>
              {awayName}
            </h2>
            <span className="text-[9px] sm:text-xs text-foreground/45 uppercase tracking-widest mt-0.5">{awayCode}</span>
          </div>
        </div>

        {/* Stadium & Channel Metadata */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 mt-6 pt-4 border-t border-card-border/40 text-[10px] sm:text-xs text-foreground/50 w-full">
          {match.stadium && (
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin size={14} className="text-accent-win shrink-0" />
              <span className="truncate">Sân vận động: <strong className="text-foreground/75 font-semibold">{match.stadium}</strong></span>
            </div>
          )}
          {match.broadcast_channel && (
            <div className="flex items-center gap-1.5 min-w-0">
              <Television size={14} className="text-emerald-500 shrink-0" />
              <span className="truncate">Phát sóng: <strong className="text-foreground/75 font-semibold">{match.broadcast_channel}</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* TỶ LỆ KÈO CHÂU Á & TÀI XỈU (Hong Kong Odds) */}
      {oddsData && oddsData.length > 0 ? (
        <div className="w-full rounded-xl fluent-acrylic border border-card-border p-5 sm:p-6 space-y-4 shadow-sm overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent-win/5 blur-2xl pointer-events-none rounded-full" />
          
          <h3 className="text-xs sm:text-sm font-extrabold uppercase text-accent-win tracking-wider flex items-center justify-between border-b border-card-border/40 pb-2">
            <div className="flex items-center gap-1.5">
              <Coins size={18} className="shrink-0" />
              <span>Tỷ lệ kèo trực tiếp (Bet365 - Tỷ lệ Hong Kong)</span>
            </div>
            {odds?.updated_at && (
              <span className="text-[9px] text-foreground/45 font-medium lowercase">
                cập nhật: {new Date(odds.updated_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' })}
              </span>
            )}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1 w-full">
            {/* 1. KÈO CHẤP CHÂU Á (Asian Handicap / Spread) */}
            <div className="rounded-xl border border-card-border bg-card-bg/15 p-5 shadow-sm space-y-4 min-w-0">
              <div className="flex items-center justify-between border-b border-card-border/30 pb-2">
                <h4 className="text-xs font-extrabold uppercase text-foreground/75 tracking-wider">
                  Kèo Chấp Châu Á (Spread)
                </h4>
                {mainSpread && (() => {
                  const hdpVal = parseFloat(mainSpread.hdp.toString());
                  return (
                    <span className="px-2 py-0.5 rounded bg-accent-win/10 border border-accent-win/20 text-[9px] font-bold text-accent-win">
                      {hdpVal === 0 ? 'Đồng banh (0)' : `${hdpVal < 0 ? `Chấp -${Math.abs(hdpVal)}` : `Được chấp +${mainSpread.hdp}`}`}
                    </span>
                  );
                })()}
              </div>
              
              {mainSpread ? (() => {
                const hdpVal = parseFloat(mainSpread.hdp.toString());
                const absHdp = Math.abs(hdpVal);
                return (
                  <div className="grid grid-cols-2 gap-4 text-center">
                    {/* Home Odds */}
                    <div className="flex flex-col gap-1 p-3 rounded-lg bg-card-bg/25 border border-card-border/60 hover:border-accent-win/35 transition-all">
                      <span className="text-[9px] font-bold text-foreground/50 uppercase truncate">{homeName}</span>
                      <span className="text-[10px] text-foreground/40 font-semibold">{hdpVal < 0 ? `-${absHdp}` : `+${mainSpread.hdp}`}</span>
                      <span className="text-lg font-black text-accent-win mt-1">{toHongKongOdds(mainSpread.over || mainSpread.home)}</span>
                    </div>
                    {/* Away Odds */}
                    <div className="flex flex-col gap-1 p-3 rounded-lg bg-card-bg/25 border border-card-border/60 hover:border-accent-win/35 transition-all">
                      <span className="text-[9px] font-bold text-foreground/50 uppercase truncate">{awayName}</span>
                      <span className="text-[10px] text-foreground/40 font-semibold">{hdpVal < 0 ? `+${absHdp}` : `-${mainSpread.hdp}`}</span>
                      <span className="text-lg font-black text-accent-win mt-1">{toHongKongOdds(mainSpread.under || mainSpread.away)}</span>
                    </div>
                  </div>
                );
              })() : (
                <p className="text-xs text-foreground/45 italic py-4 text-center">Chưa có kèo chấp chính cho trận đấu này.</p>
              )}
            </div>

            {/* 2. KÈO TÀI XỈU (Totals) */}
            <div className="rounded-xl border border-card-border bg-card-bg/15 p-5 shadow-sm space-y-4 min-w-0">
              <div className="flex items-center justify-between border-b border-card-border/30 pb-2">
                <h4 className="text-xs font-extrabold uppercase text-foreground/75 tracking-wider">
                  Kèo Tài Xỉu (Over/Under)
                </h4>
                {mainTotals && (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-400">
                    Tài Xỉu {mainTotals.hdp}
                  </span>
                )}
              </div>

              {mainTotals ? (
                <div className="grid grid-cols-2 gap-4 text-center">
                  {/* Over Odds */}
                  <div className="flex flex-col gap-1 p-3 rounded-lg bg-card-bg/25 border border-card-border/60 hover:border-accent-win/35 transition-all">
                    <span className="text-[9px] font-bold text-foreground/50 uppercase">Tài (Over)</span>
                    <span className="text-[10px] text-foreground/40 font-semibold">{mainTotals.hdp}</span>
                    <span className="text-lg font-black text-accent-win mt-1">{toHongKongOdds(mainTotals.over)}</span>
                  </div>
                  {/* Under Odds */}
                  <div className="flex flex-col gap-1 p-3 rounded-lg bg-card-bg/25 border border-card-border/60 hover:border-accent-win/35 transition-all">
                    <span className="text-[9px] font-bold text-foreground/50 uppercase">Xỉu (Under)</span>
                    <span className="text-[10px] text-foreground/40 font-semibold">{mainTotals.hdp}</span>
                    <span className="text-lg font-black text-accent-win mt-1">{toHongKongOdds(mainTotals.under)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-foreground/45 italic py-4 text-center">Chưa có kèo tài xỉu chính cho trận đấu này.</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full rounded-xl fluent-acrylic border border-card-border p-5 text-center bg-card-bg/5 shadow-sm text-foreground/50">
          <div className="flex flex-col items-center justify-center py-2">
            <Coins size={28} className="text-foreground/35 mb-2 animate-pulse" />
            <p className="text-xs font-semibold">Tỷ lệ kèo đang được cập nhật...</p>
            <p className="text-[10px] text-foreground/40 mt-0.5">Dữ liệu tỷ lệ kèo tài xỉu và kèo chấp thời gian thực từ nhà cái sẽ hiển thị tại đây.</p>
          </div>
        </div>
      )}

      {/* Intro / Sapo */}

      {prediction?.sapo && (
        <div className="w-full rounded-xl fluent-acrylic border border-card-border bg-accent-win/5 p-4 sm:p-5 text-sm leading-relaxed text-foreground/80 font-medium italic shadow-sm relative break-words">
          <div className="absolute -left-1 top-4 w-1 h-12 bg-accent-win rounded-r" />
          {prediction.sapo}
        </div>
      )}



      {/* 2. PHÂN TÍCH CHUYÊN SÂU (Expert Analysis) */}
      <div className="w-full rounded-xl fluent-acrylic border border-card-border p-5 sm:p-6 space-y-4 shadow-sm overflow-hidden">
        <h3 className="text-xs sm:text-sm font-extrabold uppercase text-accent-win tracking-wider flex items-center gap-1.5 border-b border-card-border/40 pb-2">
          <FileText size={18} className="shrink-0" />
          Phân tích chi tiết từ chuyên gia
        </h3>
        {prediction?.full_analysis ? (
          <div className="text-xs sm:text-sm leading-relaxed text-foreground/80 space-y-4 whitespace-pre-line break-words">
            {prediction.full_analysis}
          </div>
        ) : (
          <div className="text-center py-8 border border-dashed border-card-border/60 bg-card-bg/5 rounded-xl text-foreground/50 w-full">
            <p className="text-xs font-medium">Đang cập nhật phân tích chi tiết cho trận đấu này.</p>
            <p className="text-[10px] text-foreground/40 mt-1">Thông tin chi tiết từ các chuyên gia sẽ được cập nhật sớm nhất.</p>
          </div>
        )}
      </div>

      {/* 3. TÌNH HÌNH LỰC LƯỢNG (Squads / Force) */}
      <div className="w-full rounded-xl fluent-acrylic border border-card-border p-5 sm:p-6 space-y-4 shadow-sm overflow-hidden">
        <h3 className="text-xs sm:text-sm font-extrabold uppercase text-accent-win tracking-wider flex items-center gap-1.5 border-b border-card-border/40 pb-2">
          <Users size={18} className="shrink-0" />
          Tình hình lực lượng & Đội hình dự kiến
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full pt-1">
          {/* Home force */}
          <div className="rounded-xl border border-card-border bg-card-bg/10 p-5 shadow-sm space-y-3 min-w-0">
            <div className="flex items-center gap-2 border-b border-card-border/30 pb-2">
              <div className="relative h-6 w-6 rounded-sm overflow-hidden border border-card-border shrink-0">
                {home_team?.flag_url && (
                  <Image src={home_team.flag_url} alt={homeName} fill className="object-cover" />
                )}
              </div>
              <h4 className="text-xs font-extrabold uppercase text-foreground/75 tracking-wider truncate">{homeName}</h4>
            </div>
            {prediction?.force_info?.home ? (
              <div className="text-xs sm:text-sm leading-relaxed text-foreground/85 whitespace-pre-line break-words">
                {prediction.force_info.home}
              </div>
            ) : (
              <p className="text-xs text-foreground/45 italic">Chưa có cập nhật lực lượng của {homeName}.</p>
            )}
          </div>

          {/* Away force */}
          <div className="rounded-xl border border-card-border bg-card-bg/10 p-5 shadow-sm space-y-3 min-w-0">
            <div className="flex items-center gap-2 border-b border-card-border/30 pb-2">
              <div className="relative h-6 w-6 rounded-sm overflow-hidden border border-card-border shrink-0">
                {away_team?.flag_url && (
                  <Image src={away_team.flag_url} alt={awayName} fill className="object-cover" />
                )}
              </div>
              <h4 className="text-xs font-extrabold uppercase text-foreground/75 tracking-wider truncate">{awayName}</h4>
            </div>
            {prediction?.force_info?.away ? (
              <div className="text-xs sm:text-sm leading-relaxed text-foreground/85 whitespace-pre-line break-words">
                {prediction.force_info.away}
              </div>
            ) : (
              <p className="text-xs text-foreground/45 italic">Chưa có cập nhật lực lượng của {awayName}.</p>
            )}
          </div>
        </div>
      </div>

      {/* 4. PHONG ĐỘ & ĐỐI ĐẦU (Form & H2H) */}
      <div className="w-full rounded-xl fluent-acrylic border border-card-border p-5 sm:p-6 space-y-5 shadow-sm overflow-hidden">
        <h3 className="text-xs sm:text-sm font-extrabold uppercase text-accent-win tracking-wider flex items-center gap-1.5 border-b border-card-border/40 pb-2">
          <ArrowClockwise size={18} className="shrink-0" />
          Phong độ & Lịch sử đối đầu
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full pt-1">
          {/* Home Form */}
          <div className="rounded-xl border border-card-border bg-card-bg/10 p-5 shadow-sm space-y-3 min-w-0">
            <div className="flex items-center gap-2 border-b border-card-border/30 pb-2">
              <div className="relative h-6 w-6 rounded-sm overflow-hidden border border-card-border shrink-0">
                {home_team?.flag_url && (
                  <Image src={home_team.flag_url} alt={homeName} fill className="object-cover" />
                )}
              </div>
              <h4 className="text-xs font-extrabold uppercase text-foreground/75 tracking-wider truncate">Phong độ {homeName}</h4>
            </div>
            {prediction?.form_info?.home ? (
              <div className="text-xs sm:text-sm leading-relaxed text-foreground/85 whitespace-pre-line break-words">
                {prediction.form_info.home}
              </div>
            ) : (
              <p className="text-xs text-foreground/45 italic">Chưa có thông tin phong độ.</p>
            )}
          </div>

          {/* Away Form */}
          <div className="rounded-xl border border-card-border bg-card-bg/10 p-5 shadow-sm space-y-3 min-w-0">
            <div className="flex items-center gap-2 border-b border-card-border/30 pb-2">
              <div className="relative h-6 w-6 rounded-sm overflow-hidden border border-card-border shrink-0">
                {away_team?.flag_url && (
                  <Image src={away_team.flag_url} alt={awayName} fill className="object-cover" />
                )}
              </div>
              <h4 className="text-xs font-extrabold uppercase text-foreground/75 tracking-wider truncate">Phong độ {awayName}</h4>
            </div>
            {prediction?.form_info?.away ? (
              <div className="text-xs sm:text-sm leading-relaxed text-foreground/85 whitespace-pre-line break-words">
                {prediction.form_info.away}
              </div>
            ) : (
              <p className="text-xs text-foreground/45 italic">Chưa có thông tin phong độ.</p>
            )}
          </div>
        </div>

        {/* H2H text block */}
        {prediction?.form_info?.h2h && (
          <div className="rounded-xl border border-card-border bg-card-bg/10 p-5 shadow-sm space-y-3 w-full">
            <h4 className="text-[11px] font-extrabold uppercase text-accent-win tracking-wider border-b border-card-border/30 pb-2">
              Lịch sử đối đầu
            </h4>
            <p className="text-xs sm:text-sm leading-relaxed text-foreground/85 break-words whitespace-pre-line">
              {prediction.form_info.h2h}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
