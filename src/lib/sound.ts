/**
 * Synthetic sound player using HTML5 Web Audio API.
 * This generates a pleasant arpeggio chime without any external audio asset dependencies.
 */
export function playGoalSound(force = false) {
  if (typeof window === 'undefined') return;

  const isMuted = localStorage.getItem('sound_muted') === 'true';
  if (isMuted && !force) return;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const now = ctx.currentTime;
    
    // Modern pleasant chime arpeggio: C5 -> E5 -> G5 -> C6
    const notes = [523.25, 659.25, 783.99, 1046.50];

    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Soft sine waves with exponential decay sound like bells/chimes
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + index * 0.1);

      // Smooth attack and exponential decay to prevent clicks
      gain.gain.setValueAtTime(0.0001, now + index * 0.1);
      gain.gain.linearRampToValueAtTime(0.12, now + index * 0.1 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.1 + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + index * 0.1);
      osc.stop(now + index * 0.1 + 0.4);
    });
  } catch (error) {
    console.warn('Web Audio API not supported or blocked by autoplay policy:', error);
  }
}
