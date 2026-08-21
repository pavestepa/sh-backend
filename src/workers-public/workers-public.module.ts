import { Module } from '@nestjs/common';
import { ReviewsModule } from '../reviews/reviews.module';
import { WorkersPublicController } from './workers-public.controller';
import { WorkersPublicService } from './workers-public.service';

@Module({
  imports: [ReviewsModule],
  controllers: [WorkersPublicController],
  providers: [WorkersPublicService],
})
export class WorkersPublicModule {}
