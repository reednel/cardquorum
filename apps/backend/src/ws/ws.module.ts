import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WsConnectionService } from './ws-connection.service';
import { WsGateway } from './ws.gateway';

@Global()
@Module({
  imports: [AuthModule],
  providers: [WsConnectionService, WsGateway],
  exports: [WsConnectionService],
})
export class WsModule {}
