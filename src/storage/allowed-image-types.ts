export const ALLOWED_IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export type AllowedImageContentType =
  (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number];

export const MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export function isAllowedImageContentType(
  value: string,
): value is AllowedImageContentType {
  return (ALLOWED_IMAGE_CONTENT_TYPES as readonly string[]).includes(value);
}
