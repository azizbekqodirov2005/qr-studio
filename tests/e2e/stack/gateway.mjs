/**
 * Local API gateway for end-to-end tests — plays the role of Supabase's Kong +
 * Storage API in front of the *real* GoTrue and PostgREST servers:
 *
 *   /auth/v1/*     → GoTrue (proxied)
 *   /rest/v1/*     → PostgREST (proxied)
 *   /storage/v1/*  → minimal Storage API: writes object rows into
 *                    storage.objects *as the calling user* (so the app's
 *                    storage RLS policies are enforced by PostgreSQL), applies
 *                    the bucket's size/MIME limits, and serves public files.
 *   SMTP :2525     → captures GoTrue's emails; GET /__test/mail?to=… returns the last one.
 */
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const AUTH = process.env.AUTH_URL ?? 'http://127.0.0.1:9999';
const REST = process.env.REST_URL ?? 'http://127.0.0.1:54330';
const SECRET = process.env.JWT_SECRET;
const FILES = process.env.STORAGE_DIR ?? '/tmp/stack/storage';
const pool = new pg.Pool({ connectionString: process.env.DB_URL });
const mails = [];

fs.mkdirSync(FILES, { recursive: true });

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'authorization,apikey,content-type,x-client-info,x-upsert,prefer,range,accept-profile,content-profile,x-supabase-api-version,cache-control',
  );
  res.setHeader('Access-Control-Expose-Headers', 'content-range,x-supabase-api-version');
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function verifyJwt(token) {
  if (!token) return null;
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return null;
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (claims.exp && claims.exp * 1000 < Date.now()) return null;
  return claims;
}

function proxy(req, res, target, stripPrefix) {
  const url = new URL(req.url.slice(stripPrefix.length) || '/', target);
  const headers = { ...req.headers, host: url.host };
  const upstream = http.request(url, { method: req.method, headers }, (up) => {
    const h = { ...up.headers };
    delete h['access-control-allow-origin'];
    res.writeHead(up.statusCode ?? 502, h);
    up.pipe(res);
  });
  upstream.on('error', (e) => json(res, 502, { error: 'bad_gateway', message: e.message }));
  req.pipe(upstream);
}

async function asUser(claims, fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const role = claims?.role === 'authenticated' ? 'authenticated' : 'anon';
    await client.query(`set local role ${role}`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims ?? { role: 'anon' })]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function storage(req, res, pathname) {
  const claims = verifyJwt((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));

  // Public download
  let m = pathname.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (m && (req.method === 'GET' || req.method === 'HEAD')) {
    const [, bucket, name] = m;
    const { rows } = await pool.query('select public from storage.buckets where id = $1', [bucket]);
    const objName = decodeURIComponent(name);
    const meta = await pool.query('select metadata from storage.objects where bucket_id = $1 and name = $2', [bucket, objName]);
    const file = path.join(FILES, bucket, objName);
    if (!rows[0]?.public || !meta.rows[0] || !fs.existsSync(file)) return json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    res.writeHead(200, { 'content-type': meta.rows[0].metadata?.mimetype ?? 'application/octet-stream', 'cache-control': 'public, max-age=31536000' });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file).pipe(res);
  }

  // Upload
  m = pathname.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
  if (m && (req.method === 'POST' || req.method === 'PUT')) {
    const [, bucket, rawName] = m;
    const name = decodeURIComponent(rawName);
    const body = await readBody(req);
    let blob;
    let mimetype;
    const ctype = req.headers['content-type'] ?? '';
    if (ctype.startsWith('multipart/form-data')) {
      const form = await new Request('http://x', { method: 'POST', headers: { 'content-type': ctype }, body }).formData();
      const file = [...form.values()].find((v) => typeof v === 'object');
      if (!file) return json(res, 400, { statusCode: '400', error: 'invalid_request', message: 'No file' });
      blob = Buffer.from(await file.arrayBuffer());
      mimetype = file.type || 'application/octet-stream';
    } else {
      blob = body;
      mimetype = ctype || 'application/octet-stream';
    }
    const { rows } = await pool.query('select file_size_limit, allowed_mime_types from storage.buckets where id = $1', [bucket]);
    const b = rows[0];
    if (!b) return json(res, 400, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
    if (b.file_size_limit && blob.length > Number(b.file_size_limit)) {
      return json(res, 413, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
    }
    if (b.allowed_mime_types?.length && !b.allowed_mime_types.includes(mimetype)) {
      return json(res, 400, { statusCode: '415', error: 'invalid_mime_type', message: `mime type ${mimetype} is not supported` });
    }
    try {
      const id = await asUser(claims, async (c) => {
        const r = await c.query(
          'insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4) returning id',
          [bucket, name, claims?.sub ?? null, { mimetype, size: blob.length }],
        );
        return r.rows[0].id;
      });
      const file = path.join(FILES, bucket, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, blob);
      return json(res, 200, { Key: `${bucket}/${name}`, Id: id });
    } catch (e) {
      const rls = /row-level security/.test(e.message);
      return json(res, rls ? 403 : 400, { statusCode: rls ? '403' : '400', error: rls ? 'Unauthorized' : 'Error', message: e.message });
    }
  }

  // Bulk delete
  m = pathname.match(/^\/storage\/v1\/object\/([^/]+)$/);
  if (m && req.method === 'DELETE') {
    const [, bucket] = m;
    const { prefixes = [] } = JSON.parse((await readBody(req)).toString() || '{}');
    const removed = await asUser(claims, async (c) => {
      const r = await c.query('delete from storage.objects where bucket_id = $1 and name = any($2) returning name', [bucket, prefixes]);
      return r.rows;
    });
    for (const r of removed) fs.rmSync(path.join(FILES, bucket, r.name), { force: true });
    return json(res, 200, removed.map((r) => ({ name: r.name, bucket_id: bucket })));
  }

  return json(res, 404, { error: 'not_found' });
}

http
  .createServer(async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    const { pathname, searchParams } = new URL(req.url, 'http://x');
    try {
      if (pathname.startsWith('/auth/v1')) return proxy(req, res, AUTH, '/auth/v1');
      if (pathname.startsWith('/rest/v1')) return proxy(req, res, REST, '/rest/v1');
      if (pathname.startsWith('/storage/v1')) return await storage(req, res, pathname);
      if (pathname === '/__test/mail') {
        const to = searchParams.get('to');
        const found = mails.filter((m) => !to || m.to.includes(to)).at(-1);
        return found ? json(res, 200, found) : json(res, 404, { error: 'no mail' });
      }
      if (pathname === '/__test/health') return json(res, 200, { ok: true });
      json(res, 404, { error: 'not_found' });
    } catch (e) {
      json(res, 500, { error: 'gateway_error', message: String(e?.message ?? e) });
    }
  })
  .listen(PORT, '127.0.0.1', () => console.log(`gateway on :${PORT}`));

/* ---------------------------- SMTP capture ---------------------------- */
net
  .createServer((socket) => {
    let mail = { from: '', to: [], data: '' };
    let inData = false;
    let buffer = '';
    socket.write('220 localhost ESMTP test\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let idx;
      while ((idx = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            mails.push({ ...mail, receivedAt: Date.now() });
            mail = { from: '', to: [], data: '' };
            socket.write('250 OK\r\n');
          } else mail.data += (line.startsWith('..') ? line.slice(1) : line) + '\r\n';
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO') socket.write('250-localhost\r\n250 8BITMIME\r\n');
        else if (cmd === 'HELO') socket.write('250 localhost\r\n');
        else if (cmd === 'MAIL') {
          mail.from = line;
          socket.write('250 OK\r\n');
        } else if (cmd === 'RCPT') {
          mail.to.push(line.replace(/^RCPT TO:\s*/i, '').replace(/[<>]/g, ''));
          socket.write('250 OK\r\n');
        } else if (cmd === 'DATA') {
          inData = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (cmd === 'QUIT') {
          socket.write('221 Bye\r\n');
          socket.end();
        } else socket.write('250 OK\r\n');
      }
    });
  })
  .listen(Number(process.env.SMTP_PORT ?? 2525), '127.0.0.1');
