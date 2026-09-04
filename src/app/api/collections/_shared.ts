import type { CollectionDTO } from "@/types";

// ─── Shared collection mapping (list + detail endpoints) ────────────────────

export interface CollectionWithPreview {
  id: string;
  name: string;
  createdAt: Date;
  _count: { items: number };
  items: {
    post: {
      media: {
        url: string;
        position: number;
      }[];
    };
  }[];
}

/**
 * Maps a Collection row (with its first few items' post media) to CollectionDTO.
 * coverUrls = first media url of the 3 newest items, nulls filtered out.
 */
export function toCollectionDTO(collection: CollectionWithPreview): CollectionDTO {
  const coverUrls = collection.items
    .map((item) => {
      const first = [...item.post.media].sort((a, b) => a.position - b.position)[0];
      return first?.url ?? null;
    })
    .filter((u): u is string => !!u)
    .slice(0, 3);

  return {
    id: collection.id,
    name: collection.name,
    postCount: collection._count.items,
    coverUrls,
    createdAt: collection.createdAt.toISOString(),
  };
}

/** Include used to fetch a collection with count + first 3 items' media. */
export const collectionPreviewInclude = {
  _count: { select: { items: true } },
  items: {
    orderBy: { createdAt: "desc" as const },
    take: 3,
    include: { post: { include: { media: true } } },
  },
} as const;
