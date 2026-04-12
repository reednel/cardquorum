import { Module } from '@nestjs/common';
import { ColorAssignmentService } from './color-assignment.service';

@Module({
  providers: [ColorAssignmentService],
  exports: [ColorAssignmentService],
})
export class ColorModule {}
