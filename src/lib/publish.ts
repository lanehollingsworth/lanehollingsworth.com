import { Octokit } from '@octokit/rest';
import { slugify } from './slug';

export type PublishPhoto = {
  filename: string;
  bytes: Uint8Array;
  contentType: string;
};

export type PublishInput = {
  title: string;
  body?: string;
  password: string;
  photos: PublishPhoto[];
  /** When true, post stays draft until undrafted */
  draft?: boolean;
};

export type PublishResult = {
  slug: string;
  path: string;
  commitUrl: string;
  photos: string[];
};

function requiredEnv(name: string): string {
  const value = import.meta.env[name] ?? process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function extensionFor(contentType: string, fallbackName: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('heic')) return 'heic';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  const fromName = fallbackName.split('.').pop()?.toLowerCase();
  if (fromName && ['png', 'webp', 'gif', 'jpg', 'jpeg', 'heic'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }
  return 'jpg';
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function buildMarkdown(opts: {
  title: string;
  body: string;
  slug: string;
  draft: boolean;
  photoPaths: { src: string; alt: string }[];
}): string {
  const lines = [
    '---',
    `title: ${JSON.stringify(opts.title)}`,
    `pubDate: ${new Date().toISOString().slice(0, 10)}`,
    `draft: ${opts.draft ? 'true' : 'false'}`,
    'tags:',
    '  - journal',
  ];

  if (opts.photoPaths.length === 0) {
    lines.push('photos: []');
  } else {
    lines.push('photos:');
    for (const photo of opts.photoPaths) {
      lines.push(`  - src: ${photo.src}`);
      lines.push(`    alt: ${JSON.stringify(photo.alt)}`);
    }
  }

  lines.push('---', '');
  if (opts.body.trim()) {
    lines.push(opts.body.trim(), '');
  }
  return lines.join('\n');
}

export function assertPublishPassword(password: string) {
  const expected = requiredEnv('WRITE_PASSWORD');
  if (!password || password !== expected) {
    const err = new Error('Unauthorized');
    (err as Error & { status: number }).status = 401;
    throw err;
  }
}

export async function publishPost(input: PublishInput): Promise<PublishResult> {
  assertPublishPassword(input.password);

  if (!input.title?.trim()) {
    const err = new Error('Title is required');
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  const token = requiredEnv('GITHUB_TOKEN');
  const repoFull = requiredEnv('GITHUB_REPO'); // owner/name
  const [owner, repo] = repoFull.split('/');
  if (!owner || !repo) {
    throw new Error('GITHUB_REPO must look like owner/repo');
  }

  const octokit = new Octokit({ auth: token });
  const slug = slugify(input.title);
  const imageDir = `public/images/posts/${slug}`;
  const postPath = `src/content/posts/${slug}.md`;

  const photoPaths: { src: string; alt: string }[] = [];
  const fileOps: {
    path: string;
    content: string; // base64 for github
  }[] = [];

  input.photos.forEach((photo, index) => {
    const ext = extensionFor(photo.contentType, photo.filename);
    const name = `${String(index + 1).padStart(2, '0')}.${ext}`;
    const repoPath = `${imageDir}/${name}`;
    photoPaths.push({
      src: `/images/posts/${slug}/${name}`,
      alt: '',
    });
    fileOps.push({
      path: repoPath,
      content: toBase64(photo.bytes),
    });
  });

  const markdown = buildMarkdown({
    title: input.title.trim(),
    body: input.body ?? '',
    slug,
    draft: Boolean(input.draft),
    photoPaths,
  });

  fileOps.push({
    path: postPath,
    content: toBase64(new TextEncoder().encode(markdown)),
  });

  const { data: ref } = await octokit.git.getRef({
    owner,
    repo,
    ref: 'heads/main',
  });
  const latestCommitSha = ref.object.sha;
  const { data: latestCommit } = await octokit.git.getCommit({
    owner,
    repo,
    commit_sha: latestCommitSha,
  });

  const blobs = await Promise.all(
    fileOps.map(async (file) => {
      const { data: blob } = await octokit.git.createBlob({
        owner,
        repo,
        content: file.content,
        encoding: 'base64',
      });
      return {
        path: file.path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: blob.sha,
      };
    }),
  );

  const { data: tree } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: latestCommit.tree.sha,
    tree: blobs,
  });

  const { data: commit } = await octokit.git.createCommit({
    owner,
    repo,
    message: `Publish post: ${input.title.trim()}`,
    tree: tree.sha,
    parents: [latestCommitSha],
  });

  await octokit.git.updateRef({
    owner,
    repo,
    ref: 'heads/main',
    sha: commit.sha,
  });

  return {
    slug,
    path: postPath,
    commitUrl: commit.html_url,
    photos: photoPaths.map((p) => p.src),
  };
}
