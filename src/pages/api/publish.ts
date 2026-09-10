export const prerender = false;

import type { APIRoute } from 'astro';
import { publishPost, type PublishPhoto } from '../../lib/publish';

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      ok: true,
      message:
        'POST multipart/form-data with fields: password, title, body?, draft?, photos[]',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    let title = '';
    let body = '';
    let password = '';
    let draft = false;
    const photos: PublishPhoto[] = [];

    if (contentType.includes('application/json')) {
      const json = await request.json();
      title = String(json.title ?? '');
      body = String(json.body ?? '');
      password = String(json.password ?? '');
      draft = Boolean(json.draft);
      const list = Array.isArray(json.photos) ? json.photos : [];
      for (const item of list) {
        const base64 = String(item.data ?? item.base64 ?? '');
        const cleaned = base64.replace(/^data:[^;]+;base64,/, '');
        const bytes = Uint8Array.from(Buffer.from(cleaned, 'base64'));
        photos.push({
          filename: String(item.filename ?? 'photo.jpg'),
          contentType: String(item.contentType ?? 'image/jpeg'),
          bytes,
        });
      }
    } else {
      const form = await request.formData();
      title = String(form.get('title') ?? '');
      body = String(form.get('body') ?? '');
      password = String(form.get('password') ?? form.get('token') ?? '');
      draft = String(form.get('draft') ?? '') === 'true';

      const files = form
        .getAll('photos')
        .concat(form.getAll('photo'))
        .concat(form.getAll('images'));

      for (const file of files) {
        if (typeof file === 'string' || !file) continue;
        const buffer = new Uint8Array(await file.arrayBuffer());
        if (buffer.byteLength === 0) continue;
        photos.push({
          filename: file.name || 'photo.jpg',
          contentType: file.type || 'image/jpeg',
          bytes: buffer,
        });
      }
    }

    const result = await publishPost({ title, body, password, photos, draft });
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const status = Number((error as { status?: number }).status ?? 500);
    const message = error instanceof Error ? error.message : 'Publish failed';
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: status >= 400 && status < 600 ? status : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
