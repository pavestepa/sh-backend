import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateMeDto } from './dto/update-me.dto';
import { SwitchModeDto } from './dto/switch-mode.dto';
import {
  CreateAvatarUploadUrlDto,
  CompleteAvatarUploadDto,
} from './dto/avatar-upload-url.dto';
import { MeResponseDto } from './dto/me-response.dto';

@ApiBearerAuth()
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<MeResponseDto> {
    return this.usersService.getMe(user.userId);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMeDto,
  ): Promise<MeResponseDto> {
    return this.usersService.updateMe(user.userId, dto.name);
  }

  @Patch('me/active-mode')
  switchMode(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SwitchModeDto,
  ): Promise<MeResponseDto> {
    return this.usersService.switchMode(user.userId, dto.mode);
  }

  @Post('me/avatar-upload-url')
  createAvatarUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAvatarUploadUrlDto,
  ) {
    return this.usersService.createAvatarUploadUrl(
      user.userId,
      dto.contentType,
    );
  }

  @Post('me/avatar-upload-url/complete')
  completeAvatarUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompleteAvatarUploadDto,
  ): Promise<MeResponseDto> {
    return this.usersService.completeAvatarUpload(user.userId, dto.objectKey);
  }
}
