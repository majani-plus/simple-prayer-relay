# Simple Prayer — buddy relay

This is the entire server side of [Simple Prayer](https://simpleprayer.app)'s buddy mode. It is
published so that anyone can check that it does what the app's privacy policy says it does.

The app itself is a prayer times and prayer tracking app. Your prayer log is kept on your phone. Buddy
mode is the one feature that sends what you record anywhere, and it is opt-in: if you and a friend both choose to, each of you can see
that the other prayed today. This service is what carries that between the two phones.

## What it does, in one paragraph

A phone tells the relay "the person I am paired with should know I prayed Maghrib". The relay puts
that one flag in the other phone's inbox and sends a push to wake it up. The other phone collects
the flag and the relay deletes it. If the phone never collects it, the relay deletes it after 24
hours anyway. That is the whole service.

## When you mark a prayer, step by step

This is the whole journey of one mark, in plain words. Each step names the file that does it.

**1. What your phone sends.** One `POST /send` to `relay.simpleprayer.app`
([`src/validate.ts`](src/validate.ts) checks every field):

- your phone's random id and a secret, in the `Authorization` header, to prove it is your phone.
  The relay made both when you turned buddy mode on ([`src/routes.ts`](src/routes.ts), `postDevice`);
- a random id for the link between you and this buddy;
- the day and the prayer, for example `2026-11-08` and `dhuhr`;
- one word: `prayed`, or `cleared` if you undo the mark;
- the language your app is in, and whether you want buddy notifications yourself;
- the notification text, already written by your phone in your buddy's language: "Your buddy prayed
  Dhuhr", and a copy with `{}` where a name goes. No text at all if your buddy turned notifications off.

Like any request on the internet, it also carries your IP address.

**2. What the relay keeps, and for how long.** See the table under "What it stores" below. In short:
the mark until your buddy's phone collects it, and never collectable after 24 hours; the link and your
phone's record until you leave, or 90 quiet days; a hash of your phone's secret, never the secret; the
push token, encrypted; rate-limit counters keyed by an HMAC of your IP address, never the address.
The language and the notification text are passed on and not stored. No logs.

**3. The doorbell.** The relay asks Expo to send a push to your buddy's phone, and Expo hands it to
Apple or Google ([`src/push.ts`](src/push.ts)). The push carries "Your buddy prayed Dhuhr", plus the
link id, day, prayer, word, language and notification choice. So it passes through Expo's service and
Apple's or Google's. If your buddy's phone has a name saved for you, it puts the name into the text as
the notification arrives. That name exists only on their phone and was never sent. If the push is
lost, the phone collects the mark from `GET /inbox` the next time the app opens.

**4. What is never sent.** Your name. The nickname, icon or colour either of you chose. Your location,
phone number or email. A missed prayer, an unmarked prayer, or whether a prayer was late. Excused
days, qada, streaks and history. [`src/protocol.ts`](src/protocol.ts) has no field for any of them.

**5. What someone reading the relay could learn.** A full copy of the database shows which random ids
are paired, and for marks not yet collected (24 hours at most) that a random id "prayed Dhuhr on
2026-11-08". No names, phone numbers, locations or languages. The push tokens are useless without a
key that is not in the database. Someone who controlled the relay *while it was running* could see more:
each message as it passes, with its notification text and IP address.

**6. Why it is not end-to-end encrypted.** End-to-end encryption would mean only the two phones can read
a mark. We chose not to add it. The relay would still have to know which phone to wake and when, which
is most of what there is to see. What encryption would hide is which prayer was marked, and the
notification text has no name in it. That small gain was not worth the extra parts in the app.

**7. Check it yourself.** Everything stored is in [`migrations/0001_init.sql`](migrations/0001_init.sql).
Every request the relay accepts is in [`src/routes.ts`](src/routes.ts). The app's side is
[`src/services/buddyRelay.ts`](https://github.com/majani-plus/simple-prayer-app/blob/main/src/services/buddyRelay.ts)
in the [app repository](https://github.com/majani-plus/simple-prayer-app), and the app's
[privacy policy](https://simpleprayer.app/privacy) says the same in full.

| | What it is |
|---|---|
| **Sent** | random phone id and secret, random link id, day, prayer, `prayed` or `cleared`, app language, notification choice, notification text, IP address |
| **Kept** | the mark until collected (24 hours at most); the link and the phone's record until you leave or 90 quiet days; an invite code for 24 hours; rate-limit counters for 24 hours. No logs |
| **Never sent** | name, nicknames, icons, colours, location, phone number, email, missed, late or unmarked prayers, excused days, qada, streaks, history |

## What it stores

Everything is in [`migrations/0001_init.sql`](migrations/0001_init.sql) — five tables, and the file
is commented for reading rather than for maintaining.

| table | what it is | how long it lives |
|---|---|---|
| `devices` | a random id, the SHA-256 of a secret the relay handed the phone once, and an encrypted push token | deleted when you turn buddy mode off; gone after 90 days of silence |
| `invites` | a one-time pairing code | 24 hours, or until it is used |
| `pairs` | two random device ids that agreed to see each other's flags | deleted when either of you unpairs; gone after 90 days of silence |
| `inbox` | one flag: a pair, a day, a prayer, and `prayed` or `cleared` | **deleted the moment the phone collects it, and after 24 hours regardless** |
| `quota` | counters for rate limiting, keyed by a device id or an HMAC of an IP | at most 24 hours |

There is no name, no email address, no phone number, no location, no account, no IP address, no user
agent, no language setting and no log line anywhere in it. If you dumped this database you would
learn which random identifiers are paired with which, and at most a day of "some device was told
that some pair prayed Maghrib". You could not tell whose phones they are, where they are, what
language they read, or anything about any prayer older than yesterday.

### Things it deliberately does not have

- **No logs.** Cloudflare's Workers Logs and Logpush are both off ([`wrangler.jsonc`](wrangler.jsonc)),
  and there is no `console.log` in the source. Errors go to Sentry with the request, the headers, the
  IP address and every identifier stripped out first — see [`src/sentry.ts`](src/sentry.ts) and the
  tests that pin it.
- **No push receipt polling.** Expo's delivery receipts are fetched by ticket id, which would mean
  keeping a row per push — "this device was told something at this time" — which is exactly the log
  this service promises not to keep.
- **No history.** The app shows you today and nothing else, so there is nothing older to store.
- **No admin endpoint and no search.** There is no way to ask this service who is paired with whom,
  including for us. The one listing endpoint, `GET /pairs`, returns only the caller's own link ids —
  never the other side's identifier — and exists so a phone can tell that its invite was taken and
  that a link it still shows has ended.

## What crosses the wire

One flag: `prayed`, or `cleared` when someone undoes a mark. Never "missed", never "not yet", never
an exemption, never a count or a streak. Your buddy's phone learns that you prayed; your silence
tells it nothing at all, which is the point — a blank row means "nothing arrived", not "they did not
pray", and there is no value in the protocol that could mean the second thing.

Nothing about who you are travels either. Your buddy's phone does not learn your name, and the relay
does not have one to give it. The icon, colour and nickname you see for a buddy are chosen by you,
on your phone, and stay there — so two paired people may picture each other completely differently.

The notification text is written by the **sending** phone, in the receiving phone's language, and
passed through. The relay holds no copy and no translations; it checks only that the text is short
and contains no link, so that one phone cannot use another's notification tray as a billboard.

A notification is one line — "Your buddy prayed Dhuhr". A sender may include a second version of
that line with the two characters `{}` where a name would go — "{} prayed Dhuhr". The relay passes
it through like the rest. It cannot fill the hole, because a nickname exists only on the phone that
chose it: the receiving phone substitutes its own nickname as the notification is delivered, and
shows the plain line if it has none. So a notification can read "Amina prayed Dhuhr" without the
name ever having been sent anywhere. The four Unicode bidi-isolate characters are the one kind of
format character the relay lets through, so that a name in one script can sit inside a sentence
in another.

The same flag sent twice — by the app and by a home-screen widget, say — is stored once and rings
the other phone once. An invite can be withdrawn by the phone that made it (`DELETE /invite/:code`),
after which the code no longer pairs anybody.

## Security

- Every endpoint is scoped to the caller in SQL. "Not yours" and "does not exist" are both an empty
  404, so identifiers cannot be probed.
- A device authenticates with `Authorization: Bearer <device_id>.<secret>`. The relay generates the
  secret, returns it once, and stores only its SHA-256, compared in constant time. The phone keeps the
  secret in the iOS keychain / Android keystore.
- Invite codes are 8 symbols of Crockford base32 — 2^40 — single use, valid 24 hours. Redeeming is
  rate limited to 5 attempts per 10 minutes and 20 per day per caller, on top of an edge limiter.
- Push tokens are AES-GCM encrypted with a key held only in the Worker's secrets, so a database dump
  yields nothing anyone can send to. Expo's enhanced push security is on, so a leaked token alone
  cannot be used either.
- Rate limits count per device, or per **HMAC of the IP address** with a Worker secret. Raw IP
  addresses are never written down.
- Bodies are capped at 2 KB and validated against a schema before any database work. Every statement
  is parameterised. Inbox writes upsert on `(device, pair, day, prayer)`, so a replayed request lands
  on the row that is already there instead of multiplying.
- HTTPS only, HSTS preloaded, `Cache-Control: no-store`, no cookies, and **no CORS header at all** —
  a missing header is what denies every origin, where `Access-Control-Allow-Origin: null` would have
  granted access to any null-origin context, sandboxed iframes included.
- Deliberately **no certificate pinning**: Cloudflare rotates its edge certificates, and a stale pin
  would silently break the feature for everyone.

If the relay is unreachable, the app shows blank buddy rows and tries again next time it is opened.
Nothing else in the app depends on the relay, so nothing else is affected.

## Running it

```sh
bun install
bun run test         # 56 tests against the real schema, no network
bun run typecheck

cp .dev.vars.example .dev.vars   # then fill it in
bun run db:local
bun run dev
```

Deploying needs a Cloudflare account, a D1 database (`wrangler d1 create simple-prayer-relay`, then
put its id in `wrangler.jsonc`), and four secrets:

```sh
wrangler secret put TOKEN_KEY          # openssl rand -base64 32
wrangler secret put IP_SECRET          # openssl rand -hex 32
wrangler secret put EXPO_ACCESS_TOKEN  # from expo.dev, with push permission
wrangler secret put SENTRY_DSN         # optional; without it, Sentry is not initialised at all
bun run db:remote
bun run deploy
```

## Licence

MIT, © Majani Plus LLC. See [LICENSE](LICENSE).

The licence covers the code. The Simple Prayer name, the mosque mark and the app's look are not
covered by it; see
[TRADEMARKS.md](https://github.com/majani-plus/simple-prayer-app/blob/main/TRADEMARKS.md) in the
app repository.
