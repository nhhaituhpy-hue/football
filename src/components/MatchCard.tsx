'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { Match, MatchEvent } from '../types';
import { fetchMatchEvents } from '../lib/dataManager';
import { SoccerBall, Television, Calendar, MapPin } from '@phosphor-icons/react';

interface MatchCardProps {
  match: Match;
  isLiveWidget?: boolean;
  homeTeamStanding?: string;
  awayTeamStanding?: string;
}

export default function MatchCard({ match, isLiveWidget = false, homeTeamStanding, awayTeamStanding }: MatchCardProps) {
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [showEvents, setShowEvents] = useState(true);
  const { result, home_team, away_team } = match;
  const homeCode = home_team?.code || match.home_team_code || 'TBD';
  const awayCode = away_team?.code || match.away_team_code || 'TBD';
  const homeName = home_team?.name_vi || match.home_team_name || 'Chưa xác định';
  const awayName = away_team?.name_vi || match.away_team_name || 'Chưa xác định';
  const isLive = result?.status === 'live';
  const isFinished = result?.status === 'finished';
  const isScheduled = result?.status === 'scheduled' || !result;

  // Tải danh sách sự kiện (bàn thắng, thẻ đỏ) của trận đấu
  useEffect(() => {
    let active = true;

    async function loadEvents() {
      const nextEvents = isScheduled ? [] : await fetchMatchEvents(match.id);
      if (active) setEvents(nextEvents);
    }

    loadEvents();
    return () => {
      active = false;
    };
  }, [match.id, result?.status, result?.home_score, result?.away_score, isScheduled]);

  // Format giờ thi đấu sang giờ Việt Nam (GMT+7)
  const formatMatchTime = (timeStr: string) => {
    try {
      const date = new Date(timeStr);
      return date.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Ho_Chi_Minh'
      }) + ' - ' + date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'Asia/Ho_Chi_Minh'
      });
    } catch {
      return timeStr;
    }
  };

  // Lọc sự kiện bàn thắng và thẻ đỏ, bỏ qua thay người (substitution)
  const homeEvents = events.filter(e => e.is_home_team && e.event_type !== 'substitution');
  const awayEvents = events.filter(e => !e.is_home_team && e.event_type !== 'substitution');

  // Render danh sách sự kiện cầu thủ
  const renderEventsList = (teamEvents: MatchEvent[]) => {
    return teamEvents.map((event) => {
      let icon = '⚽';
      if (event.event_type === 'card_yellow') icon = '🟨';
      if (event.event_type === 'card_red') icon = '🟥';
      if (event.event_type === 'penalty_shootout') icon = '🎯';
      if (event.event_type === 'substitution') icon = '🔄';
      if (event.event_type === 'var') icon = '🔍';

      return (
        <div key={event.id} className="flex items-center gap-1 text-[11px] text-foreground/70">
          <span>{icon}</span>
          <span className="font-medium">{event.player_name}</span>
          <span className="text-foreground/50">({event.minute}&apos;)</span>
          {event.detail && <span className="text-[10px] text-foreground/40 italic"> - {event.detail}</span>}
        </div>
      );
    });
  };

  return (
    <div 
      className={`relative rounded-xl fluent-acrylic border transition-all duration-300 ${
        isLive 
          ? 'border-red-500/30 bg-red-500/5 shadow-md shadow-red-500/5' 
          : 'border-card-border bg-card-bg/40'
      } ${isLiveWidget ? 'p-6' : 'p-4 fluent-card-hover'}`}
    >
      {/* Kênh phát sóng & Vòng đấu */}
      <div className="flex justify-between items-center mb-3">
        <span className="text-[11px] font-semibold text-accent-win tracking-wider uppercase">
          {match.round}
        </span>
        {match.broadcast_channel && (
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-accent-win/10 text-accent-win border border-accent-win/20">
            <Television size={12} weight="bold" />
            <span>{match.broadcast_channel}</span>
          </div>
        )}
      </div>

      {/* Thông tin 2 đội & Tỷ số */}
      <div className="flex items-center justify-between gap-2 py-2">
        {/* Đội nhà */}
        <div className="flex-1 flex flex-col items-center text-center">
          <div className="relative h-12 w-12 sm:h-14 sm:w-14 rounded-lg overflow-hidden border border-card-border shadow-sm mb-2 bg-card-bg/20">
            {home_team?.flag_url ? (
              <Image
                src={home_team.flag_url} 
                alt={home_team.name_vi}
                width={56}
                height={56}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500/20 to-sky-500/20 text-indigo-400 font-bold text-xs sm:text-sm uppercase select-none">
                {homeCode.slice(0, 4)}
              </div>
            )}
          </div>
          <div className="flex items-center justify-center gap-1 max-w-full">
            <span className="text-xs sm:text-sm font-semibold truncate max-w-[70px] sm:max-w-[100px]" title={homeName}>
              {homeName}
            </span>
            {homeTeamStanding && (
              <span className="text-[9px] font-extrabold text-accent-win bg-accent-win/10 border border-accent-win/15 px-1 rounded-sm select-none" title={`Thứ hạng hiện tại: Bảng ${homeTeamStanding.split('-')[0]}, hạng ${homeTeamStanding.split('-')[1]}`}>
                {homeTeamStanding}
              </span>
            )}
          </div>
          <span className="text-[10px] text-foreground/45 uppercase tracking-wider">
            {homeCode}
          </span>
        </div>

        {/* Tỷ số và trạng thái */}
        <div className="flex flex-col items-center px-2 min-w-[80px]">
          {isScheduled ? (
            <div className="flex flex-col items-center">
              <span className="text-xs font-semibold text-foreground/80 mb-1">VS</span>
              <div className="flex items-center gap-1 text-[10px] text-foreground/50 font-medium">
                <Calendar size={12} />
                <span>{formatMatchTime(match.match_time)}</span>
              </div>
            </div>
          ) : (
            <button 
              onClick={() => setShowEvents(!showEvents)}
              className="flex flex-col items-center group/score cursor-pointer select-none transition-transform active:scale-95 border-0 bg-transparent p-0"
              title={showEvents ? "Click để ẩn diễn biến" : "Click để xem diễn biến"}
            >
              {/* Tỷ số chính */}
              <div className="flex items-center justify-center gap-3 text-2xl sm:text-3xl font-extrabold tracking-tight group-hover/score:text-accent-win transition-colors">
                <span className={isLive ? 'text-red-500' : ''}>{result.home_score}</span>
                <span className="text-foreground/30 font-light group-hover/score:text-accent-win/55">:</span>
                <span className={isLive ? 'text-red-500' : ''}>{result.away_score}</span>
              </div>

              {/* Hiệp phụ / Penalty */}
              {(result.home_extra_score > 0 || result.away_extra_score > 0 || result.home_pen_score > 0 || result.away_pen_score > 0) && (
                <div className="text-[10px] text-foreground/60 font-semibold mt-1">
                  {result.home_pen_score > 0 || result.away_pen_score > 0 ? (
                    <span className="text-emerald-500 font-bold">
                      PEN ({result.home_pen_score}-{result.away_pen_score})
                    </span>
                  ) : (
                    <span>Hiệp phụ</span>
                  )}
                </div>
              )}

              {/* Trạng thái Phút thi đấu */}
              {isLive && (
                <div className={`flex items-center gap-1 mt-2 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                  result.phase === 'HT'
                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                    : 'bg-red-500/10 text-red-500 live-indicator-pulse border-red-500/20'
                }`}>
                  <SoccerBall size={10} className={result.phase === 'HT' ? '' : 'animate-spin-slow'} />
                  <span>{result.phase === 'HT' ? 'HT' : `PHÚT ${result.current_minute}'`}</span>
                </div>
              )}

              {isFinished && (
                <span className="mt-2 px-2 py-0.5 rounded bg-foreground/10 text-foreground/60 text-[9px] font-bold uppercase tracking-wider group-hover/score:bg-accent-win/10 group-hover/score:text-accent-win group-hover/score:border-accent-win/20 border border-transparent transition-colors">
                  Hết giờ
                </span>
              )}

              {/* Small toggle indicator */}
              <span className="text-[8px] text-foreground/30 font-bold tracking-wider mt-1.5 group-hover/score:text-accent-win transition-colors uppercase select-none">
                {showEvents ? 'Ẩn chi tiết' : 'Xem chi tiết'}
              </span>
            </button>
          )}
        </div>

        {/* Đội khách */}
        <div className="flex-1 flex flex-col items-center text-center">
          <div className="relative h-12 w-12 sm:h-14 sm:w-14 rounded-lg overflow-hidden border border-card-border shadow-sm mb-2 bg-card-bg/20">
            {away_team?.flag_url ? (
              <Image
                src={away_team.flag_url} 
                alt={away_team.name_vi}
                width={56}
                height={56}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500/20 to-sky-500/20 text-indigo-400 font-bold text-xs sm:text-sm uppercase select-none">
                {awayCode.slice(0, 4)}
              </div>
            )}
          </div>
          <div className="flex items-center justify-center gap-1 max-w-full">
            <span className="text-xs sm:text-sm font-semibold truncate max-w-[70px] sm:max-w-[100px]" title={awayName}>
              {awayName}
            </span>
            {awayTeamStanding && (
              <span className="text-[9px] font-extrabold text-accent-win bg-accent-win/10 border border-accent-win/15 px-1 rounded-sm select-none" title={`Thứ hạng hiện tại: Bảng ${awayTeamStanding.split('-')[0]}, hạng ${awayTeamStanding.split('-')[1]}`}>
                {awayTeamStanding}
              </span>
            )}
          </div>
          <span className="text-[10px] text-foreground/45 uppercase tracking-wider">
            {awayCode}
          </span>
        </div>
      </div>

      {/* Sân vận động */}
      {match.stadium && !isLiveWidget && (
        <div className="flex items-center gap-1 mt-3 pt-2 border-t border-card-border/40 text-[10px] text-foreground/40">
          <MapPin size={10} />
          <span className="truncate max-w-full">{match.stadium}</span>
        </div>
      )}

      {/* Danh sách cầu thủ ghi bàn / Sự kiện (Hiển thị khi trận đấu đang đá hoặc đã kết thúc) */}
      {!isScheduled && showEvents && (homeEvents.length > 0 || awayEvents.length > 0) && (
        <div className="grid grid-cols-2 gap-4 mt-3 pt-2 border-t border-card-border/40 text-left bg-black/5 dark:bg-white/5 rounded-lg p-2 transition-all duration-300">
          {/* Cầu thủ ghi bàn Đội nhà */}
          <div className="space-y-1 border-r border-card-border/20 pr-2">
            {renderEventsList(homeEvents)}
          </div>
          {/* Cầu thủ ghi bàn Đội khách */}
          <div className="space-y-1 pl-1">
            {renderEventsList(awayEvents)}
          </div>
        </div>
      )}
    </div>
  );
}
