import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UserMode } from '@prisma/client';

export class SwitchModeDto {
  @ApiProperty({ enum: UserMode })
  @IsEnum(UserMode)
  mode: UserMode;
}
