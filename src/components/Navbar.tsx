'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sun, Moon, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react';
import { playGoalSound } from '../lib/sound';
import Football3D from './Football3D';

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
    <header className="sticky top-0 z-50 w-full navbar-glass">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo & Title Section */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center group" aria-label="Trang chủ">
              <div className="flex items-center justify-center transition-transform group-hover:scale-110">
                <Football3D size={42} />
              </div>
            </Link>
            <Link href="/" className="group flex items-center">
              <span className="text-sm sm:text-base font-extrabold tracking-[0.1em] text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-red-400 uppercase whitespace-nowrap">
                FIFA WORLD CUP 2026
              </span>
            </Link>
          </div>

          {/* Controls Section */}
          <div className="flex items-center gap-2">
            {/* Sound Toggle */}
            <button
              onClick={toggleSound}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-foreground/80 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer backdrop-blur-sm"
              title={isMuted ? 'Bật âm báo bàn thắng' : 'Tắt âm báo bàn thắng'}
            >
              {isMuted ? <SpeakerSlash size={20} /> : <SpeakerHigh size={20} />}
            </button>

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-foreground/80 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer backdrop-blur-sm"
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
