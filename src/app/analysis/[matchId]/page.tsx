import React from 'react';
import { fetchMatchesFromDb } from '../../../data/supabase/matches.repository';
import { fetchTeamsFromDb } from '../../../data/supabase/teams.repository';
import { fetchPredictionFromDb } from '../../../data/supabase/predictions.repository';
import { mergeMatchData } from '../../../data/domain/merge-match-data';
import AnalysisClient from './AnalysisClient';

interface PageProps {
  params: Promise<{ matchId: string }>;
}

export async function generateStaticParams() {
  const matches = await fetchMatchesFromDb();
  if (matches.length === 0) {
    throw new Error('No matches found in database, static generation aborted to prevent partial build!');
  }
  return matches.map((m) => ({
    matchId: String(m.id),
  }));
}

export default async function MatchAnalysisPage({ params }: PageProps) {
  const { matchId } = await params;
  
  let match = null;
  let prediction = null;

  try {
    const [dbMatches, dbTeams, dbPrediction] = await Promise.all([
      fetchMatchesFromDb(),
      fetchTeamsFromDb(),
      fetchPredictionFromDb(Number(matchId)),
    ]);
    
    const teamsById = new Map(dbTeams.map(t => [Number(t.id), t]));
    const matchRow = dbMatches.find(m => m.id === Number(matchId)) || null;
    if (matchRow) {
      match = mergeMatchData(matchRow, teamsById);
    }
    prediction = dbPrediction;
  } catch (error) {
    console.error(`Failed to fetch match analysis data for ID ${matchId}:`, error);
  }

  return <AnalysisClient match={match} prediction={prediction} />;
}
