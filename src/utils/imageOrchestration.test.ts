import { describe, it, expect, vi } from 'vitest';
import {
  ImageInput,
  ImagePlatform,
  ImageProcessingError,
  processImageWithConfig,
  processAttachmentWithConfig,
  shouldGenerateGifThumbnail,
} from './imageOrchestration';
import { FILE_SIZE_LIMITS, IMAGE_CONFIGS } from './imageConfig';

type Result = { tag: string };

/** Build a mock platform that records which path was taken. */
function mockPlatform(
  overrides: Partial<ImagePlatform<ImageInput, Result>> = {},
): ImagePlatform<ImageInput, Result> {
  return {
    compress: vi.fn(async () => ({ tag: 'compress' })),
    passthroughGif: vi.fn(async () => ({ tag: 'gif' })),
    getDimensions: vi.fn(async () => ({ width: 100, height: 100 })),
    ...overrides,
  };
}

const file = (size: number, type = 'image/png'): ImageInput => ({ size, type });

describe('processImageWithConfig', () => {
  it('routes static images through compress', async () => {
    const platform = mockPlatform();
    const r = await processImageWithConfig(file(1000), 'avatar', platform);
    expect(r).toEqual({ tag: 'compress' });
    expect(platform.compress).toHaveBeenCalledOnce();
    expect(platform.passthroughGif).not.toHaveBeenCalled();
  });

  it('routes GIFs through passthroughGif', async () => {
    const platform = mockPlatform();
    const r = await processImageWithConfig(file(1000, 'image/gif'), 'sticker', platform);
    expect(r).toEqual({ tag: 'gif' });
    expect(platform.passthroughGif).toHaveBeenCalledOnce();
    expect(platform.compress).not.toHaveBeenCalled();
  });

  it('throws FILE_TOO_LARGE over the input cap (non-emoji uses MAX_INPUT_SIZE)', async () => {
    const platform = mockPlatform();
    const tooBig = file(FILE_SIZE_LIMITS.MAX_INPUT_SIZE + 1);
    await expect(processImageWithConfig(tooBig, 'avatar', platform)).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
      limitBytes: FILE_SIZE_LIMITS.MAX_INPUT_SIZE,
    });
    expect(platform.compress).not.toHaveBeenCalled();
  });

  it('uses the smaller emoji input cap for emoji', async () => {
    const platform = mockPlatform();
    // Between emoji cap and general cap: rejected for emoji...
    const between = file(FILE_SIZE_LIMITS.MAX_EMOJI_INPUT_SIZE + 1);
    await expect(processImageWithConfig(between, 'emoji', platform)).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
      limitBytes: FILE_SIZE_LIMITS.MAX_EMOJI_INPUT_SIZE,
    });
    // ...but accepted for a non-emoji surface.
    await expect(processImageWithConfig(between, 'avatar', platform)).resolves.toEqual({
      tag: 'compress',
    });
  });

  it('wraps a compressor failure in COMPRESSION_FAILED (per surface)', async () => {
    const platform = mockPlatform({
      compress: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    await expect(processImageWithConfig(file(1000), 'emoji', platform)).rejects.toMatchObject({
      code: 'EMOJI_COMPRESSION_FAILED',
    });
    await expect(processImageWithConfig(file(1000), 'sticker', platform)).rejects.toMatchObject({
      code: 'STICKER_COMPRESSION_FAILED',
    });
    await expect(processImageWithConfig(file(1000), 'avatar', platform)).rejects.toMatchObject({
      code: 'COMPRESSION_FAILED',
    });
  });

  it('passes ImageProcessingError through unchanged', async () => {
    const platform = mockPlatform({
      compress: vi.fn(async () => {
        throw new ImageProcessingError('FILE_TOO_LARGE', 123);
      }),
    });
    await expect(processImageWithConfig(file(1000), 'avatar', platform)).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
      limitBytes: 123,
    });
  });
});

describe('shouldGenerateGifThumbnail', () => {
  it('is true for large GIFs on a surface with a thumbnail config', () => {
    const config = IMAGE_CONFIGS.messageAttachment;
    const threshold = config.thumbnailConfig!.threshold * 1024;
    expect(shouldGenerateGifThumbnail(file(threshold + 1, 'image/gif'), config)).toBe(true);
    expect(shouldGenerateGifThumbnail(file(threshold - 1, 'image/gif'), config)).toBe(false);
  });

  it('is false for surfaces without a thumbnail config', () => {
    expect(shouldGenerateGifThumbnail(file(10_000_000, 'image/gif'), IMAGE_CONFIGS.emoji)).toBe(
      false,
    );
  });
});

describe('processAttachmentWithConfig', () => {
  it('returns a single full image for small static images (no thumbnail)', async () => {
    const platform = mockPlatform({ getDimensions: vi.fn(async () => ({ width: 100, height: 100 })) });
    const genThumb = vi.fn(async () => ({ tag: 'thumb' }));
    const r = await processAttachmentWithConfig(file(1000), platform, genThumb);
    expect(r.full).toEqual({ tag: 'compress' });
    expect(r.thumbnail).toBeUndefined();
    expect(platform.compress).toHaveBeenCalledOnce();
  });

  it('generates a thumbnail + full for large static images (> 300px)', async () => {
    const platform = mockPlatform({ getDimensions: vi.fn(async () => ({ width: 1000, height: 1000 })) });
    const genThumb = vi.fn(async () => ({ tag: 'thumb' }));
    const r = await processAttachmentWithConfig(file(1000), platform, genThumb);
    expect(r.thumbnail).toEqual({ tag: 'compress' }); // thumbnail also goes through compress
    expect(r.full).toEqual({ tag: 'compress' });
    expect(platform.compress).toHaveBeenCalledTimes(2);
  });

  it('marks large GIFs and uses the injected thumbnail generator', async () => {
    const platform = mockPlatform();
    const genThumb = vi.fn(async () => ({ tag: 'thumb' }));
    const big = file(FILE_SIZE_LIMITS.GIF_THUMBNAIL_THRESHOLD + 1, 'image/gif');
    const r = await processAttachmentWithConfig(big, platform, genThumb);
    expect(r.isLargeGif).toBe(true);
    expect(r.thumbnail).toEqual({ tag: 'thumb' });
    expect(r.full).toEqual({ tag: 'gif' });
    expect(genThumb).toHaveBeenCalledOnce();
  });
});
