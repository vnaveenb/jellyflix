import Fuse from 'fuse.js'
import type { JellyfinItem } from '../types/jellyfin'
import { jellyfinApi } from '../api/jellyfin'

class FuzzySearchEngine {
  private items: JellyfinItem[] = []
  private fuse: Fuse<JellyfinItem> | null = null
  private isLoaded = false
  private isLoading = false
  private loadPromise: Promise<void> | null = null

  async init(userId: string): Promise<void> {
    if (this.isLoaded) return
    if (this.loadPromise) return this.loadPromise

    this.isLoading = true
    this.loadPromise = (async () => {
      try {
        // Fetch Movies and TV Shows metadata for the in-memory fuzzy index
        const res = await jellyfinApi.getItems(userId, {
          includeItemTypes: 'Movie,Series',
          limit: 2000,
        })
        this.items = res.Items || []

        this.fuse = new Fuse(this.items, {
          keys: [
            { name: 'Name', weight: 2.5 },
            { name: 'OriginalTitle', weight: 2.0 },
            { name: 'SeriesName', weight: 1.8 },
            { name: 'Genres', weight: 1.4 },
            { name: 'Taglines', weight: 1.0 },
            { name: 'Overview', weight: 0.6 },
            { name: 'ProductionYear', weight: 0.5 },
          ],
          threshold: 0.38, // Balance between typo forgivingness and relevance
          distance: 100,
          ignoreLocation: true,
          minMatchCharLength: 2,
          includeScore: true,
        })

        this.isLoaded = true
      } catch (err) {
        console.warn('Failed to build fuzzy search index:', err)
      } finally {
        this.isLoading = false
      }
    })()

    return this.loadPromise
  }

  search(query: string, limit = 60): { item: JellyfinItem; score?: number }[] {
    if (!this.fuse || !query.trim()) return []
    const results = this.fuse.search(query.trim(), { limit })
    return results.map((r) => ({ item: r.item, score: r.score }))
  }

  isReady(): boolean {
    return this.isLoaded
  }

  isBusy(): boolean {
    return this.isLoading
  }

  getItems(): JellyfinItem[] {
    return this.items
  }
}

export const fuzzySearch = new FuzzySearchEngine()
