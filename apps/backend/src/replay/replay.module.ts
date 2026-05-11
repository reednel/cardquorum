import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReplayController } from './replay.controller';
import { ReplayService } from './replay.service';

@Module({
  imports: [AuthModule],
  controllers: [ReplayController],
  providers: [ReplayService],
})
export class ReplayModule {}
