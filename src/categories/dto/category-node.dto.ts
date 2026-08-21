import { ApiProperty } from '@nestjs/swagger';

export class CategoryNodeDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: () => [CategoryNodeDto] })
  children: CategoryNodeDto[];
}
