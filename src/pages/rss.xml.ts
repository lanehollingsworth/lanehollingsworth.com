import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPublishedPosts, postDescription } from '../lib/posts';
import { site } from '../lib/site';

export async function GET(context: APIContext) {
  const posts = await getPublishedPosts();

  return rss({
    title: site.name,
    description: site.description,
    site: context.site ?? site.url,
    items: posts.map((post) => ({
      title: post.data.title,
      description: postDescription(post),
      pubDate: post.data.pubDate,
      link: `/posts/${post.id}/`,
    })),
  });
}
