import { useEffect, useState, useCallback } from 'react';
import { globalTournamentStore } from '../store/tournament.store';

export function useTournamentData() {
  const [data, setData] = useState(() => ({
    matches: globalTournamentStore.getMatches(),
    teams: globalTournamentStore.getTeams(),
    standings: globalTournamentStore.getStandings(),
    loading: globalTournamentStore.isLoading() || !globalTournamentStore.isInitialized(),
    error: globalTournamentStore.getError(),
  }));

  useEffect(() => {
    const handleStoreChange = () => {
      setData({
        matches: globalTournamentStore.getMatches(),
        teams: globalTournamentStore.getTeams(),
        standings: globalTournamentStore.getStandings(),
        loading: globalTournamentStore.isLoading() || !globalTournamentStore.isInitialized(),
        error: globalTournamentStore.getError(),
      });
    };

    // Subscribe to store updates
    const unsubscribe = globalTournamentStore.subscribe(handleStoreChange);
    
    // Synchronize current values
    handleStoreChange();

    return () => {
      unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    await globalTournamentStore.forceRefresh();
  }, []);

  return {
    ...data,
    refresh,
  };
}
