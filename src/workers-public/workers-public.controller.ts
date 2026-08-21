import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CursorPaginationQuery } from '../common/pagination/pagination.dto';
import { WorkersPublicService } from './workers-public.service';

@ApiBearerAuth()
@ApiTags('workers')
@Controller('workers')
export class WorkersPublicController {
  constructor(private readonly workersPublicService: WorkersPublicService) {}

  @Get(':workerId')
  getProfile(@Param('workerId') workerId: string) {
    return this.workersPublicService.getProfile(workerId);
  }

  @Get(':workerId/orders')
  getOrderHistory(
    @Param('workerId') workerId: string,
    @Query() pagination: CursorPaginationQuery,
  ) {
    return this.workersPublicService.getOrderHistory(
      workerId,
      pagination.cursor,
      pagination.limit ?? 20,
    );
  }

  @Get(':workerId/portfolio')
  getPortfolio(
    @Param('workerId') workerId: string,
    @Query() pagination: CursorPaginationQuery,
  ) {
    return this.workersPublicService.getPortfolio(
      workerId,
      pagination.cursor,
      pagination.limit ?? 20,
    );
  }

  @Get(':workerId/reviews')
  getReviews(
    @Param('workerId') workerId: string,
    @Query() pagination: CursorPaginationQuery,
  ) {
    return this.workersPublicService.getReviews(
      workerId,
      pagination.cursor,
      pagination.limit ?? 20,
    );
  }
}
