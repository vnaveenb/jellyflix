import { describe, expect, it } from 'vitest'
import { computeTrickplayFrame } from './trickplay'
import type { TrickplayInfo } from '../types/jellyfin'

// 320x180 thumbnails, 10x10 grid per sheet (100 per sheet), one every 10 seconds.
const info: TrickplayInfo = {
  Width: 320,
  Height: 180,
  TileWidth: 10,
  TileHeight: 10,
  ThumbnailCount: 250,
  Interval: 10_000,
  Bandwidth: 1000,
}

describe('computeTrickplayFrame', () => {
  it('maps the first frame to the top-left tile of the first sheet', () => {
    const frame = computeTrickplayFrame(info, 0)
    expect(frame).toMatchObject({ sheetIndex: 0, offsetX: -0, offsetY: -0 })
  })

  it('advances one column per interval', () => {
    // 25s -> frame 2 -> column 2, row 0
    expect(computeTrickplayFrame(info, 25)).toMatchObject({
      sheetIndex: 0,
      offsetX: -640,
      offsetY: -0,
    })
  })

  it('wraps to the next row after TileWidth frames', () => {
    // 100s -> frame 10 -> column 0, row 1
    expect(computeTrickplayFrame(info, 100)).toMatchObject({
      sheetIndex: 0,
      offsetX: -0,
      offsetY: -180,
    })
  })

  it('rolls over to the next sheet once a sheet is full', () => {
    // 1000s -> frame 100 -> first tile of sheet 1
    expect(computeTrickplayFrame(info, 1000)).toMatchObject({
      sheetIndex: 1,
      offsetX: -0,
      offsetY: -0,
    })
    // 1105s -> frame 110 -> sheet 1, column 0, row 1
    expect(computeTrickplayFrame(info, 1105)).toMatchObject({
      sheetIndex: 1,
      offsetX: -0,
      offsetY: -180,
    })
  })

  it('clamps past the last thumbnail instead of requesting a sheet that does not exist', () => {
    const frame = computeTrickplayFrame(info, 999_999)
    // Frame 249 is the last one: sheet 2, position 49 -> column 9, row 4
    expect(frame).toMatchObject({ sheetIndex: 2, offsetX: -2880, offsetY: -720 })
  })

  it('reports the full sheet size so background-size can be set', () => {
    expect(computeTrickplayFrame(info, 0)).toMatchObject({
      sheetWidth: 3200,
      sheetHeight: 1800,
    })
  })

  it('returns null for unusable metadata', () => {
    expect(computeTrickplayFrame({ ...info, Interval: 0 }, 10)).toBeNull()
    expect(computeTrickplayFrame({ ...info, TileWidth: 0 }, 10)).toBeNull()
    expect(computeTrickplayFrame({ ...info, ThumbnailCount: 0 }, 10)).toBeNull()
  })

  it('returns null for invalid timestamps', () => {
    expect(computeTrickplayFrame(info, -5)).toBeNull()
    expect(computeTrickplayFrame(info, NaN)).toBeNull()
  })
})
