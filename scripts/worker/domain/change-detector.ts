export function dataHasChanged(oldData: any[] | null | undefined, newData: any[] | null | undefined): boolean {
  if (!oldData || !newData) return true;
  if (!Array.isArray(oldData) || !Array.isArray(newData)) return true;
  if (oldData.length !== newData.length) return true;
  for (let i = 0; i < oldData.length; i++) {
    const o = oldData[i];
    const n = newData[i];
    if (!o || !n) return true;
    if (o.match_id !== n.match_id) return true;
    if (o.status !== n.status) return true;
    if (o.phase !== n.phase) return true;
    if (o.minute !== n.minute) return true;
    if (o.home_score !== n.home_score) return true;
    if (o.away_score !== n.away_score) return true;
    if (o.home_pen !== n.home_pen) return true;
    if (o.away_pen !== n.away_pen) return true;

    // Compare red cards and yellow cards
    const oRedHome = o.red_cards?.home ?? 0;
    const nRedHome = n.red_cards?.home ?? 0;
    const oRedAway = o.red_cards?.away ?? 0;
    const nRedAway = n.red_cards?.away ?? 0;
    if (oRedHome !== nRedHome || oRedAway !== nRedAway) return true;

    const oYellowHome = o.yellow_cards?.home ?? 0;
    const nYellowHome = n.yellow_cards?.home ?? 0;
    const oYellowAway = o.yellow_cards?.away ?? 0;
    const nYellowAway = n.yellow_cards?.away ?? 0;
    if (oYellowHome !== nYellowHome || oYellowAway !== nYellowAway) return true;
    
    // Compare events list
    const oEvents = o.events || [];
    const nEvents = n.events || [];
    if (oEvents.length !== nEvents.length) return true;
    for (let j = 0; j < oEvents.length; j++) {
      if (oEvents[j].event_type !== nEvents[j].event_type) return true;
      if (oEvents[j].minute !== nEvents[j].minute) return true;
      if (oEvents[j].player_name !== nEvents[j].player_name) return true;
    }
  }
  return false;
}
