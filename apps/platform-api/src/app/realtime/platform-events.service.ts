import { Injectable } from '@nestjs/common';
import { PlatformChangeChannel, PlatformEventsGateway } from './platform-events.gateway';

@Injectable()
export class PlatformEventsService {
  constructor(private readonly gateway: PlatformEventsGateway) {}

  notify(channel: PlatformChangeChannel): void {
    this.gateway.emitChange(channel);

    if (channel !== 'platform.changed') {
      this.gateway.emitChange('platform.changed');
    }
  }

  notifyAgentsChanged(): void {
    this.notify('agents.changed');
  }

  notifyTasksChanged(): void {
    this.notify('tasks.changed');
  }

  notifyReviewsChanged(): void {
    this.notify('reviews.changed');
  }

  notifyTransactionsChanged(): void {
    this.notify('transactions.changed');
  }
}
