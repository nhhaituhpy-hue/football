import React from 'react';
import { fetchMatches, fetchMatchPrediction } from '../../../lib/dataManager';
import AnalysisClient from './AnalysisClient';

interface PageProps {
  params: Promise<{ matchId: string }>;
}

export async function generateStaticParams() {
  try {
    const matches = await fetchMatches();
    return matches.map((m) => ({
      matchId: String(m.id),
    }));
  } catch (error) {
    console.error('Failed to run generateStaticParams:', error);
    return [];
  }
}

export default async function MatchAnalysisPage({ params }: PageProps) {
  const { matchId } = await params;
  
  let match = null;
  let prediction = null;

  try {
    const allMatches = await fetchMatches();
    match = allMatches.find(m => m.id === Number(matchId)) || null;
    prediction = await fetchMatchPrediction(Number(matchId));
  } catch (error) {
    console.error(`Failed to fetch match analysis data for ID ${matchId}:`, error);
  }

  return <AnalysisClient match={match} prediction={prediction} />;
}
