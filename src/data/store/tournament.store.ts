import { Match, Team, WorkerLiveMatch, StandingRow } from '../../types';
import { fetchTeamsFromDb } from '../supabase/teams.repository';
import { fetchMatchesFromDb, SupabaseMatchRow } from '../supabase/matches.repository';
import { fetchLiveMatchesFromWorker } from '../worker/live.client';
import { globalWebSocketClient } from '../worker/websocket.client';
import { mergeMatchData } from '../domain/merge-match-data';
import { calculateStandings } from '../domain/calculate-standings';

export type StoreListener = () => void;

class TournamentStore {
  private rawTeams: Team[] = [];
  private rawMatches: SupabaseMatchRow[] = [];
  private liveMatches: WorkerLiveMatch[] = [];
  
  private teamsById = new Map<number, Team>();
  private mergedMatches: Match[] = [];
  private standings: Record<string, StandingRow[]> = {};
  
  private initialized = false;
  private loading = false;
  private error: Error | null = null;
  
  private listeners = new Set<StoreListener>();
  private unsubscribeWS: (() => void) | null = null;

  constructor() {}

  public getTeams(): Team[] {
    return this.rawTeams;
  }

  public getMatches(): Match[] {
    return this.mergedMatches;
  }

  public getStandings(): Record<string, StandingRow[]> {
    return this.standings;
  }

  public getLiveMatches(): WorkerLiveMatch[] {
    return this.liveMatches;
  }

  public isLoading(): boolean {
    return this.loading;
  }

  public getError(): Error | null {
    return this.error;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    
    // Automatically trigger initialization if not done yet
    if (!this.initialized && !this.loading) {
      void this.initialize();
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  public async initialize(force = false): Promise<void> {
    if (this.initialized && !force) return;
    
    // Prevent double concurrent loading
    if (this.loading && !force) return;

    this.loading = true;
    this.error = null;
    this.notify();

    try {
      console.log('Initializing Tournament Store...');
      const [teamsData, matchesData, liveData] = await Promise.all([
        fetchTeamsFromDb(),
        fetchMatchesFromDb(),
        fetchLiveMatchesFromWorker(force),
      ]);

      this.rawTeams = teamsData;
      this.rawMatches = matchesData;
      this.liveMatches = liveData;

      this.teamsById = new Map(teamsData.map(t => [Number(t.id), t]));
      globalWebSocketClient.setCachedLiveMatches(liveData);

      this.rebuild();
      this.initialized = true;
      this.loading = false;
      this.notify();

      // Subscribe to WebSocket updates for real-time live match updates
      if (!this.unsubscribeWS) {
        this.unsubscribeWS = globalWebSocketClient.subscribe((liveUpdate) => {
          this.handleLiveUpdate(liveUpdate);
        });
      }
    } catch (err) {
      console.error('Failed to initialize Tournament Store:', err);
      this.error = err instanceof Error ? err : new Error(String(err));
      this.loading = false;
      this.notify();
    }
  }

  public async forceRefresh(): Promise<void> {
    // Force refresh database fetch and live worker fetch
    await this.initialize(true);
  }

  private handleLiveUpdate(liveUpdate: WorkerLiveMatch[]) {
    console.log('Tournament Store received WebSocket live matches update, count:', liveUpdate.length);
    this.liveMatches = liveUpdate;
    this.rebuild();
    this.notify();
  }

  private rebuild() {
    const liveByMatchId = new Map(this.liveMatches.map(l => [Number(l.match_id), l]));
    
    this.mergedMatches = this.rawMatches.map(row => 
      mergeMatchData(row, this.teamsById, liveByMatchId.get(Number(row.id)))
    );

    this.standings = calculateStandings(this.mergedMatches, this.rawTeams);
  }

  private notify() {
    this.listeners.forEach(cb => cb());
  }

  public destroy() {
    if (this.unsubscribeWS) {
      this.unsubscribeWS();
      this.unsubscribeWS = null;
    }
    this.listeners.clear();
    this.initialized = false;
  }
}

export const globalTournamentStore = new TournamentStore();
