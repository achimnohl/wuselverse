import { Global, Module } from '@nestjs/common';
import { PlatformEventsGateway } from './platform-events.gateway';
import { PlatformEventsService } from './platform-events.service';

@Global()
@Module({
  providers: [PlatformEventsGateway, PlatformEventsService],
  exports: [PlatformEventsService],
})
export class RealtimeModule {}
