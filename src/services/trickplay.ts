import type { TrickplayInfo } from '../types/jellyfin'

export interface TrickplayFrame {
  /** Index of the tile sheet image that contains this frame. */
  sheetIndex: number
  /** Pixel offsets to shift the sheet so the correct tile is visible. */
  offsetX: number
  offsetY: number
  width: number
  height: number
  sheetWidth: number
  sheetHeight: number
}

/**
 * Locates the preview thumbnail for a timestamp within Jellyfin's trickplay tile sheets.
 *
 * Thumbnails are packed into a TileWidth x TileHeight grid per sheet, one frame every
 * `Interval` milliseconds, so the frame index has to be decomposed into a sheet number
 * and a row/column within that sheet.
 */
export function computeTrickplayFrame(
  info: TrickplayInfo,
  timeSeconds: number
): TrickplayFrame | null {
  const tilesPerSheet = info.TileWidth * info.TileHeight
  if (!tilesPerSheet || !info.Interval || info.ThumbnailCount <= 0) return null
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) return null

  const rawIndex = Math.floor((timeSeconds * 1000) / info.Interval)
  const frameIndex = Math.min(rawIndex, info.ThumbnailCount - 1)

  const sheetIndex = Math.floor(frameIndex / tilesPerSheet)
  const posInSheet = frameIndex % tilesPerSheet
  const col = posInSheet % info.TileWidth
  const row = Math.floor(posInSheet / info.TileWidth)

  return {
    sheetIndex,
    offsetX: -col * info.Width,
    offsetY: -row * info.Height,
    width: info.Width,
    height: info.Height,
    sheetWidth: info.Width * info.TileWidth,
    sheetHeight: info.Height * info.TileHeight,
  }
}
