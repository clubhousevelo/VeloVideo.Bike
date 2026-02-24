const VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv|m4v|ogv)$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i;

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || VIDEO_EXT.test(file.name);
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT.test(file.name);
}

export function isMediaFile(file: File): boolean {
  return isVideoFile(file) || isImageFile(file);
}
