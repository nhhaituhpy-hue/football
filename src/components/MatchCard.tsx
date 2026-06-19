'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
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
  const [elapsedTime, setElapsedTime] = useState<string>('');
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
      // Nếu đã có sẵn sự kiện trong đối tượng trận đấu (ví dụ: trận trực tiếp đã tải mảng events), sử dụng trực tiếp
      if (match.events) {
        if (active) setEvents(match.events);
        return;
      }

      const nextEvents = isScheduled ? [] : await fetchMatchEvents(match.id);
      if (active) setEvents(nextEvents);
    };

    loadEvents();
    return () => {
      active = false;
    };
  }, [match.id, result?.status, result?.home_score, result?.away_score, isScheduled, match.events]);

  // Realtime clock running second-by-second on client side
  useEffect(() => {
    if (!isLive || !result) {
      setElapsedTime('');
      return;
    }

    const updateClock = () => {
      // 1. HT (Halftime)
      if (result.phase === 'HT') {
        setElapsedTime('HT');
        return;
      }

      // 2. Penalty shootout (PEN)
      if (result.phase === 'PEN' || result.home_pen_score > 0 || result.away_pen_score > 0) {
        setElapsedTime(`PEN (${result.home_pen_score}-${result.away_pen_score})`);
        return;
      }

      // 3. Regular time / Extra time
      const lastMinute = result.current_minute || 1;
      const lastUpdate = new Date(result.updated_at).getTime();
      
      const diffMs = Date.now() - lastUpdate;
      const totalSeconds = Math.max(0, (lastMinute - 1) * 60 + Math.floor(diffMs / 1000));
      
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      
      // Limit to 120' for Extra Time, 90' for Regular Time
      const maxMinutes = result.phase === 'ET' ? 120 : 90;
      
      if (minutes >= maxMinutes) {
        setElapsedTime(`${maxMinutes}:00+`);
      } else {
        const formattedMin = String(minutes).padStart(2, '0');
        const formattedSec = String(seconds).padStart(2, '0');
        setElapsedTime(`${formattedMin}:${formattedSec}`);
      }
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    
    return () => clearInterval(interval);
  }, [isLive, result?.current_minute, result?.updated_at, result?.phase, result?.home_pen_score, result?.away_pen_score]);

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
      className={`relative liquid-glass transition-all duration-300 ${
        isLive 
          ? 'liquid-glass-live' 
          : ''
      } ${isLiveWidget ? 'p-6' : 'p-4 liquid-glass-hover'}`}
    >
      {/* Kênh phát sóng & Vòng đấu */}
      <div className="flex justify-between items-center mb-3">
        <span className="text-[11px] font-semibold text-blue-400 tracking-wider uppercase">
          {match.round}
        </span>
        {match.broadcast_channel && (
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/20">
            <Television size={12} weight="bold" />
            <span>{match.broadcast_channel}</span>
          </div>
        )}
      </div>

      {/* Thông tin 2 đội & Tỷ số */}
      <div className="flex items-center justify-between gap-2 py-2">
        {/* Đội nhà */}
        <div className="flex-1 flex flex-col items-center text-center">
          <div className="relative h-12 w-12 sm:h-14 sm:w-14 rounded-lg overflow-hidden border border-white/10 shadow-sm mb-2 bg-white/5">
            {home_team?.flag_url ? (
              <Image
                src={home_team.flag_url} 
                alt={home_team.name_vi}
                width={56}
                height={56}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500/20 to-purple-500/20 text-blue-400 font-bold text-xs sm:text-sm uppercase select-none">
                {homeCode.slice(0, 4)}
              </div>
            )}
          </div>
          <div className="flex items-center justify-center gap-1 max-w-full">
            <span className="text-xs sm:text-sm font-semibold truncate max-w-[70px] sm:max-w-[100px]" title={homeName}>
              {homeName}
            </span>
            {homeTeamStanding && (
              <span className="text-[9px] font-extrabold text-blue-400 bg-blue-500/10 border border-blue-500/15 px-1 rounded-sm select-none" title={`Thứ hạng hiện tại: Bảng ${homeTeamStanding.split('-')[0]}, hạng ${homeTeamStanding.split('-')[1]}`}>
                {homeTeamStanding}
              </span>
            )}
          </div>
          <span className="text-[10px] text-foreground/45 uppercase tracking-wider">
            {homeCode}
          </span>
        </div>

        {/* Tỷ số và trạng thái - LIQUID GLASS 3D */}
        <div className="flex flex-col items-center px-2 min-w-[80px]">
          {isScheduled ? (
            <div className="flex flex-col items-center">
              <div className="score-glass-3d px-5 py-2.5">
                <span className="text-sm font-bold text-foreground/80 relative z-10">VS</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-foreground/50 font-medium mt-2">
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
              {/* Tỷ số chính - 3D Glass */}
              <div className="score-glass-3d px-5 py-2.5 group-hover/score:scale-105 transition-transform duration-300">
                <div className="flex items-center justify-center gap-3 text-2xl sm:text-3xl font-extrabold tracking-tight relative z-10">
                  <span className={isLive ? 'text-red-400 drop-shadow-[0_0_8px_rgba(255,80,80,0.5)]' : 'text-foreground'}>{result.home_score}</span>
                  <span className="text-foreground/30 font-light text-xl">:</span>
                  <span className={isLive ? 'text-red-400 drop-shadow-[0_0_8px_rgba(255,80,80,0.5)]' : 'text-foreground'}>{result.away_score}</span>
                </div>
              </div>

              {/* Hiệp phụ / Penalty */}
              {(result.home_extra_score > 0 || result.away_extra_score > 0 || result.home_pen_score > 0 || result.away_pen_score > 0) && (
                <div className="text-[10px] text-foreground/60 font-semibold mt-1">
                  {result.home_pen_score > 0 || result.away_pen_score > 0 ? (
                    <span className="text-emerald-400 font-bold">
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
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-red-500/10 text-red-400 live-indicator-pulse border-red-500/20'
                }`}>
                  <SoccerBall size={10} className={result.phase === 'HT' ? '' : 'animate-spin-slow'} />
                  <span>{elapsedTime ? (elapsedTime.includes('PEN') || elapsedTime === 'HT' ? elapsedTime : `PHÚT ${elapsedTime}`) : (result.phase === 'HT' ? 'HT' : `PHÚT ${result.current_minute}'`)}</span>
                </div>
              )}

              {isFinished && (
                <span className="mt-2 px-2 py-0.5 rounded bg-white/5 text-foreground/60 text-[9px] font-bold uppercase tracking-wider group-hover/score:bg-blue-500/10 group-hover/score:text-blue-400 border border-white/5 transition-colors">
                  Hết giờ
                </span>
              )}

              {/* Small toggle indicator */}
              <span className="text-[8px] text-foreground/30 font-bold tracking-wider mt-1.5 group-hover/score:text-blue-400 transition-colors uppercase select-none">
                {showEvents ? 'Ẩn chi tiết' : 'Xem chi tiết'}
              </span>
            </button>
          )}
        </div>

        {/* Đội khách */}
        <div className="flex-1 flex flex-col items-center text-center">
          <div className="relative h-12 w-12 sm:h-14 sm:w-14 rounded-lg overflow-hidden border border-white/10 shadow-sm mb-2 bg-white/5">
            {away_team?.flag_url ? (
              <Image
                src={away_team.flag_url} 
                alt={away_team.name_vi}
                width={56}
                height={56}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-500/20 to-purple-500/20 text-red-400 font-bold text-xs sm:text-sm uppercase select-none">
                {awayCode.slice(0, 4)}
              </div>
            )}
          </div>
          <div className="flex items-center justify-center gap-1 max-w-full">
            <span className="text-xs sm:text-sm font-semibold truncate max-w-[70px] sm:max-w-[100px]" title={awayName}>
              {awayName}
            </span>
            {awayTeamStanding && (
              <span className="text-[9px] font-extrabold text-blue-400 bg-blue-500/10 border border-blue-500/15 px-1 rounded-sm select-none" title={`Thứ hạng hiện tại: Bảng ${awayTeamStanding.split('-')[0]}, hạng ${awayTeamStanding.split('-')[1]}`}>
                {awayTeamStanding}
              </span>
            )}
          </div>
          <span className="text-[10px] text-foreground/45 uppercase tracking-wider">
            {awayCode}
          </span>
        </div>
      </div>

      {/* Sân vận động & Nhận định / Highlights */}
      {(match.stadium || isScheduled || (isFinished && match.highlight_url)) && !isLiveWidget && (
        <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-white/5 text-[10px]">
          {match.stadium ? (
            <div className="flex items-center gap-1 text-foreground/40 min-w-0">
              <MapPin size={10} />
              <span className="truncate max-w-[150px] sm:max-w-[280px]">{match.stadium}</span>
            </div>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            {isFinished && match.highlight_url && (
              <a
                href={match.highlight_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-red-500 to-orange-500 text-white hover:from-red-400 hover:to-orange-400 transition-all text-[11px] font-bold shrink-0 cursor-pointer shadow-md shadow-red-500/20"
              >
                <span>🎬</span>
                <span>Xem lại highlights</span>
                <span>↗</span>
              </a>
            )}
            {isScheduled && (
              <Link 
                href={`/analysis/${match.id}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-400 hover:to-purple-400 transition-all text-[11px] font-bold shrink-0 cursor-pointer shadow-md shadow-blue-500/20"
              >
                <span>Nhận định</span>
                <span>→</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Danh sách cầu thủ ghi bàn / Sự kiện (Hiển thị khi trận đấu đang đá hoặc đã kết thúc) */}
      {!isScheduled && showEvents && (homeEvents.length > 0 || awayEvents.length > 0) && (
        <div className="grid grid-cols-2 gap-4 mt-3 pt-2 border-t border-white/5 text-left bg-white/[0.03] rounded-lg p-2 transition-all duration-300">
          {/* Cầu thủ ghi bàn Đội nhà */}
          <div className="space-y-1 border-r border-white/5 pr-2">
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
