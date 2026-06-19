'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchMatches } from '../../lib/dataManager';
import { Match } from '../../types';
import { 
  Key, 
  MagnifyingGlass, 
  FloppyDisk, 
  Trash, 
  Eye, 
  CheckCircle, 
  Warning, 
  Lock, 
  ArrowClockwise,
  FilmStrip
} from '@phosphor-icons/react';

export default function AddHighlightPage() {
  // Authentication states
  const [pin, setPin] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState(false);

  // Match management states
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'finished' | 'scheduled' | 'live'>('all');
  const [highlightFilter, setHighlightFilter] = useState<'all' | 'has_hl' | 'no_hl'>('all');
  
  // Edit & Save states
  const [highlightUrls, setHighlightUrls] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  
  // Toast notifications
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Check authentication on mount
  useEffect(() => {
    const savedAuth = sessionStorage.getItem('add_hl_auth');
    if (savedAuth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // Fetch matches once authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadMatches();
    }
  }, [isAuthenticated]);

  const loadMatches = async () => {
    setLoading(true);
    try {
      const allMatches = await fetchMatches(true);
      // Sort matches: Finished matches first (they are the ones that need highlights), then by date descending
      const sortedMatches = [...allMatches].sort((a, b) => {
        // Finished first
        const aFinished = a.result?.status === 'finished';
        const bFinished = b.result?.status === 'finished';
        if (aFinished && !bFinished) return -1;
        if (!aFinished && bFinished) return 1;
        // Then by time descending
        return new Date(b.match_time).getTime() - new Date(a.match_time).getTime();
      });
      setMatches(sortedMatches);
      
      // Initialize inputs state
      const urls: Record<number, string> = {};
      sortedMatches.forEach(m => {
        urls[m.id] = m.highlight_url || '';
      });
      setHighlightUrls(urls);
    } catch (error) {
      console.error('Lỗi khi tải trận đấu:', error);
      showToast('error', 'Không thể tải danh sách trận đấu.');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === '0301') {
      setIsAuthenticated(true);
      sessionStorage.setItem('add_hl_auth', 'true');
      setAuthError(false);
    } else {
      setAuthError(true);
      setPin('');
      // Vibrate if supported
      if (typeof window !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(100);
      }
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('add_hl_auth');
    setPin('');
  };

  const handleUrlChange = (matchId: number, value: string) => {
    setHighlightUrls(prev => ({
      ...prev,
      [matchId]: value
    }));
  };

  const handleSave = async (matchId: number) => {
    setSavingId(matchId);
    const url = highlightUrls[matchId]?.trim() || null;
    
    try {
      const { error } = await supabase
        .from('wc2026_matches')
        .update({ highlight_url: url })
        .eq('id', matchId);

      if (error) throw error;
      
      // Update local match state
      setMatches(prev => prev.map(m => m.id === matchId ? { ...m, highlight_url: url } : m));
      showToast('success', 'Lưu liên kết highlight thành công!');
    } catch (error) {
      console.error('Lỗi khi cập nhật DB:', error);
      showToast('error', 'Không thể lưu liên kết vào Database.');
    } finally {
      setSavingId(null);
    }
  };

  const handleClear = async (matchId: number) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa liên kết highlight này?')) {
      setSavingId(matchId);
      try {
        const { error } = await supabase
          .from('wc2026_matches')
          .update({ highlight_url: null })
          .eq('id', matchId);

        if (error) throw error;
        
        setHighlightUrls(prev => ({ ...prev, [matchId]: '' }));
        setMatches(prev => prev.map(m => m.id === matchId ? { ...m, highlight_url: null } : m));
        showToast('success', 'Đã xóa liên kết highlight!');
      } catch (error) {
        console.error('Lỗi khi xóa:', error);
        showToast('error', 'Không thể xóa liên kết.');
      } finally {
        setSavingId(null);
      }
    }
  };

  // Filter logic
  const filteredMatches = matches.filter(match => {
    // Search query match
    const homeName = match.home_team_name?.toLowerCase() || '';
    const awayName = match.away_team_name?.toLowerCase() || '';
    const homeCode = match.home_team_code?.toLowerCase() || '';
    const awayCode = match.away_team_code?.toLowerCase() || '';
    const query = searchQuery.toLowerCase();
    const matchesSearch = homeName.includes(query) || awayName.includes(query) || homeCode.includes(query) || awayCode.includes(query);

    // Status filter
    const status = match.result?.status;
    let matchesStatus = true;
    if (statusFilter === 'finished') matchesStatus = status === 'finished';
    else if (statusFilter === 'scheduled') matchesStatus = status === 'scheduled';
    else if (statusFilter === 'live') matchesStatus = status === 'live';

    // Highlight filter
    const currentUrl = highlightUrls[match.id];
    let matchesHighlight = true;
    if (highlightFilter === 'has_hl') matchesHighlight = !!currentUrl;
    else if (highlightFilter === 'no_hl') matchesHighlight = !currentUrl;

    return matchesSearch && matchesStatus && matchesHighlight;
  });

  // Render Authentication Screen
  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md rounded-2xl border border-card-border bg-card-bg/40 backdrop-blur-md p-8 shadow-2xl relative overflow-hidden transition-all duration-300">
          {/* Neon gradient glows */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-red-500" />
          <div className="absolute -top-20 -left-20 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col items-center mb-6">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 mb-3 animate-pulse">
              <Key size={24} weight="bold" />
            </div>
            <h1 className="text-xl font-extrabold tracking-wider text-center uppercase bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-red-400">
              Xác thực Quản trị
            </h1>
            <p className="text-xs text-foreground/50 mt-1">
              Nhập mã PIN để quản lý video highlights
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                maxLength={4}
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setPin(val);
                  if (authError) setAuthError(false);
                }}
                placeholder="Nhập 4 chữ số mã PIN"
                className={`w-full text-center text-lg font-bold py-3.5 px-4 rounded-xl border bg-black/20 focus:outline-none transition-all duration-300 ${
                  pin ? 'tracking-[1em] pl-[1em]' : 'tracking-normal'
                } ${
                  authError 
                    ? 'border-red-500/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/20 text-red-400 animate-shake' 
                    : 'border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 text-foreground'
                }`}
                autoFocus
              />
              {authError && (
                <p className="text-center text-[11px] font-semibold text-red-400 mt-2 flex items-center justify-center gap-1">
                  <Warning size={14} /> Mã PIN không chính xác!
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={pin.length < 4}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 hover:from-blue-600 hover:to-red-600 text-white font-bold text-sm shadow-lg shadow-purple-500/25 transition-all duration-300 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none cursor-pointer"
            >
              Mở khóa giao diện
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Render Main Match Editor Screen
  return (
    <div className="flex-1 space-y-6 animate-fade-in pb-12">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-20 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-md animate-slide-in text-xs font-semibold ${
          toast.type === 'success'
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/15 border-red-500/30 text-red-400'
        }`}>
          {toast.type === 'success' ? <CheckCircle size={18} weight="fill" /> : <Warning size={18} weight="fill" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card-bg/40 border border-card-border p-5 rounded-2xl backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/10 to-red-500/10 border border-white/10 flex items-center justify-center text-red-400">
            <FilmStrip size={22} weight="fill" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold uppercase tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-red-400">
              Quản lý Highlights
            </h1>
            <p className="text-[11px] text-foreground/50 font-medium">
              Thêm liên kết video highlight chính thức của các trận đấu World Cup 2026
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={loadMatches}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-semibold transition-colors cursor-pointer"
            title="Làm mới danh sách"
          >
            <ArrowClockwise size={15} />
            Làm mới
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 text-xs font-semibold transition-colors cursor-pointer ml-auto sm:ml-0"
          >
            <Lock size={15} />
            Đóng phiên
          </button>
        </div>
      </div>

      {/* Filters & Search Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-card-bg/40 border border-card-border p-4 rounded-2xl backdrop-blur-md">
        {/* Search */}
        <div className="relative">
          <MagnifyingGlass size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/40" />
          <input
            type="text"
            placeholder="Tìm theo tên đội tuyển..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-black/10 dark:bg-black/20 border border-white/5 focus:border-blue-500 focus:outline-none py-2.5 pl-10 pr-4 rounded-xl text-xs text-foreground placeholder-foreground/30 transition-all duration-300"
          />
        </div>

        {/* Status Filter */}
        <div className="flex gap-1 bg-black/10 dark:bg-black/25 p-1 rounded-xl border border-white/5">
          {(['all', 'finished', 'live'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setStatusFilter(mode)}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all duration-300 cursor-pointer ${
                statusFilter === mode
                  ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 text-blue-400 shadow-sm'
                  : 'text-foreground/60 hover:text-foreground'
              }`}
            >
              {mode === 'all' ? 'Tất cả trạng thái' : mode === 'finished' ? 'Hết giờ' : 'Đang đá'}
            </button>
          ))}
        </div>

        {/* Highlight Filter */}
        <div className="flex gap-1 bg-black/10 dark:bg-black/25 p-1 rounded-xl border border-white/5">
          {(['all', 'has_hl', 'no_hl'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setHighlightFilter(mode)}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all duration-300 cursor-pointer ${
                highlightFilter === mode
                  ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 text-blue-400 shadow-sm'
                  : 'text-foreground/60 hover:text-foreground'
              }`}
            >
              {mode === 'all' ? 'Mọi video' : mode === 'has_hl' ? 'Đã có' : 'Chưa có'}
            </button>
          ))}
        </div>
      </div>

      {/* Match List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="h-24 w-full rounded-2xl bg-card-bg/25 border border-card-border/50 animate-pulse" />
          ))}
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 rounded-2xl border border-dashed border-card-border bg-card-bg/10 text-foreground/50">
          <Warning size={32} className="mb-2 text-foreground/30" />
          <p className="text-xs font-semibold uppercase tracking-wider">Không tìm thấy trận đấu nào</p>
          <p className="text-[11px] text-foreground/40 mt-1">Vui lòng điều chỉnh lại bộ lọc tìm kiếm.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMatches.map(match => {
            const isFinished = match.result?.status === 'finished';
            const isLive = match.result?.status === 'live';
            const hasHl = !!match.highlight_url;
            const isSaving = savingId === match.id;
            const inputVal = highlightUrls[match.id] || '';
            const isDirty = inputVal.trim() !== (match.highlight_url || '');

            return (
              <div 
                key={match.id}
                className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-card-bg/40 border border-card-border p-4 rounded-2xl backdrop-blur-sm hover:bg-card-bg/50 transition-all duration-300 shadow-sm"
              >
                {/* Match Information */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[9px] font-bold bg-white/5 border border-white/10 px-2 py-0.5 rounded text-foreground/60 uppercase tracking-wider">
                      {match.round}
                    </span>
                    {isFinished ? (
                      <span className="text-[9px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded uppercase tracking-wider">
                        Hết giờ
                      </span>
                    ) : isLive ? (
                      <span className="text-[9px] font-bold bg-red-500/10 border border-red-500/20 text-red-400 px-2 py-0.5 rounded uppercase tracking-wider live-indicator-pulse">
                        Đang đá
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-0.5 rounded uppercase tracking-wider">
                        Chưa đá
                      </span>
                    )}
                    {hasHl && (
                      <span className="text-[9px] font-bold bg-purple-500/10 border border-purple-500/20 text-purple-400 px-2 py-0.5 rounded uppercase tracking-wider">
                        Có Highlights
                      </span>
                    )}
                  </div>

                  {/* Teams Score row */}
                  <div className="flex items-center gap-3 text-xs font-extrabold text-foreground">
                    <div className="flex items-center gap-2 truncate max-w-[150px]">
                      {match.home_team?.flag_url && (
                        <img src={match.home_team.flag_url} alt="" className="h-3 w-5 object-cover rounded-sm border border-white/5" />
                      )}
                      <span className="truncate">{match.home_team_name}</span>
                    </div>

                    <span className="bg-black/30 dark:bg-black/50 px-2 py-0.5 rounded text-[11px] font-mono tracking-wider">
                      {isFinished || isLive ? `${match.result?.home_score ?? 0} - ${match.result?.away_score ?? 0}` : 'VS'}
                    </span>

                    <div className="flex items-center gap-2 truncate max-w-[150px]">
                      {match.away_team?.flag_url && (
                        <img src={match.away_team.flag_url} alt="" className="h-3 w-5 object-cover rounded-sm border border-white/5" />
                      )}
                      <span className="truncate">{match.away_team_name}</span>
                    </div>
                  </div>
                  
                  {/* Kickoff date */}
                  <p className="text-[10px] text-foreground/40 mt-1 font-medium">
                    {new Date(match.match_time).toLocaleString('vi-VN', {
                      timeZone: 'Asia/Ho_Chi_Minh',
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>

                {/* Highlight Input and Actions */}
                <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-[420px]">
                  <div className="relative w-full">
                    <input
                      type="url"
                      placeholder="Nhập link video highlight (YouTube, FIFA...)"
                      value={inputVal}
                      onChange={(e) => handleUrlChange(match.id, e.target.value)}
                      disabled={isSaving}
                      className="w-full bg-black/10 dark:bg-black/20 border border-white/5 focus:border-blue-500 focus:outline-none py-2 px-3 rounded-xl text-xs text-foreground placeholder-foreground/20 transition-all duration-300 disabled:opacity-50"
                    />
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
                    {/* Preview Button */}
                    {inputVal.trim() && (
                      <a
                        href={inputVal}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-foreground/80 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
                        title="Xem thử link"
                      >
                        <Eye size={16} />
                      </a>
                    )}

                    {/* Delete Button */}
                    {match.highlight_url && (
                      <button
                        onClick={() => handleClear(match.id)}
                        disabled={isSaving}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
                        title="Xóa link"
                      >
                        <Trash size={16} />
                      </button>
                    )}

                    {/* Save Button */}
                    <button
                      onClick={() => handleSave(match.id)}
                      disabled={isSaving || !isDirty}
                      className={`flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        isDirty 
                          ? 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-md shadow-blue-500/10'
                          : 'bg-white/5 border border-white/10 text-foreground/30'
                      }`}
                      title="Lưu link"
                    >
                      <FloppyDisk size={14} />
                      <span>{isSaving ? 'Đang lưu...' : 'Lưu'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
