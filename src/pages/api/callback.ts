export const prerender = false;

import type { APIRoute } from 'astro';

/**
 * Decap CMS GitHub OAuth — exchange code and return token to the admin UI.
 */
export const GET: APIRoute = async ({ url }) => {
  const clientId = import.meta.env.OAUTH_GITHUB_CLIENT_ID ?? process.env.OAUTH_GITHUB_CLIENT_ID;
  const clientSecret =
    import.meta.env.OAUTH_GITHUB_CLIENT_SECRET ?? process.env.OAUTH_GITHUB_CLIENT_SECRET;
  const code = url.searchParams.get('code');

  if (!clientId || !clientSecret) {
    return new Response('Missing OAuth env vars', { status: 500 });
  }
  if (!code) {
    return new Response('Missing code', { status: 400 });
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenJson.access_token) {
    return new Response(
      tokenJson.error_description || tokenJson.error || 'OAuth token exchange failed',
      { status: 400 },
    );
  }

  const content = `
<!doctype html>
<html>
  <body>
    <script>
      (function () {
        function receiveMessage(event) {
          if (event.origin !== "${url.origin}") return;
          window.opener.postMessage(
            'authorization:github:success:${JSON.stringify({
              token: tokenJson.access_token,
              provider: 'github',
            })}',
            event.origin
          );
          window.removeEventListener('message', receiveMessage, false);
        }
        window.addEventListener('message', receiveMessage, false);
        window.opener.postMessage('authorizing:github', '*');
      })();
    </script>
  </body>
</html>`;

  return new Response(content, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};
