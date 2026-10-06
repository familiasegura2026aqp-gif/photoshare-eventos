interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GOOGLE_CLIENT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_DRIVE_ROOT_FOLDER_ID?: string;
}

interface EventRecord {
  id: string;
  name: string;
  code: string;
  drive_folder_id: string | null;
}

const corsHeaders = {
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      if (request.method === 'GET' && url.pathname.startsWith('/events/')) {
        return json(await getEvent(env, url.pathname.split('/').at(-1) ?? ''));
      }

      if (request.method === 'GET' && url.pathname.startsWith('/photos/')) {
        return json(await listPhotos(env, url.pathname.split('/').at(-1) ?? ''));
      }

      if (request.method === 'POST' && url.pathname === '/create-event') {
        return json(await createEvent(request, env), 201);
      }

      if (request.method === 'PATCH' && url.pathname.startsWith('/events/')) {
        return json(await updateEvent(request, env, url.pathname.split('/').at(-1) ?? ''));
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/events/')) {
        await deleteEvent(env, url.pathname.split('/').at(-1) ?? '');
        return json({ ok: true });
      }

      if (request.method === 'POST' && url.pathname === '/upload') {
        return json(await uploadPhoto(request, env), 201);
      }

      return json({ message: 'Not found' }, 404);
    } catch (error) {
      return json({ message: error instanceof Error ? error.message : 'Unexpected error' }, 500);
    }
  },
};

async function updateEvent(request: Request, env: Env, code: string) {
  const body = await request.json<{ name?: string }>();
  const name = String(body.name ?? '').trim();

  if (!code || !name) {
    throw new Error('code and name are required.');
  }

  const response = await supabaseFetch(
    env,
    `/rest/v1/events?code=eq.${encodeURIComponent(code)}&select=id,name,code,created_at`,
    {
      body: JSON.stringify({ name }),
      headers: { prefer: 'return=representation' },
      method: 'PATCH',
    },
  );
  const events = await response.json<unknown[]>();
  return events[0] ?? null;
}

async function deleteEvent(env: Env, code: string): Promise<void> {
  if (!code) {
    throw new Error('code is required.');
  }

  await supabaseFetch(env, `/rest/v1/events?code=eq.${encodeURIComponent(code)}`, {
    headers: { prefer: 'return=minimal' },
    method: 'DELETE',
  });
}

async function createEvent(request: Request, env: Env) {
  const body = await request.json<{ code?: string; name?: string }>();
  const name = String(body.name ?? '').trim();
  const code = String(body.code ?? '').trim().toUpperCase();

  if (!name || !code) {
    throw new Error('name and code are required.');
  }

  const accessToken = await getGoogleAccessToken(env);
  const folderId = await createDriveFolderByCode(env, accessToken, code);
  const response = await supabaseFetch(env, '/rest/v1/events?select=id,name,code,created_at,drive_folder_id', {
    body: JSON.stringify({
      code,
      drive_folder_id: folderId,
      name,
    }),
    headers: { prefer: 'return=representation' },
    method: 'POST',
  });
  const events = await response.json<unknown[]>();
  return events[0];
}

async function uploadPhoto(request: Request, env: Env) {
  const form = await request.formData();
  const eventCode = String(form.get('eventCode') ?? '').trim().toUpperCase();
  const uploaderName = String(form.get('uploaderName') ?? '').trim();
  const file = form.get('file');

  if (!eventCode || !(file instanceof File)) {
    throw new Error('eventCode and file are required.');
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Only image uploads are allowed.');
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image exceeds the 5 MB upload limit.');
  }

  const event = await getEvent(env, eventCode);
  if (!event) {
    throw new Error('Event not found.');
  }

  const accessToken = await getGoogleAccessToken(env);
  const folderId = event.drive_folder_id || (await createDriveFolder(env, accessToken, event));
  const driveFile = await uploadToDrive(accessToken, folderId, file);
  const photo = await createPhotoRecord(env, event.id, file.name, driveFile.id, uploaderName);

  return {
    ...photo,
    drive_file_id: driveFile.id,
    thumbnail_url: driveFile.thumbnailLink ?? null,
  };
}

async function getEvent(env: Env, code: string): Promise<EventRecord | null> {
  const response = await supabaseFetch(
    env,
    `/rest/v1/events?code=eq.${encodeURIComponent(code)}&select=id,name,code,drive_folder_id`,
  );
  const events = await response.json<EventRecord[]>();
  return events[0] ?? null;
}

async function listPhotos(env: Env, eventCode: string) {
  const select = 'id,filename,drive_file_id,thumbnail_url,created_at,uploader_name,events!inner(code)';
  const response = await supabaseFetch(
    env,
    `/rest/v1/photos?events.code=eq.${encodeURIComponent(eventCode)}&select=${select}&order=created_at.desc`,
  );
  return response.json();
}

async function createDriveFolder(env: Env, accessToken: string, event: EventRecord): Promise<string> {
  const folderId = await createDriveFolderByCode(env, accessToken, event.code);
  await supabaseFetch(env, `/rest/v1/events?id=eq.${event.id}`, {
    body: JSON.stringify({ drive_folder_id: folderId }),
    headers: { prefer: 'return=minimal' },
    method: 'PATCH',
  });

  return folderId;
}

async function createDriveFolderByCode(env: Env, accessToken: string, code: string): Promise<string> {
  const metadata = {
    mimeType: 'application/vnd.google-apps.folder',
    name: code,
    parents: env.GOOGLE_DRIVE_ROOT_FOLDER_ID ? [env.GOOGLE_DRIVE_ROOT_FOLDER_ID] : undefined,
  };

  const response = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    body: JSON.stringify(metadata),
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Google Drive folder creation failed: ${response.status}`);
  }

  const folder = await response.json<{ id: string }>();
  return folder.id;
}

async function uploadToDrive(accessToken: string, folderId: string, file: File) {
  const boundary = `photoshare-${crypto.randomUUID()}`;
  const metadata = {
    name: `${Date.now()}-${file.name.replace(/[^\w.-]+/g, '-')}`,
    parents: [folderId],
  };

  const body = new Blob([
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\n`,
    `Content-Type: ${file.type}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`,
  ]);

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,thumbnailLink',
    {
      body,
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': `multipart/related; boundary=${boundary}`,
      },
      method: 'POST',
    },
  );

  if (!response.ok) {
    throw new Error(`Google Drive upload failed: ${response.status}`);
  }

  return response.json<{ id: string; thumbnailLink?: string }>();
}

async function createPhotoRecord(
  env: Env,
  eventId: string,
  filename: string,
  driveFileId: string,
  uploaderName: string,
) {
  const response = await supabaseFetch(env, '/rest/v1/photos?select=*', {
    body: JSON.stringify({
      drive_file_id: driveFileId,
      event_id: eventId,
      filename,
      uploader_name: uploaderName || null,
    }),
    headers: { prefer: 'return=representation' },
    method: 'POST',
  });

  const photos = await response.json<unknown[]>();
  return photos[0];
}

async function getGoogleAccessToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64UrlEncode(
    JSON.stringify({
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
      iss: env.GOOGLE_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/drive',
    }),
  );
  const signature = await sign(`${header}.${claim}`, env.GOOGLE_PRIVATE_KEY);
  const assertion = `${header}.${claim}.${signature}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    body: new URLSearchParams({
      assertion,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    }),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Google auth failed: ${response.status}`);
  }

  const token = await response.json<{ access_token: string }>();
  return token.access_token;
}

async function sign(input: string, privateKey: string): Promise<string> {
  const normalizedKey = privateKey.replace(/\\n/g, '\n');
  const pem = normalizedKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const keyData = Uint8Array.from(atob(pem), (character) => character.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { hash: 'SHA-256', name: 'RSASSA-PKCS1-v1_5' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(input),
  );

  return base64UrlEncode(signature);
}

async function supabaseFetch(env: Env, path: string, init: RequestInit = {}) {
  const response = await fetch(`${env.SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase request failed: ${response.status}`);
  }

  return response;
}

function base64UrlEncode(value: string | ArrayBuffer): string {
  const bytes =
    typeof value === 'string'
      ? new TextEncoder().encode(value)
      : new Uint8Array(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      'content-type': 'application/json; charset=utf-8',
    },
    status,
  });
}
