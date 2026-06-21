'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Info } from '@phosphor-icons/react';
import dynamic from 'next/dynamic';
import { Team, StandingRow, Match } from '../../types';
import TeamStatsModal from '../../components/TeamStatsModal';
import { globalTournamentStore } from '../../data/store/tournament.store';

const MatchCard = dynamic(() => import('../../components/MatchCard'), {
  ssr: false,
  loading: () => (
    <div className="h-40 rounded-xl bg-card-bg/25 border border-card-border/50 animate-pulse" />
  )
});
import { useTournamentData } from '../../data/hooks/use-tournament-data';

const KNOCKOUT_ORDER = ['R32', 'R16', 'QF', 'SF', '3rd', 'final'];

export default function BracketPage() {
  const { matches: allMatches, loading } = useTournamentData();
  const [activeTeamStats, setActiveTeamStats] = useState<{
    team: Team;
    stats: StandingRow | null;
    history: Match[];
    clickCoords?: { x: number; y: number };
  } | null>(null);

  const handleFlagClick = (team: Team, clickCoords: { x: number; y: number }) => {
    const allMatchesList = globalTournamentStore.getMatches();
    const allStandings = globalTournamentStore.getStandings();

    let teamStandingRow: StandingRow | null = null;
    const groupName = team.group_name;
    if (groupName) {
      const groupRows = allStandings[groupName];
      if (groupRows) {
        teamStandingRow = groupRows.find(row => row.team.id === team.id) || null;
      }
    }

    const history = allMatchesList
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
  
  const matches = useMemo(() => {
    return allMatches.filter((match) => match.round_code !== 'group');
  }, [allMatches]);

  const [selectedRound, setSelectedRound] = useState<string | undefined>(undefined);

  const activeRound = useMemo(() => {
    if (selectedRound !== undefined) return selectedRound;
    
    if (matches.length === 0) return 'R32';
    
    const roundsInDb = KNOCKOUT_ORDER.filter((r) => matches.some((m) => m.round_code === r));
    if (roundsInDb.length === 0) return 'R32';
    
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

    // 1. Ưu tiên vòng đấu đang có trận LIVE
    const liveMatch = matches.find(m => m.result?.status === 'live');
    if (liveMatch && roundsInDb.includes(liveMatch.round_code)) {
      return liveMatch.round_code;
    }
    
    // 2. Tìm vòng đấu có trận sắp diễn ra hoặc diễn ra hôm nay (match_time >= todayStr)
    let foundRound = '';
    for (const round of roundsInDb) {
      const roundMatches = matches.filter(m => m.round_code === round);
      const hasUpcoming = roundMatches.some(m => {
        const mDate = new Date(m.match_time);
        const mParts = formatter.formatToParts(mDate);
        const formattedMonth = mParts.find(p => p.type === 'month')?.value;
        const formattedDay = mParts.find(p => p.type === 'day')?.value;
        const formattedYear = mParts.find(p => p.type === 'year')?.value;
        const mDateStr = `${formattedYear}-${formattedMonth}-${formattedDay}`;
        return mDateStr >= todayStr;
      });
      if (hasUpcoming) {
        foundRound = round;
        break;
      }
    }

    if (foundRound) {
      return foundRound;
    }
    
    // 3. Nếu tất cả các trận knockout đã kết thúc, chọn vòng cuối cùng (final)
    return roundsInDb[roundsInDb.length - 1];
  }, [matches, selectedRound]);

  const activeRoundRef = React.useRef<HTMLButtonElement | null>(null);

  // Tự động cuộn vòng được chọn vào giữa thanh cuộn
  useEffect(() => {
    if (!loading && activeRoundRef.current) {
      const timer = setTimeout(() => {
        activeRoundRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [activeRound, loading]);

  const rounds = useMemo(() => {
    return KNOCKOUT_ORDER.filter((round) => matches.some((match) => match.round_code === round));
  }, [matches]);

  const visibleMatches = matches
    .filter((match) => match.round_code === activeRound)
    .sort((a, b) => (a.match_number || 0) - (b.match_number || 0));

  return (
    <div className="space-y-6 animate-fade-in flex-1 flex flex-col">
      {/* Thanh trượt chọn vòng đấu ngang (Fluent Horizontal Round Selector) */}
      {!loading && rounds.length > 0 && (
        <section className="border-b border-card-border pb-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-none snap-x">
            {rounds.map((round) => {
              const label = matches.find((match) => match.round_code === round)?.round || round;
              const isSelected = activeRound === round;
              return (
                <button
                  key={round}
                  ref={isSelected ? activeRoundRef : undefined}
                  onClick={() => setSelectedRound(round)}
                  className={`snap-start px-4 py-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer border ${
                    isSelected
                      ? 'bg-accent-win text-white border-accent-win shadow-sm'
                      : 'bg-card-bg/30 text-foreground/75 border-card-border hover:bg-card-bg/60 hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-40 rounded-xl bg-card-bg/25 border border-card-border/50 animate-pulse" />
          ))}
        </div>
      ) : visibleMatches.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {visibleMatches.map((match) => (
            <MatchCard key={match.id} match={match} onFlagClick={handleFlagClick} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-dashed border-card-border/60 bg-card-bg/5 text-center text-foreground/50">
          <Info size={32} className="mb-2 text-foreground/30" />
          <p className="text-sm font-medium">Chưa có dữ liệu vòng loại trực tiếp.</p>
          <p className="text-xs text-foreground/40 mt-1">Dữ liệu sẽ xuất hiện sau khi sync lịch 104 trận từ wc2026api.</p>
        </div>
      )}

      <TeamStatsModal 
        activeTeamStats={activeTeamStats} 
        onClose={() => setActiveTeamStats(null)} 
      />
    </div>
  );
}
