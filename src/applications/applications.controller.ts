import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApplicationStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CursorPaginationQuery } from '../common/pagination/pagination.dto';
import { ApplicationsService } from './applications.service';

@ApiBearerAuth()
@ApiTags('applications')
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get('mine')
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() pagination: CursorPaginationQuery,
    @Query('status') status?: ApplicationStatus,
  ) {
    return this.applicationsService.listMine(
      user.userId,
      status,
      pagination.cursor,
      pagination.limit ?? 20,
    );
  }

  @Patch(':applicationId/withdraw')
  withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId') applicationId: string,
  ) {
    return this.applicationsService.withdraw(user.userId, applicationId);
  }
}
