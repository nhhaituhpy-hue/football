'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { supabase } from '../../lib/supabase';
import { fetchMatchesFromDb } from '../../data/supabase/matches.repository';
import { fetchTeamsFromDb } from '../../data/supabase/teams.repository';
import { mergeMatchData } from '../../data/domain/merge-match-data';
import { Match } from '../../types';
import { 
  SignIn, 
  MagnifyingGlass, 
  FloppyDisk, 
  Trash, 
  Eye, 
  CheckCircle, 
  Warning, 
  ArrowClockwise,
  FilmStrip,
  Cpu,
  Lightning,
  Envelope,
  LockKey,
  SignOut
} from '@phosphor-icons/react';

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_API_BASE_URL || 'https://lichworldcup-live.nhhai-tuhpy.workers.dev';

export default function AdminPage() {
  // Authentication states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  // Match management states
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'finished' | 'scheduled' | 'live'>('all');
  const [highlightFilter, setHighlightFilter] = useState<'all' | 'has_hl' | 'no_hl'>('all');
  
  // Edit & Save states
  const [highlightUrls, setHighlightUrls] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  // Manual Trigger states
  const [syncingEvents, setSyncingEvents] = useState(false);
  const [triggeringWorkflow, setTriggeringWorkflow] = useState(false);
  
  // Toast notifications
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Get access token for Worker API calls
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Check authentication on mount
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const role = data.session.user.app_metadata?.role;
        setIsAuthenticated(true);
        setIsAdmin(role === 'admin');
      }
      setAuthLoading(false);
    };

    checkSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        const role = session.user.app_metadata?.role;
        setIsAuthenticated(true);
        setIsAdmin(role === 'admin');
      } else {
        setIsAuthenticated(false);
        setIsAdmin(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadMatches = useCallback(async () => {
    setLoading(true);
    try {
      const [dbMatches, dbTeams] = await Promise.all([
        fetchMatchesFromDb(),
        fetchTeamsFromDb()
      ]);
      const teamsById = new Map(dbTeams.map(t => [Number(t.id), t]));
      const allMatches = dbMatches.map(m => mergeMatchData(m, teamsById));

      const sortedMatches = [...allMatches].sort((a, b) => {
        const aFinished = a.result?.status === 'finished';
        const bFinished = b.result?.status === 'finished';
        if (aFinished && !bFinished) return -1;
        if (!aFinished && bFinished) return 1;
        return new Date(b.match_time).getTime() - new Date(a.match_time).getTime();
      });
      setMatches(sortedMatches);
      
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
  }, [showToast]);

  // Fetch matches once authenticated and admin
  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      const loadTimer = window.setTimeout(() => {
        void loadMatches();
      }, 0);
      return () => window.clearTimeout(loadTimer);
    }
  }, [isAuthenticated, isAdmin, loadMatches]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setAuthError(error.message === 'Invalid login credentials' 
          ? 'Email hoặc mật khẩu không đúng!' 
          : error.message);
        return;
      }

      if (data.user) {
        const role = data.user.app_metadata?.role;
        setIsAuthenticated(true);
        setIsAdmin(role === 'admin');
        if (role !== 'admin') {
          setAuthError('Tài khoản không có quyền quản trị.');
        }
      }
    } catch {
      setAuthError('Lỗi kết nối tới hệ thống xác thực.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setIsAdmin(false);
    setEmail('');
    setPassword('');
  };

  const handleUrlChange = (matchId: number, value: string) => {
    setHighlightUrls(prev => ({
      ...prev,
      [matchId]: value
    }));
  };

  // Save highlight via Worker (authenticated)
  const handleSave = async (matchId: number) => {
    setSavingId(matchId);
    const url = highlightUrls[matchId]?.trim() || null;
    
    try {
      const token = await getAccessToken();
      if (!token) {
        showToast('error', 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
        return;
      }

      const response = await fetch(`${WORKER_URL}/admin/highlight`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ match_id: matchId, highlight_url: url }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          showToast('error', 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
          await handleLogout();
          return;
        }
        throw new Error(data.error || 'Lỗi không xác định');
      }
      
      setMatches(prev => prev.map(m => m.id === matchId ? { ...m, highlight_url: url } : m));
      showToast('success', 'Lưu liên kết highlight thành công!');
    } catch (error: unknown) {
      console.error('Lỗi khi cập nhật:', error);
      const message = error instanceof Error ? error.message : 'Không thể lưu liên kết.';
      showToast('error', message);
    } finally {
      setSavingId(null);
    }
  };

  // Delete highlight via Worker (authenticated)
  const handleClear = async (matchId: number) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa liên kết highlight này?')) {
      setSavingId(matchId);
      try {
        const token = await getAccessToken();
        if (!token) {
          showToast('error', 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
          return;
        }

        const response = await fetch(`${WORKER_URL}/admin/highlight`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ match_id: matchId }),
        });

        const data = await response.json();
        if (!response.ok) {
          if (response.status === 401) {
            showToast('error', 'Phiên đăng nhập hết hạn.');
            await handleLogout();
            return;
          }
          throw new Error(data.error || 'Lỗi không xác định');
        }
        
        setHighlightUrls(prev => ({ ...prev, [matchId]: '' }));
        setMatches(prev => prev.map(m => m.id === matchId ? { ...m, highlight_url: null } : m));
        showToast('success', 'Đã xóa liên kết highlight!');
      } catch (error: unknown) {
        console.error('Lỗi khi xóa:', error);
        const message = error instanceof Error ? error.message : 'Không thể xóa liên kết.';
        showToast('error', message);
      } finally {
        setSavingId(null);
      }
    }
  };

  // Admin API call helper (with auth)
  const adminFetch = async (path: string): Promise<Response> => {
    const token = await getAccessToken();
    if (!token) throw new Error('Không có token xác thực');
    return fetch(`${WORKER_URL}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  };

  // Sync Events Today via Worker (authenticated)
  const handleSyncEventsToday = async () => {
    setSyncingEvents(true);
    try {
      const response = await adminFetch('/sync-events-today');
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          showToast('error', 'Phiên đăng nhập hết hạn.');
          await handleLogout();
          return;
        }
        throw new Error(data.error || 'Lỗi không xác định từ Worker');
      }
      showToast('success', `Đồng bộ sự kiện thành công! Đã quét và cập nhật các trận đấu hôm nay.`);
      loadMatches();
    } catch (error: unknown) {
      console.error('Lỗi khi đồng bộ sự kiện:', error);
      const message = error instanceof Error ? error.message : 'Không thể kết nối tới Worker.';
      showToast('error', message);
    } finally {
      setSyncingEvents(false);
    }
  };

  // Trigger GitHub Actions Workflow (authenticated)
  const handleTriggerHighlightsWorkflow = async () => {
    setTriggeringWorkflow(true);
    try {
      const response = await adminFetch('/trigger-highlights-workflow');
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          showToast('error', 'Phiên đăng nhập hết hạn.');
          await handleLogout();
          return;
        }
        throw new Error(data.error || 'Lỗi không xác định từ Worker');
      }
      showToast('success', 'Kích hoạt GitHub Actions cào link highlight thành công!');
    } catch (error: unknown) {
      console.error('Lỗi khi kích hoạt workflow:', error);
      const message = error instanceof Error ? error.message : 'Kích hoạt thất bại.';
      showToast('error', message);
    } finally {
      setTriggeringWorkflow(false);
    }
  };

  // Filter logic
  const filteredMatches = matches.filter(match => {
    const homeName = match.home_team_name?.toLowerCase() || '';
    const awayName = match.away_team_name?.toLowerCase() || '';
    const homeCode = match.home_team_code?.toLowerCase() || '';
    const awayCode = match.away_team_code?.toLowerCase() || '';
    const query = searchQuery.toLowerCase();
    const matchesSearch = homeName.includes(query) || awayName.includes(query) || homeCode.includes(query) || awayCode.includes(query);

    const status = match.result?.status;
    let matchesStatus = true;
    if (statusFilter === 'finished') matchesStatus = status === 'finished';
    else if (statusFilter === 'scheduled') matchesStatus = status === 'scheduled';
    else if (statusFilter === 'live') matchesStatus = status === 'live';

    const currentUrl = highlightUrls[match.id];
    let matchesHighlight = true;
    if (highlightFilter === 'has_hl') matchesHighlight = !!currentUrl;
    else if (highlightFilter === 'no_hl') matchesHighlight = !currentUrl;

    return matchesSearch && matchesStatus && matchesHighlight;
  });

  // Loading state
  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Render Login Screen (Supabase Auth)
  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md rounded-2xl border border-card-border bg-card-bg/40 backdrop-blur-md p-8 shadow-2xl relative overflow-hidden transition-all duration-300">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-red-500" />
          <div className="absolute -top-20 -left-20 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col items-center mb-6">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 mb-3">
              <SignIn size={24} weight="bold" />
            </div>
            <h1 className="text-xl font-extrabold tracking-wider text-center uppercase bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-red-400">
              Quản trị Hệ thống
            </h1>
            <p className="text-xs text-foreground/50 mt-1">
              Đăng nhập với tài khoản quản trị viên
            </p>
          </div>

          {isAuthenticated && !isAdmin && (
            <div className="mb-4 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-xs font-semibold flex items-center gap-2">
              <Warning size={16} weight="fill" />
              Tài khoản không có quyền quản trị. Liên hệ admin để được cấp quyền.
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <Envelope size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/40" />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (authError) setAuthError('');
                }}
                placeholder="Email"
                className={`w-full py-3 pl-10 pr-4 rounded-xl border bg-black/20 focus:outline-none transition-all duration-300 text-sm ${
                  authError 
                    ? 'border-red-500/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/20 text-red-400' 
                    : 'border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 text-foreground'
                }`}
                autoFocus
                autoComplete="email"
              />
            </div>

            <div className="relative">
              <LockKey size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/40" />
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (authError) setAuthError('');
                }}
                placeholder="Mật khẩu"
                className={`w-full py-3 pl-10 pr-4 rounded-xl border bg-black/20 focus:outline-none transition-all duration-300 text-sm ${
                  authError 
                    ? 'border-red-500/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/20 text-red-400' 
                    : 'border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 text-foreground'
                }`}
                autoComplete="current-password"
              />
            </div>

            {authError && (
              <p className="text-center text-[11px] font-semibold text-red-400 flex items-center justify-center gap-1">
                <Warning size={14} /> {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={!email || !password || authLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 hover:from-blue-600 hover:to-red-600 text-white font-bold text-sm shadow-lg shadow-purple-500/25 transition-all duration-300 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none cursor-pointer"
            >
              {authLoading ? 'Đang xác thực...' : 'Đăng nhập'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Render Main Control Panel Screen
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
              Quản trị Livescore & Highlights
            </h1>
            <p className="text-[11px] text-foreground/50 font-medium">
              Kích hoạt đồng bộ livescore/sự kiện và cập nhật liên kết video highlight chính thức
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
            <SignOut size={15} />
            Đăng xuất
          </button>
        </div>
      </div>

      {/* Admin Quick Actions panel */}
      <div className="bg-card-bg/40 border border-card-border p-5 rounded-2xl backdrop-blur-md shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />

        <h2 className="text-sm font-extrabold uppercase tracking-wide text-foreground mb-2 flex items-center gap-2">
          <Cpu size={18} className="text-blue-400" />
          Công cụ đồng bộ thủ công (Admin Tools)
        </h2>
        <p className="text-xs text-foreground/50 mb-5 font-medium">
          Ấn nút để kích hoạt đồng bộ hoặc cào dữ liệu ngay lập tức mà không cần đợi thời gian chạy tự động của hệ thống.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Button 1 */}
          <button
            onClick={handleSyncEventsToday}
            disabled={syncingEvents || loading}
            className={`flex items-center justify-start gap-4 px-5 py-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 text-xs font-bold transition-all duration-300 transform active:scale-98 cursor-pointer disabled:opacity-50 disabled:pointer-events-none ${
              syncingEvents ? 'text-blue-400 border-blue-500/20 bg-blue-500/5' : 'text-foreground'
            }`}
          >
            <Cpu size={22} className={syncingEvents ? 'animate-spin text-blue-400' : 'text-blue-400'} />
            <div className="text-left">
              <p className="font-extrabold text-sm">Cập nhật diễn biến trận đấu trong ngày</p>
              <p className="text-[10px] text-foreground/40 font-medium mt-0.5">Cào diễn biến chi tiết từ thethao247 cho các trận đấu hôm nay bị lỗi dữ liệu</p>
            </div>
          </button>

          {/* Button 2 */}
          <button
            onClick={handleTriggerHighlightsWorkflow}
            disabled={triggeringWorkflow || loading}
            className={`flex items-center justify-start gap-4 px-5 py-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 text-xs font-bold transition-all duration-300 transform active:scale-98 cursor-pointer disabled:opacity-50 disabled:pointer-events-none ${
              triggeringWorkflow ? 'text-purple-400 border-purple-500/20 bg-purple-500/5' : 'text-foreground'
            }`}
          >
            <Lightning size={22} className={triggeringWorkflow ? 'animate-bounce text-purple-400' : 'text-purple-400'} />
            <div className="text-left">
              <p className="font-extrabold text-sm">Cập nhật link Highlight tự động</p>
              <p className="text-[10px] text-foreground/40 font-medium mt-0.5">Kích hoạt GitHub Actions cào link highlight từ FIFA.com cho các trận đã kết thúc</p>
            </div>
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
                        <Image src={match.home_team.flag_url} alt="" width={20} height={12} className="h-3 w-5 object-cover rounded-sm border border-white/5" />
                      )}
                      <span className="truncate">{match.home_team_name}</span>
                    </div>

                    <span className="bg-black/30 dark:bg-black/50 px-2 py-0.5 rounded text-[11px] font-mono tracking-wider">
                      {isFinished || isLive ? `${match.result?.home_score ?? 0} - ${match.result?.away_score ?? 0}` : 'VS'}
                    </span>

                    <div className="flex items-center gap-2 truncate max-w-[150px]">
                      {match.away_team?.flag_url && (
                        <Image src={match.away_team.flag_url} alt="" width={20} height={12} className="h-3 w-5 object-cover rounded-sm border border-white/5" />
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
