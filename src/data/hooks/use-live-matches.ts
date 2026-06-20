import { useEffect, useState } from 'react';
import { globalTournamentStore } from '../store/tournament.store';
import { WorkerLiveMatch } from '../../types';

export function useLiveMatches(): WorkerLiveMatch[] {
  const [liveMatches, setLiveMatches] = useState<WorkerLiveMatch[]>(() => globalTournamentStore.getLiveMatches());

  useEffect(() => {
    const handleStoreChange = () => {
      setLiveMatches(globalTournamentStore.getLiveMatches());
    };

    const unsubscribe = globalTournamentStore.subscribe(handleStoreChange);
    handleStoreChange();

    return () => {
      unsubscribe();
    };
  }, []);

  return liveMatches;
}
