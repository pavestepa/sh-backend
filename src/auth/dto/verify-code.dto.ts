import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PHONE_REGEX } from '../../common/validation/phone.validator';

export class VerifyCodeDto {
  @ApiProperty({ example: '+79991234567' })
  @Matches(PHONE_REGEX, {
    message: 'phone must be in E.164 format, e.g. +79991234567',
  })
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(4, 8)
  code: string;

  @ApiPropertyOptional({
    description:
      'Display name, used only when this phone registers for the first time',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;
}
