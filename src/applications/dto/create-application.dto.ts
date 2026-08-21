import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateApplicationDto {
  @ApiProperty({
    description: 'Price in minor currency units (kopecks) the worker proposes',
  })
  @IsInt()
  @IsPositive()
  proposedPriceMinor: number;

  @ApiProperty({
    description: 'ISO timestamp the worker proposes to do the work',
  })
  @IsDateString()
  proposedTime: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
