import { useEffect, useState } from 'react';
import { Match, MatchPrediction } from '../../types';
import { fetchPredictionFromDb } from '../supabase/predictions.repository';
import { fetchMatchesFromDb } from '../supabase/matches.repository';
import { fetchTeamsFromDb } from '../supabase/teams.repository';
import { mergeMatchData } from '../domain/merge-match-data';
import { globalTournamentStore } from '../store/tournament.store';

export function useMatchAnalysis(
  matchId: number,
  initialMatch: Match | null,
  initialPrediction: MatchPrediction | null
) {
  const [match, setMatch] = useState<Match | null>(initialMatch);
  const [prediction, setPrediction] = useState<MatchPrediction | null>(initialPrediction);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Sync with store updates (real-time live score overlay)
  useEffect(() => {
    const handleStoreChange = () => {
      const storeMatches = globalTournamentStore.getMatches();
      const liveMatch = storeMatches.find(m => m.id === matchId);
      if (liveMatch) {
        setMatch(prev => {
          if (!prev) return liveMatch;
          
          const statusChanged = prev.result?.status !== liveMatch.result?.status;
          const scoreChanged = prev.result?.home_score !== liveMatch.result?.home_score ||
                               prev.result?.away_score !== liveMatch.result?.away_score;
          const minuteChanged = prev.result?.current_minute !== liveMatch.result?.current_minute;
          const phaseChanged = prev.result?.phase !== liveMatch.result?.phase;
          const highlightChanged = prev.highlight_url !== liveMatch.highlight_url;

          if (statusChanged || scoreChanged || minuteChanged || phaseChanged || highlightChanged) {
            return {
              ...prev,
              result: liveMatch.result,
              events: liveMatch.events || prev.events,
              highlight_url: liveMatch.highlight_url || prev.highlight_url,
            };
          }
          return prev;
        });
      }
    };

    const unsubscribe = globalTournamentStore.subscribe(handleStoreChange);
    handleStoreChange();

    return () => {
      unsubscribe();
    };
  }, [matchId]);

  // Client-side revalidation of match highlights & predictions
  useEffect(() => {
    let active = true;

    async function revalidate() {
      setLoading(true);
      try {
        const [dbMatches, dbTeams, dbPrediction] = await Promise.all([
          fetchMatchesFromDb(),
          fetchTeamsFromDb(),
          fetchPredictionFromDb(matchId),
        ]);

        if (!active) return;

        const teamsById = new Map(dbTeams.map(t => [Number(t.id), t]));
        const matchRow = dbMatches.find(m => m.id === matchId);
        
        if (matchRow) {
          const liveMatches = globalTournamentStore.getLiveMatches();
          const liveOverlay = liveMatches.find(l => Number(l.match_id) === matchId);
          const latestMatch = mergeMatchData(matchRow, teamsById, liveOverlay);
          
          setMatch(prev => {
            if (!prev) return latestMatch;
            const prevUpdated = prev.result?.updated_at ? new Date(prev.result.updated_at).getTime() : 0;
            const nextUpdated = latestMatch.result?.updated_at ? new Date(latestMatch.result.updated_at).getTime() : 0;
            if (nextUpdated >= prevUpdated || latestMatch.highlight_url !== prev.highlight_url) {
              return latestMatch;
            }
            return prev;
          });
        }

        if (dbPrediction) {
          setPrediction(dbPrediction);
        }
      } catch (err) {
        const errorObject = err instanceof Error ? err : new Error(String(err));
        console.error('Revalidation failed:', errorObject);
        setError(errorObject);
      } finally {
        if (active) setLoading(false);
      }
    }

    // Delay revalidation slightly after hydration to prevent visual jump and let store initialize
    const delayTimer = window.setTimeout(() => {
      void revalidate();
    }, 1000);

    return () => {
      active = false;
      window.clearTimeout(delayTimer);
    };
  }, [matchId]);

  return {
    match,
    prediction,
    loading,
    error,
  };
}
