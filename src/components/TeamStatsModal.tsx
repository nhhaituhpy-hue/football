'use client';

import React from 'react';
import Image from 'next/image';
import { X } from '@phosphor-icons/react';
import { Match, Team, StandingRow } from '../types';
import { globalTournamentStore } from '../data/store/tournament.store';

interface TeamStatsModalProps {
  activeTeamStats: {
    team: Team;
    stats: StandingRow | null;
    history: Match[];
  } | null;
  onClose: () => void;
}

export default function TeamStatsModal({ activeTeamStats, onClose }: TeamStatsModalProps) {
  if (!activeTeamStats) return null;
  
  const groupName = activeTeamStats.team.group_name;
  const groupRows = groupName ? globalTournamentStore.getStandings()[groupName] : undefined;
  const teamRank = groupRows ? groupRows.findIndex(r => r.team.id === activeTeamStats.team.id) + 1 : null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in p-4"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-sm rounded-2xl fluent-acrylic border border-white/10 p-6 shadow-2xl relative animate-scale-up text-left overflow-hidden bg-[#1c2230]/95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Background decorative glows */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-accent-win/10 blur-2xl pointer-events-none rounded-full" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-500/10 blur-2xl pointer-events-none rounded-full" />

        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/5 text-foreground/50 hover:text-foreground transition-colors cursor-pointer border-0 bg-transparent"
        >
          <X size={16} weight="bold" />
        </button>

        {/* Header: Flag, Name, Rank */}
        <div className="flex items-center gap-4 border-b border-white/5 pb-4 mb-4">
          <div className="relative h-14 w-14 rounded-lg overflow-hidden border border-white/10 bg-white/5 shrink-0 shadow-md">
            {activeTeamStats.team.flag_url ? (
              <Image 
                src={activeTeamStats.team.flag_url} 
                alt={activeTeamStats.team.name_vi} 
                fill 
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500/20 to-purple-500/20 text-blue-400 font-bold text-sm uppercase">
                {activeTeamStats.team.code}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-extrabold text-foreground tracking-tight truncate leading-tight">
              {activeTeamStats.team.name_vi}
            </h4>
            <p className="text-[10px] text-foreground/45 font-medium tracking-wide uppercase truncate mt-0.5">
              {activeTeamStats.team.name_en} ({activeTeamStats.team.code})
            </p>
            {groupName && (
              <div className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/15 text-[9px] font-extrabold text-blue-400 select-none">
                <span>Bảng {groupName}</span>
                {teamRank !== null && (
                  <>
                    <span className="text-foreground/20">•</span>
                    <span>Hạng {teamRank}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Stats Summary Grid */}
        <div className="grid grid-cols-4 gap-2 text-center bg-white/[0.02] border border-white/5 rounded-xl p-3 mb-4 select-none">
          <div className="flex flex-col gap-0.5 border-r border-white/5">
            <span className="text-[9px] text-foreground/45 font-bold uppercase tracking-wider">Trận</span>
            <span className="text-sm font-extrabold text-foreground">{activeTeamStats.stats?.played || 0}</span>
          </div>
          <div className="flex flex-col gap-0.5 border-r border-white/5">
            <span className="text-[9px] text-foreground/45 font-bold uppercase tracking-wider">T-H-B</span>
            <span className="text-sm font-extrabold text-foreground">
              {activeTeamStats.stats ? `${activeTeamStats.stats.won}-${activeTeamStats.stats.drawn}-${activeTeamStats.stats.lost}` : '0-0-0'}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 border-r border-white/5">
            <span className="text-[9px] text-foreground/45 font-bold uppercase tracking-wider">H.Số</span>
            <span className="text-sm font-extrabold text-foreground">
              {activeTeamStats.stats && activeTeamStats.stats.gd > 0 ? `+${activeTeamStats.stats.gd}` : activeTeamStats.stats?.gd || 0}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] text-foreground/45 font-bold uppercase tracking-wider">Điểm</span>
            <span className="text-sm font-extrabold text-blue-400">{activeTeamStats.stats?.points || 0}</span>
          </div>
        </div>

        {/* History Section */}
        <div>
          <h5 className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest mb-2">
            Kết quả thi đấu
          </h5>
          {activeTeamStats.history.length > 0 ? (
            <div className="space-y-2 max-h-36 overflow-y-auto pr-1 scrollbar-thin">
              {activeTeamStats.history.map((m) => {
                const isHome = m.home_team_id === activeTeamStats.team.id;
                const homeTeamName = m.home_team?.name_vi || m.home_team_name || 'Chưa xác định';
                const awayTeamName = m.away_team?.name_vi || m.away_team_name || 'Chưa xác định';
                const scoreHome = m.result?.home_score ?? 0;
                const scoreAway = m.result?.away_score ?? 0;
                
                let outcome: 'W' | 'D' | 'L' = 'D';
                if (scoreHome > scoreAway) outcome = isHome ? 'W' : 'L';
                else if (scoreHome < scoreAway) outcome = isHome ? 'L' : 'W';

                return (
                  <div 
                    key={m.id} 
                    className="flex items-center gap-2 p-2 rounded bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 transition-colors text-xs w-full"
                  >
                    {/* Outcome badge */}
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black border shrink-0 select-none ${
                      outcome === 'W'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : outcome === 'L'
                        ? 'bg-red-500/20 text-red-400 border-red-500/30'
                        : 'bg-white/10 text-foreground/50 border-white/10'
                    }`}>
                      {outcome === 'W' ? 'T' : outcome === 'L' ? 'B' : 'H'}
                    </span>

                    {/* Symmetrical match score layout */}
                    <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 min-w-0">
                      {/* Home team */}
                      <span 
                        className={`truncate text-right ${isHome ? 'font-bold text-blue-400' : 'text-foreground/75'}`}
                        title={homeTeamName}
                      >
                        {homeTeamName}
                      </span>

                      {/* Score */}
                      <span className="font-extrabold text-foreground bg-white/5 px-1.5 py-0.5 rounded select-none shrink-0 tabular-nums text-center min-w-[36px]">
                        {scoreHome} - {scoreAway}
                      </span>

                      {/* Away team */}
                      <span 
                        className={`truncate text-left ${!isHome ? 'font-bold text-blue-400' : 'text-foreground/75'}`}
                        title={awayTeamName}
                      >
                        {awayTeamName}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-foreground/45 italic py-3 text-center bg-white/[0.01] border border-dashed border-white/5 rounded-xl select-none">
              Chưa đấu trận nào ở giải đấu này.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
