import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsUUID, ValidateNested } from 'class-validator';

export class PhotoApprovalDecisionDto {
  @ApiProperty()
  @IsUUID()
  photoId: string;

  @ApiProperty()
  @IsBoolean()
  approve: boolean;
}

export class CompleteOrderDto {
  @ApiProperty({ type: [PhotoApprovalDecisionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhotoApprovalDecisionDto)
  photoDecisions: PhotoApprovalDecisionDto[];
}
