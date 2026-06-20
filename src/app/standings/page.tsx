'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useTournamentData } from '../../data/hooks/use-tournament-data';
import { Shield, Info, CaretDown, CaretUp } from '@phosphor-icons/react';
import { Geist_Mono } from 'next/font/google';

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function StandingsPage() {
  const { standings, loading } = useTournamentData();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [group]: prev[group] === false,
    }));
  };

  const groups = Object.keys(standings).sort();

  return (
    <div className={`space-y-6 animate-fade-in ${geistMono.variable}`}>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="rounded-xl bg-card-bg/25 border border-card-border/50 animate-pulse h-64 p-4 space-y-4">
              <div className="h-5 w-24 bg-foreground/10 rounded" />
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((row) => (
                  <div key={row} className="h-8 bg-foreground/5 rounded" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-dashed border-card-border/60 bg-card-bg/5 text-center text-foreground/50">
          <Info size={32} className="mb-2 text-foreground/30" />
          <p className="text-sm font-medium">Chưa có dữ liệu bảng xếp hạng.</p>
          <p className="text-xs text-foreground/40 mt-1">Hãy chạy sync từ wc2026api vào Supabase trước.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((group) => {
            const rows = standings[group] || [];
            const isExpanded = expandedGroups[group] !== false;

            return (
              <div key={group} className="rounded-xl border border-card-border bg-card-bg/40 overflow-hidden shadow-sm">
                <button
                  onClick={() => toggleGroup(group)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-black/5 dark:bg-white/5 border-b border-card-border font-bold text-sm text-left hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Shield size={16} className="text-accent-win" />
                    BẢNG {group}
                  </span>
                  {isExpanded ? <CaretUp size={16} /> : <CaretDown size={16} />}
                </button>

                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-black/5 dark:bg-white/2 border-b border-card-border/50 text-foreground/55 font-bold uppercase tracking-wider">
                          <th className="py-2 px-3 text-center w-8">#</th>
                          <th className="py-2 px-2">Đội tuyển</th>
                          <th className="py-2 px-2 text-center w-8">T</th>
                          <th className="py-2 px-2 text-center w-8">HS</th>
                          <th className="py-2 px-3 text-center w-10">Điểm</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, index) => {
                          const isTop2 = index < 2;
                          return (
                            <tr key={row.team.id} className={isTop2 ? 'bg-emerald-500/3' : ''}>
                              <td className="py-2.5 px-3 text-center font-bold">{index + 1}</td>
                              <td className="py-2.5 px-2 font-semibold">
                                <div className="flex items-center gap-2">
                                  <div className="h-4 w-6 rounded-sm overflow-hidden border border-card-border shadow-sm bg-card-bg/40">
                                    {row.team.flag_url && (
                                      <Image src={row.team.flag_url} alt="" width={24} height={16} className="w-full h-full object-cover" />
                                    )}
                                  </div>
                                  <span className="truncate max-w-[120px]" title={row.team.name_vi}>
                                    {row.team.name_vi}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-2 text-center text-foreground/70">{row.played}</td>
                              <td className="py-2.5 px-2 text-center font-mono">{row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                              <td className="py-2.5 px-3 text-center font-bold text-sm">{row.points}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

