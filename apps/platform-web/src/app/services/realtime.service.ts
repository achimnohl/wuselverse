import { Injectable, OnDestroy } from '@angular/core';
import { Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';

export type PlatformUpdateEvent =
  | 'agents.changed'
  | 'tasks.changed'
  | 'reviews.changed'
  | 'transactions.changed'
  | 'platform.changed';

@Injectable({
  providedIn: 'root'
})
export class RealtimeService implements OnDestroy {
  private readonly socket: Socket;

  constructor() {
    this.socket = io(this.resolveSocketUrl(), {
      autoConnect: true,
      transports: ['websocket'],
      withCredentials: true,
    });
  }

  private resolveSocketUrl(): string {
    const globalBaseUrl = (globalThis as any).__WUSELVERSE_API_URL__;
    if (typeof globalBaseUrl === 'string' && globalBaseUrl.trim()) {
      return globalBaseUrl.replace(/\/api\/?$/, '/updates');
    }

    if (typeof window !== 'undefined' && window.location?.origin) {
      const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      return isLocalhost ? 'http://localhost:3000/updates' : `${window.location.origin}/updates`;
    }

    return 'http://localhost:3000/updates';
  }

  watch(events: PlatformUpdateEvent[]): Observable<void> {
    return new Observable<void>((subscriber) => {
      const uniqueEvents = [...new Set(events)];
      const handlers = uniqueEvents.map((eventName) => {
        const handler = () => subscriber.next();
        this.socket.on(eventName, handler);
        return { eventName, handler };
      });

      if (!this.socket.connected) {
        this.socket.connect();
      }

      return () => {
        for (const { eventName, handler } of handlers) {
          this.socket.off(eventName, handler);
        }
      };
    });
  }

  ngOnDestroy(): void {
    this.socket.disconnect();
  }
}
