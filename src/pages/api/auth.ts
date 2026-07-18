export const prerender = false;

import type { APIRoute } from 'astro';

/**
 * Decap CMS GitHub OAuth — start login.
 * Create a GitHub OAuth App, then set OAUTH_GITHUB_CLIENT_ID / OAUTH_GITHUB_CLIENT_SECRET.
 */
export const GET: APIRoute = async ({ url }) => {
  const clientId = import.meta.env.OAUTH_GITHUB_CLIENT_ID ?? process.env.OAUTH_GITHUB_CLIENT_ID;
  if (!clientId) {
    return new Response('Missing OAUTH_GITHUB_CLIENT_ID', { status: 500 });
  }

  const redirectUri = new URL('/api/callback', url.origin).toString();
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('scope', 'repo,user');
  authorize.searchParams.set('redirect_uri', redirectUri);

  return Response.redirect(authorize.toString(), 302);
};
