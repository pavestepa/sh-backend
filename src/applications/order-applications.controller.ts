import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Idempotent } from '../common/idempotency/idempotent.decorator';
import { CursorPaginationQuery } from '../common/pagination/pagination.dto';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';

@ApiBearerAuth()
@ApiTags('applications')
@Controller('orders/:orderId/applications')
export class OrderApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Idempotent()
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: CreateApplicationDto,
  ) {
    return this.applicationsService.create(user.userId, orderId, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Query() pagination: CursorPaginationQuery,
  ) {
    return this.applicationsService.listForOrder(
      user.userId,
      orderId,
      pagination.cursor,
      pagination.limit ?? 20,
    );
  }
}
