import { ApiProperty } from '@nestjs/swagger';

export class WorkerPortfolioPhotoDto {
  @ApiProperty()
  photoId: string;

  @ApiProperty()
  orderId: string;

  @ApiProperty()
  url: string;

  @ApiProperty()
  createdAt: Date;
}
