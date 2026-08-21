import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CursorPaginationQuery {
  @ApiPropertyOptional({
    description: 'Opaque cursor from a previous page response',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class CursorPage<T> {
  items: T[];
  nextCursor: string | null;

  constructor(items: T[], nextCursor: string | null) {
    this.items = items;
    this.nextCursor = nextCursor;
  }
}
