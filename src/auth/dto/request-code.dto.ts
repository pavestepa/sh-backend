import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { PHONE_REGEX } from '../../common/validation/phone.validator';

export class RequestCodeDto {
  @ApiProperty({ example: '+79991234567' })
  @Matches(PHONE_REGEX, {
    message: 'phone must be in E.164 format, e.g. +79991234567',
  })
  phone: string;
}
