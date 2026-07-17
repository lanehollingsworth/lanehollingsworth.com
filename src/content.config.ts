import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  loader: glob({ base: './src/content/posts', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    photos: z
      .array(
        z.object({
          src: z.string(),
          alt: z.string().default(''),
          caption: z.string().optional(),
        }),
      )
      .default([]),
    tags: z.array(z.string()).default([]),
    contentType: z
      .enum(['article', 'book_review', 'project', 'tutorial', 'note'])
      .default('article'),
    bookTitle: z.string().optional(),
    bookAuthor: z.string().optional(),
    bookRating: z.number().min(1).max(5).optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
