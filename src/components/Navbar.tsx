'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sun, Moon, SoccerBall, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react';
import { playGoalSound } from '../lib/sound';

export default function Navbar() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  // Khởi tạo trạng thái Dark Mode & Âm thanh
  useEffect(() => {
    const theme = localStorage.getItem('theme');
    let nextIsDarkMode = true;
    if (theme) {
      nextIsDarkMode = theme === 'dark';
    } else {
      nextIsDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    if (nextIsDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    queueMicrotask(() => setIsDarkMode(nextIsDarkMode));

    // Khởi tạo âm thanh
    setIsMuted(localStorage.getItem('sound_muted') === 'true');
  }, []);

  const toggleDarkMode = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDarkMode(true);
    }
  };

  const toggleSound = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    localStorage.setItem('sound_muted', String(nextMuted));
    // Nếu bật âm thanh thì phát thử âm thanh để phản hồi cho người dùng và unlock audio context
    if (!nextMuted) {
      playGoalSound(true);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full fluent-acrylic border-b backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo & Title Section */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center group">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-sky-500 to-emerald-500 text-white shadow-md transition-transform group-hover:scale-105">
                <SoccerBall size={22} weight="fill" className="animate-spin-slow" />
              </div>
            </Link>
            <Link href="/" className="group flex items-center">
              <span className="text-sm sm:text-base font-extrabold tracking-[0.1em] text-transparent bg-clip-text bg-gradient-to-r from-foreground via-foreground/95 to-accent-win uppercase whitespace-nowrap">
                FIFA WORLD CUP 2026
              </span>
            </Link>
          </div>

          {/* Controls Section */}
          <div className="flex items-center gap-2">
            {/* Sound Toggle */}
            <button
              onClick={toggleSound}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-card-border bg-card-bg/50 text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
              title={isMuted ? 'Bật âm báo bàn thắng' : 'Tắt âm báo bàn thắng'}
            >
              {isMuted ? <SpeakerSlash size={20} /> : <SpeakerHigh size={20} />}
            </button>

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-card-border bg-card-bg/50 text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
              title={isDarkMode ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
