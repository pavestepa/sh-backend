import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProfilesService } from './profiles.service';
import { UpdateWorkerProfileDto } from './dto/update-worker-profile.dto';
import { UpdateWorkerCategoriesDto } from './dto/update-worker-categories.dto';
import { MyWorkerProfileDto } from './dto/my-worker-profile.dto';

@ApiBearerAuth()
@ApiTags('worker-profile')
@Controller('profile/worker')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get()
  getMine(@CurrentUser() user: AuthenticatedUser): Promise<MyWorkerProfileDto> {
    return this.profilesService.getMyWorkerProfile(user.userId);
  }

  @Patch()
  updateDescription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateWorkerProfileDto,
  ): Promise<MyWorkerProfileDto> {
    return this.profilesService.updateDescription(user.userId, dto.description);
  }

  @Patch('categories')
  updateCategories(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateWorkerCategoriesDto,
  ): Promise<MyWorkerProfileDto> {
    return this.profilesService.updateCategories(user.userId, dto.categoryIds);
  }
}
