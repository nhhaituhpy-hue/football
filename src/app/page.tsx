'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Match, Team, StandingRow } from '../types';
import { useTournamentData } from '../data/hooks/use-tournament-data';
import { playGoalSound } from '../lib/sound';
import TeamStatsModal from '../components/TeamStatsModal';
import { globalTournamentStore } from '../data/store/tournament.store';
import dynamic from 'next/dynamic';

const MatchCard = dynamic(() => import('../components/MatchCard'), {
  ssr: false,
  loading: () => (
    <div className="h-40 rounded-xl bg-card-bg/25 border border-card-border/50 animate-pulse flex flex-col justify-between p-4">
      <div className="flex justify-between">
        <div className="h-3 w-20 bg-foreground/10 rounded" />
        <div className="h-4 w-12 bg-foreground/10 rounded-full" />
      </div>
      <div className="flex justify-between items-center py-2">
        <div className="flex flex-col items-center gap-2 w-1/3">
          <div className="h-12 w-12 rounded-lg bg-foreground/10" />
          <div className="h-3 w-16 bg-foreground/10 rounded" />
        </div>
        <div className="h-6 w-16 bg-foreground/10 rounded" />
        <div className="flex flex-col items-center gap-2 w-1/3">
          <div className="h-12 w-12 rounded-lg bg-foreground/10" />
          <div className="h-3 w-16 bg-foreground/10 rounded" />
        </div>
      </div>
      <div className="h-2 w-full bg-foreground/10 rounded" />
    </div>
  )
});
import { 
  Info
} from '@phosphor-icons/react';

function getUniqueDates(allMatches: Match[]) {
  const datesYMD = allMatches.map(m => {
    const date = new Date(m.match_time);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  });
  
  return Array.from(new Set(datesYMD)).sort();
}

export default function DashboardPage() {
  const { matches, standings, loading } = useTournamentData();
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [activeTeamStats, setActiveTeamStats] = useState<{
    team: Team;
    stats: StandingRow | null;
    history: Match[];
    clickCoords?: { x: number; y: number };
  } | null>(null);

  const handleFlagClick = (team: Team, clickCoords: { x: number; y: number }) => {
    const allMatches = globalTournamentStore.getMatches();
    const allStandings = globalTournamentStore.getStandings();

    let teamStandingRow: StandingRow | null = null;
    const groupName = team.group_name;
    if (groupName) {
      const groupRows = allStandings[groupName];
      if (groupRows) {
        teamStandingRow = groupRows.find(row => row.team.id === team.id) || null;
      }
    }

    const history = allMatches
      .filter(m => 
        m.result && 
        m.result.status === 'finished' && 
        (m.home_team_id === team.id || m.away_team_id === team.id)
      )
      .sort((a, b) => new Date(a.match_time).getTime() - new Date(b.match_time).getTime());

    setActiveTeamStats({
      team,
      stats: teamStandingRow,
      history,
      clickCoords
    });
  };

  const activeDateRef = React.useRef<HTMLButtonElement | null>(null);
  const prevMatchesRef = React.useRef<Match[]>([]);

  // Compute activeDate reactively
  const activeDate = useMemo(() => {
    if (selectedDate !== undefined) return selectedDate;
    
    const dates = getUniqueDates(matches);
    if (dates.length === 0) return '';
    
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    const todayStr = `${year}-${month}-${day}`;

    if (dates.includes(todayStr)) {
      return todayStr;
    } else {
      const nextMatchDate = dates.find(d => d >= todayStr);
      if (nextMatchDate) {
        return nextMatchDate;
      }
      return dates[0];
    }
  }, [matches, selectedDate]);

  // Tự động cuộn ngày được chọn vào giữa thanh cuộn
  useEffect(() => {
    if (!loading && activeDateRef.current) {
      const timer = setTimeout(() => {
        activeDateRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [activeDate, loading]);

  // So sánh tỉ số cũ và mới để phát âm thanh báo bàn thắng
  useEffect(() => {
    if (loading || matches.length === 0) return;

    if (prevMatchesRef.current.length > 0) {
      let scoreChanged = false;
      matches.forEach((match) => {
        const prevMatch = prevMatchesRef.current.find(m => m.id === match.id);
        if (prevMatch && prevMatch.result && match.result) {
          const isLive = match.result.status === 'live';
          const homeIncreased = match.result.home_score > prevMatch.result.home_score;
          const awayIncreased = match.result.away_score > prevMatch.result.away_score;
          if (isLive && (homeIncreased || awayIncreased)) {
            scoreChanged = true;
          }
        }
      });

      if (scoreChanged) {
        playGoalSound();
      }
    }
    prevMatchesRef.current = matches;
  }, [matches, loading]);

  // Lấy danh sách các ngày thi đấu duy nhất (định dạng DD/MM)
  const datesList = getUniqueDates(matches);

  // Lọc các trận đấu
  const liveMatches = matches.filter(m => m.result?.status === 'live');
  
  const filteredMatches = matches.filter(m => {
    // Lọc theo ngày (dạng YYYY-MM-DD để so sánh chuẩn xác, bất biến)
    const matchDateYMD = (() => {
      const date = new Date(m.match_time);
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const parts = formatter.formatToParts(date);
      const year = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      return `${year}-${month}-${day}`;
    })();
    
    const matchDateOk = activeDate ? matchDateYMD === activeDate : true;

    return matchDateOk;
  });

  const getTeamStandingLabel = (teamId: number | null, groupName: string | null | undefined) => {
    if (!teamId || !groupName) return undefined;
    const groupRows = standings[groupName];
    if (!groupRows) return undefined;
    const index = groupRows.findIndex(row => row.team.id === teamId);
    if (index === -1) return undefined;
    return `${groupName}-${index + 1}`;
  };



  return (
    <div className="space-y-6 animate-fade-in relative min-h-screen">

      {/* 2. WIDGET TRẬN ĐẤU ĐANG DIỄN RA (LIVE MATCHES) */}
      {liveMatches.length > 0 && (
        <section className={`space-y-3 ${liveMatches.length === 1 ? 'max-w-2xl mx-auto w-full' : ''}`}>
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-red-500 live-indicator-pulse" />
            <h2 className="text-lg font-bold tracking-tight">Trực Tiếp</h2>
          </div>
          <div className={`grid gap-6 ${liveMatches.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
            {liveMatches.map((match) => (
              <MatchCard 
                key={match.id} 
                match={match} 
                isLiveWidget={true} 
                homeTeamStanding={getTeamStandingLabel(match.home_team_id, match.home_team?.group_name)}
                awayTeamStanding={getTeamStandingLabel(match.away_team_id, match.away_team?.group_name)}
                onFlagClick={handleFlagClick}
              />
            ))}
          </div>
        </section>
      )}

      {/* 3. LỊCH THI ĐẤU CHI TIẾT */}
      <section className="space-y-6">
        {/* Thanh trượt chọn ngày ngang (Fluent Horizontal Date Selector) */}
        {loading ? (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-none animate-pulse">
            <div className="h-[38px] w-24 bg-card-bg/20 border border-card-border/50 rounded-lg shrink-0" />
            <div className="h-[38px] w-20 bg-card-bg/20 border border-card-border/50 rounded-lg shrink-0" />
            <div className="h-[38px] w-20 bg-card-bg/20 border border-card-border/50 rounded-lg shrink-0" />
            <div className="h-[38px] w-20 bg-card-bg/20 border border-card-border/50 rounded-lg shrink-0" />
            <div className="h-[38px] w-20 bg-card-bg/20 border border-card-border/50 rounded-lg shrink-0" />
          </div>
        ) : datesList.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-none snap-x">
            <button
              ref={activeDate === '' ? activeDateRef : undefined}
              onClick={() => setSelectedDate('')}
              className={`snap-start px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                activeDate === ''
                  ? 'bg-accent-win text-white border-accent-win shadow-sm'
                  : 'bg-card-bg/30 text-foreground/75 border-card-border hover:bg-card-bg/60 hover:text-foreground'
              }`}
            >
              Tất cả ngày
            </button>
            {datesList.map((dateStr) => {
              // Format ngày hiển thị dạng: "Ngày DD/MM" từ dateStr dạng YYYY-MM-DD
              const isSelected = activeDate === dateStr;
              const [, m, d] = dateStr.split('-');
              const displayDate = `${d}/${m}`;
              return (
                <button
                  key={dateStr}
                  ref={isSelected ? activeDateRef : undefined}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`snap-start px-4 py-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer border ${
                    isSelected
                      ? 'bg-accent-win text-white border-accent-win shadow-sm'
                      : 'bg-card-bg/30 text-foreground/75 border-card-border hover:bg-card-bg/60 hover:text-foreground'
                  }`}
                >
                  Ngày {displayDate}
                </button>
              );
            })}
          </div>
        )}

        {/* Danh sách trận đấu kết quả */}
        {loading ? (
          // Skeleton loader
          <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-40 rounded-xl bg-card-bg/25 border border-card-border/50 animate-pulse flex flex-col justify-between p-4">
                <div className="flex justify-between">
                  <div className="h-3 w-20 bg-foreground/10 rounded" />
                  <div className="h-4 w-12 bg-foreground/10 rounded-full" />
                </div>
                <div className="flex justify-between items-center py-2">
                  <div className="flex flex-col items-center gap-2 w-1/3">
                    <div className="h-12 w-12 rounded-lg bg-foreground/10" />
                    <div className="h-3 w-16 bg-foreground/10 rounded" />
                  </div>
                  <div className="h-6 w-16 bg-foreground/10 rounded" />
                  <div className="flex flex-col items-center gap-2 w-1/3">
                    <div className="h-12 w-12 rounded-lg bg-foreground/10" />
                    <div className="h-3 w-16 bg-foreground/10 rounded" />
                  </div>
                </div>
                <div className="h-2 w-full bg-foreground/10 rounded" />
              </div>
            ))}
          </div>
        ) : filteredMatches.length > 0 ? (
          <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full">
            {filteredMatches.map((match) => (
              <MatchCard 
                key={match.id} 
                match={match} 
                homeTeamStanding={getTeamStandingLabel(match.home_team_id, match.home_team?.group_name)}
                awayTeamStanding={getTeamStandingLabel(match.away_team_id, match.away_team?.group_name)}
                onFlagClick={handleFlagClick}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-dashed border-card-border/60 bg-card-bg/5 text-center text-foreground/50">
            <Info size={32} className="mb-2 text-foreground/30" />
            <p className="text-sm font-medium">Không tìm thấy trận đấu nào khớp với bộ lọc.</p>
            <p className="text-xs text-foreground/40 mt-1">Hãy thử đổi bộ lọc bảng đấu hoặc chọn một ngày khác.</p>
          </div>
        )}
      </section>

      <TeamStatsModal 
        activeTeamStats={activeTeamStats} 
        onClose={() => setActiveTeamStats(null)} 
      />
    </div>
  );
}
