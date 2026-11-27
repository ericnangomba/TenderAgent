import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import { createEmailSender, LogEmailSender } from '../src/lib/server/email/sender';
import {
  createEmailVerificationRouter,
  InMemoryVerificationStore,
  buildVerificationLink,
  digestToken,
} from '../src/lib/server/email/verification';
import {
  ensureEmailVerificationSchema,
  PostgresVerificationStore,
} from '../src/lib/server/email/postgresVerificationStore';

const ORIGIN = 'https://tenderagent1.netlify.app';
const TOKEN_RE = /https:\/\/tenderagent1\.netlify\.app\/verify-email\?token=([0-9a-f]{64})/;

interface Flow { baseUrl: string; server: Server; sender: LogEmailSender; store: InMemoryVerificationStore }

async function startFlow(overrides: { resendCooldownMs?: number; perIpHourlyCap?: number } = {}): Promise<Flow> {
  const sender = createEmailSender({}) as LogEmailSender;
  const store = new InMemoryVerificationStore();
  const app = express();
  app.use(express.json());
  app.use('/api/auth/email', createEmailVerificationRouter({
    sender, store, publicOrigin: ORIGIN, tokenTtlMs: 60_000, ...overrides,
  }));
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, server, sender, store };
}

async function requestLink(baseUrl: string, email: string) {
  return fetch(`${baseUrl}/api/auth/email/request-verification`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

async function confirm(baseUrl: string, token: string) {
  return fetch(`${baseUrl}/api/auth/email/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

test('factory: provider unset or log selects the log sender; anything else fails closed', () => {
  assert.ok(createEmailSender({}) instanceof LogEmailSender);
  assert.ok(createEmailSender({ provider: 'log' }) instanceof LogEmailSender);
  assert.throws(() => createEmailSender({ provider: 'resend' }), /not available/);
  assert.throws(() => createEmailSender({ provider: 'brevo' }), /not available/);
});

test('request-verification emails a one-time confirm link; confirm succeeds once', async () => {
  const { baseUrl, server, sender } = await startFlow();
  try {
    const res = await requestLink(baseUrl, 'NewUser@Example.com');
    assert.equal(res.status, 200);
    assert.equal(sender.outbox.length, 1);
    const msg = sender.outbox[0];
    assert.equal(msg.to, 'newuser@example.com');
    const m = msg.text.match(TOKEN_RE);
    assert.ok(m, 'email body must contain the confirm link with a 64-hex token');

    const ok = await confirm(baseUrl, m![1]);
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { success: true, email: 'newuser@example.com' });

    const replay = await confirm(baseUrl, m![1]);
    assert.equal(replay.status, 400);
  } finally {
    server.close();
  }
});

test('only the token digest is stored, never the raw token', async () => {
  const { baseUrl, server, sender, store } = await startFlow();
  try {
    await requestLink(baseUrl, 'digest@example.com');
    const token = sender.outbox[0].text.match(TOKEN_RE)![1];
    const digest = digestToken(token);
    assert.notEqual(digest, token);
    const internal = (store as any).records as Map<string, { digest: string }>;
    assert.equal(internal.size, 1);
    const [key, record] = [...internal.entries()][0];
    assert.equal(key, digest);
    assert.equal(record.digest, digest);
    assert.ok(!JSON.stringify([...internal.entries()]).includes(token));
  } finally {
    server.close();
  }
});

test('log output never contains the raw token', async () => {
  const { baseUrl, server, sender } = await startFlow();
  const logged: string[] = [];
  const original = console.log;
  console.log = (...args: any[]) => { logged.push(args.join(' ')); };
  try {
    await requestLink(baseUrl, 'quiet@example.com');
  } finally {
    console.log = original;
    server.close();
  }
  const token = sender.outbox[0].text.match(TOKEN_RE)![1];
  assert.ok(logged.length >= 1);
  assert.ok(logged.every((line) => !line.includes(token) && !line.includes(sender.outbox[0].text)));
});

test('requesting a new link invalidates the previous token (resend)', async () => {
  const { baseUrl, server, sender } = await startFlow({ resendCooldownMs: 0 });
  try {
    await requestLink(baseUrl, 'resend@example.com');
    const first = sender.outbox[0].text.match(TOKEN_RE)![1];
    await requestLink(baseUrl, 'resend@example.com');
    const second = sender.outbox[1].text.match(TOKEN_RE)![1];
    assert.notEqual(first, second);
    assert.equal((await confirm(baseUrl, first)).status, 400);
    assert.equal((await confirm(baseUrl, second)).status, 200);
  } finally {
    server.close();
  }
});

test('per-email resend cooldown and per-IP hourly cap return 429 without sending', async () => {
  const { baseUrl, server, sender } = await startFlow({ resendCooldownMs: 60_000, perIpHourlyCap: 3 });
  try {
    assert.equal((await requestLink(baseUrl, 'cool@example.com')).status, 200);
    // Same address inside the cooldown: 429, no second email.
    assert.equal((await requestLink(baseUrl, 'cool@example.com')).status, 429);
    assert.equal(sender.outbox.length, 1);
    // Other addresses still allowed until the IP cap (cap=3, one already used).
    assert.equal((await requestLink(baseUrl, 'other1@example.com')).status, 200);
    assert.equal((await requestLink(baseUrl, 'other2@example.com')).status, 200);
    assert.equal((await requestLink(baseUrl, 'other3@example.com')).status, 429);
    assert.equal(sender.outbox.length, 3);
  } finally {
    server.close();
  }
});

test('unknown or malformed tokens are rejected; no email is sent on bad input', async () => {
  const { baseUrl, server, sender } = await startFlow();
  try {
    assert.equal((await confirm(baseUrl, 'a'.repeat(64))).status, 400);
    assert.equal((await confirm(baseUrl, 'not-a-token')).status, 400);
    assert.equal((await requestLink(baseUrl, 'not-an-email')).status, 400);
    assert.equal(sender.outbox.length, 0);
  } finally {
    server.close();
  }
});

test('concurrent confirms of the same token: exactly one succeeds', async () => {
  const store = new InMemoryVerificationStore();
  const token = 'b'.repeat(64);
  await store.save({ digest: digestToken(token), email: 'race@example.com', expiresAt: new Date(Date.now() + 60_000) });
  const results = await Promise.all([
    store.consume(digestToken(token)),
    store.consume(digestToken(token)),
    store.consume(digestToken(token)),
  ]);
  assert.equal(results.filter((r) => r !== null).length, 1);
});

test('expired tokens are rejected and burned', async () => {
  const store = new InMemoryVerificationStore();
  await store.save({ digest: digestToken('f'.repeat(64)), email: 'old@example.com', expiresAt: new Date(Date.now() - 1000) });
  assert.equal(await store.consume(digestToken('f'.repeat(64))), null);
  assert.equal(await store.consume(digestToken('f'.repeat(64))), null);
});

test('verification link strips trailing slashes from the origin', () => {
  assert.equal(
    buildVerificationLink('https://tenderagent1.netlify.app/', 'ab'.repeat(32)),
    `https://tenderagent1.netlify.app/verify-email?token=${'ab'.repeat(32)}`,
  );
});

// --- Postgres store: runs only when the isolated local test DB is available. ---

const pgUri = process.env.ISOLATED_BETA_PG_URL;

test('postgres store: digest-only save, single-use, expiry, resend invalidation, concurrent consume', { skip: !pgUri }, async () => {
  const pool = new Pool({ connectionString: pgUri, max: 6 });
  try {
    await ensureEmailVerificationSchema(pool);
    await pool.query('TRUNCATE foundation_email_verifications');
    const store = new PostgresVerificationStore(pool);

    const token = 'c'.repeat(64);
    await store.save({ digest: digestToken(token), email: 'pg@example.com', expiresAt: new Date(Date.now() + 60_000) });

    // Digest-only: the raw token appears nowhere in the table.
    const { rows } = await pool.query('SELECT digest, email FROM foundation_email_verifications');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].digest, digestToken(token));
    assert.ok(!JSON.stringify(rows).includes(token));

    // Concurrent consume: exactly one winner.
    const race = await Promise.all([
      store.consume(digestToken(token)),
      store.consume(digestToken(token)),
      store.consume(digestToken(token)),
    ]);
    assert.equal(race.filter((r) => r !== null).length, 1);

    // Resend invalidates the earlier token.
    const t1 = 'd'.repeat(64), t2 = 'e'.repeat(64);
    await store.save({ digest: digestToken(t1), email: 'pg2@example.com', expiresAt: new Date(Date.now() + 60_000) });
    await store.save({ digest: digestToken(t2), email: 'pg2@example.com', expiresAt: new Date(Date.now() + 60_000) });
    assert.equal(await store.consume(digestToken(t1)), null);
    assert.ok((await store.consume(digestToken(t2)))?.email === 'pg2@example.com');

    // Expired record is burned on consume.
    await store.save({ digest: digestToken('1'.repeat(64)), email: 'pg3@example.com', expiresAt: new Date(Date.now() - 1000) });
    assert.equal(await store.consume(digestToken('1'.repeat(64))), null);
    assert.equal((await pool.query('SELECT count(*) FROM foundation_email_verifications WHERE email = $1', ['pg3@example.com'])).rows[0].count, '0');
  } finally {
    await pool.end();
  }
});
