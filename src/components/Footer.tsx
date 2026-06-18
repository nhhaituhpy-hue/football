'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarBlank, Trophy, GitBranch } from '@phosphor-icons/react';

export default function Footer() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Lịch Thi Đấu', path: '/', icon: CalendarBlank },
    { name: 'Bảng Xếp Hạng', path: '/standings', icon: Trophy },
    { name: 'Loại Trực Tiếp', path: '/bracket', icon: GitBranch },
  ];

  return (
    <footer className="w-full py-8 text-center border-t border-card-border mt-auto bg-card-bg/20 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 flex flex-col items-center gap-6">
        {/* Navigation Tabs */}
        <nav className="flex justify-center items-center gap-2 sm:gap-4 flex-wrap">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 border ${
                  isActive
                    ? 'bg-accent-win text-white border-accent-win shadow-md shadow-accent-win/20'
                    : 'bg-card-bg/30 text-foreground/75 border-card-border hover:bg-card-bg/60 hover:text-foreground'
                }`}
              >
                <Icon size={18} weight={isActive ? 'fill' : 'regular'} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
        
        {/* Copyright */}
        <div className="flex flex-col items-center gap-1">
          <p className="text-[11px] font-semibold text-foreground/30 uppercase tracking-wider">
            FIFA WORLD CUP 2026
          </p>
          <p className="text-xs text-foreground/40">© 2026 FIFA World Cup. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
