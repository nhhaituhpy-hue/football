import { WorkerEnvelope, WorkerLiveMatch } from '../../types';

const WORKER_API_BASE_URL = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_WORKER_API_BASE_URL || '') : '';

export type WebSocketListener = (liveMatches: WorkerLiveMatch[]) => void;

class WebSocketClient {
  private socket: WebSocket | null = null;
  private listeners = new Set<WebSocketListener>();
  private reconnectAttempts = 0;
  private reconnectTimeout: number | ReturnType<typeof setTimeout> | null = null;
  private idleTimeout: number | ReturnType<typeof setTimeout> | null = null;
  private cachedLiveMatches: WorkerLiveMatch[] = [];

  constructor() {}

  public getCachedLiveMatches(): WorkerLiveMatch[] {
    return this.cachedLiveMatches;
  }

  public setCachedLiveMatches(matches: WorkerLiveMatch[]) {
    this.cachedLiveMatches = matches;
  }

  public subscribe(callback: WebSocketListener): () => void {
    if (typeof window === 'undefined' || !WORKER_API_BASE_URL) {
      return () => {};
    }

    this.listeners.add(callback);

    // Clear idle timeout if it was scheduled to close
    if (this.idleTimeout) {
      window.clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }

    // Connect if not already connected
    if (!this.socket && this.reconnectTimeout === null) {
      this.connect();
    } else if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      // If already open, immediately invoke callback with current cache
      callback(this.cachedLiveMatches);
    }

    return () => {
      this.listeners.delete(callback);

      // If no listeners left, close socket after an idle timeout (e.g. 5 seconds)
      if (this.listeners.size === 0) {
        if (this.idleTimeout) window.clearTimeout(this.idleTimeout);
        this.idleTimeout = window.setTimeout(() => {
          this.disconnect();
        }, 5000);
      }
    };
  }

  private connect() {
    if (typeof window === 'undefined' || !WORKER_API_BASE_URL) return;

    const wsUrl = WORKER_API_BASE_URL.replace(/^http/, 'ws') + '/live';
    console.log('Connecting to WebSocket live cache:', wsUrl);
    
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log('WebSocket connection established.');
      this.reconnectAttempts = 0;
      if (this.reconnectTimeout) {
        window.clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
    };

    this.socket.onmessage = (event) => {
      try {
        const envelope = JSON.parse(event.data) as WorkerEnvelope<WorkerLiveMatch[]> | WorkerLiveMatch[];
        const liveData = envelope && typeof envelope === 'object' && 'data' in envelope 
          ? (envelope as WorkerEnvelope<WorkerLiveMatch[]>).data 
          : (envelope as WorkerLiveMatch[]);
        
        this.cachedLiveMatches = liveData;
        this.listeners.forEach(cb => cb(liveData));
      } catch (err) {
        console.warn('Failed to parse WebSocket message:', err);
      }
    };

    this.socket.onclose = (event) => {
      console.log(`WebSocket closed (code: ${event.code}). Reconnecting...`);
      this.socket = null;
      
      // If we still have active listeners, reconnect with exponential backoff
      if (this.listeners.size > 0) {
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectAttempts++;
        this.reconnectTimeout = window.setTimeout(() => {
          this.reconnectTimeout = null;
          this.connect();
        }, delay);
      }
    };

    this.socket.onerror = (err) => {
      console.error('WebSocket error:', err);
      if (this.socket) {
        this.socket.close();
      }
    };
  }

  private disconnect() {
    if (this.reconnectTimeout) {
      window.clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.socket) {
      console.log('Closing idle WebSocket connection...');
      this.socket.close();
      this.socket = null;
    }
    this.reconnectAttempts = 0;
  }
}

export const globalWebSocketClient = new WebSocketClient();
