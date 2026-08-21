import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SelectApplicationDto {
  @ApiProperty()
  @IsUUID()
  applicationId: string;
}
