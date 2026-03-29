import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BlockController } from './block.controller';
import { BlockService } from './block.service';

@Module({
  imports: [AuthModule],
  controllers: [BlockController],
  providers: [BlockService],
  exports: [BlockService],
})
export class BlockModule {}
