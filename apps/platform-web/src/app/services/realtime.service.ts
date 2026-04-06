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
    this.socket = io('http://localhost:3000/updates', {
      autoConnect: true,
      transports: ['websocket'],
    });
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
