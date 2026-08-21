import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { RegisterPushDeviceDto } from './dto/register-push-device.dto';

@ApiBearerAuth()
@ApiTags('notifications')
@Controller('push-devices')
export class PushDevicesController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async register(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterPushDeviceDto,
  ): Promise<void> {
    await this.notificationsService.registerDevice(
      user.userId,
      dto.token,
      dto.platform,
    );
  }
}
