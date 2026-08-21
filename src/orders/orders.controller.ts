import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Idempotent } from '../common/idempotency/idempotent.decorator';
import { CursorPaginationQuery } from '../common/pagination/pagination.dto';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { SearchOrdersQueryDto } from './dto/search-orders.query.dto';
import { SelectApplicationDto } from './dto/select-application.dto';
import { CompleteOrderDto } from './dto/complete-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';

@ApiBearerAuth()
@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Idempotent()
  @Post()
  createOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.createOrder(user.userId, dto);
  }

  @Public()
  @Get()
  search(@Query() query: SearchOrdersQueryDto) {
    return this.ordersService.search(query);
  }

  @Get('mine')
  getMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() pagination: CursorPaginationQuery,
    @Query('status') status?: OrderStatus,
  ) {
    return this.ordersService.getMine(
      user.userId,
      status,
      pagination.cursor,
      pagination.limit ?? 20,
    );
  }

  @Get(':orderId')
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
  ) {
    return this.ordersService.getById(orderId, user.userId);
  }

  @Idempotent()
  @Patch(':orderId/select-application')
  selectApplication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: SelectApplicationDto,
  ) {
    return this.ordersService.selectApplication(
      orderId,
      user.userId,
      dto.applicationId,
    );
  }

  @Idempotent()
  @Patch(':orderId/start')
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
  ) {
    return this.ordersService.startOrder(orderId, user.userId);
  }

  @Idempotent()
  @Patch(':orderId/submit-work')
  submitWork(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
  ) {
    return this.ordersService.submitWork(orderId, user.userId);
  }

  @Idempotent()
  @Patch(':orderId/complete')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: CompleteOrderDto,
  ) {
    return this.ordersService.completeOrder(
      orderId,
      user.userId,
      dto.photoDecisions,
    );
  }

  @Idempotent()
  @Patch(':orderId/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancel(orderId, user.userId, dto.reason);
  }
}
