import { Injectable, Logger } from '@nestjs/common';

/**
 * Placeholder for thumbnail/compressed-variant generation. The upload flow
 * and OrderPhoto schema are already shaped to support additional derived
 * object keys (e.g. a `thumbnailObjectKey`) later — this handler exists so
 * the job wiring and retry behavior are in place before that work starts.
 */
@Injectable()
export class PhotoProcessingService {
  private readonly logger = new Logger(PhotoProcessingService.name);

  process(photoId: string, objectKey: string): Promise<void> {
    this.logger.log(
      `Would generate thumbnail/compressed variants for photo ${photoId} (${objectKey})`,
    );
    return Promise.resolve();
  }
}
