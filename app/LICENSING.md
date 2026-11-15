# Licensing RG-Present

RG-Present is licensed by the **shared RG Devs licence service** — the same one RG Dev POS and
RG HotelOS use. There is one database, one function, and one machine fingerprint across all three
products; they are told apart by a product code.

| | |
| --- | --- |
| Neon project | `rg-dev-pos-licensing` (`muddy-pond-69129549`), branch `main` |
| Function | `licence` — `https://br-dry-bread-ba49tgr7-licence.compute.c-8.eu-central-1.aws.neon.tech` |
| Product code | `rg-present` |
| Key prefix | `RGPRS-XXXXX-XXXXX-XXXXX-XXXXX` |
| Public key in the app | `o5MGqjjQquV2UJ02vyNFaCCAQPfNd7iFfQ2H4KPRXU4=` (verifies only; the private key never leaves the database) |
| Client | [`src/main/licence.js`](src/main/licence.js) |

**A key for another RG Devs product is refused** before it can take one of this licence's machine
slots, and the other way round — a church's RG-Present key will not open a POS.

## What the app does

| State | What the church sees | Can something new go on the projector? |
| --- | --- | --- |
| `grace` | Free for 90 days because this library was already here before licensing | yes |
| `trial` | 14 free days, counted down on the operator screen | yes |
| `valid` | Nothing | yes |
| `renewal_due` | "The licence runs out in N days" | yes |
| `expired` / `trial_ended` / `unlicensed` | A strip, and the licence box when they try to go live | **no** |
| `checking` | Windows has not said which computer this is yet | yes |

Three rules hold in every state:

1. **A service already on the screen is never interrupted.** The check is made only when nothing
   is live, so a licence that lapses mid-service costs nothing until the service ends.
2. **Licensing never touches the audience window.** Everything it has to say is said on the
   operator's screen.
3. **Nothing is ever deleted or withheld except the projector.** The library, editing, importing,
   saving, printing and the stage display all work unlicensed.

## Prices

Live for `rg-present` (change an amount with one `update`; it reaches the apps immediately):

| Code | Label | KES | Length |
| --- | --- | --- | --- |
| `present_week` | One Sunday (7 days) | 300 | 7 days |
| `present_month` | 1 month | 700 | 1 month |
| `present_year` | 12 months | 7,000 | 12 months |
| `present_lifetime` | Lifetime | 30,000 | 1,200 months |

```sql
update public.licence_prices set amount_kes = 350 where code = 'present_week' and product = 'rg-present';
```

A church pays with M-Pesa inside the program: the service sends an STK push to the till, watches
for the callback, and `licence_fulfil_order` extends or creates the key. The app collects the
licence even if the window was closed, because the pending order is kept on disk.

**The Microsoft Store copy cannot pay in the app** (Store policy 10.8.1), so it asks for a key.

## Issuing a key by hand

Everything below is run against the licensing project — Neon's SQL editor, or the Neon MCP tools.

```sql
-- 1. The church. (Skip if it already has a row.)
insert into public.businesses (name, contact, phone, email, town)
values ('St Paul''s Cathedral', 'Fr Mwangi', '07xx xxx xxx', 'office@example.org', 'Meru')
returning id;

-- 2. The key. SHOWN ONCE — copy it before closing the window; only its hash is stored.
--    args: business, plan, machines, paid_until, token_days, product
select public.admin_issue_licence('<business id>', 'standard', 1, (current_date + 365), 120, 'rg-present');
```

- **`paid_until`** is the date the plan runs to, or `null` for a licence with no end (lifetime).
- **`token_days`** is how long the church may stay offline before the app must renew: 120 is
  standard. The licence still works offline for that whole period.
- **`max_machines`** is almost always 1. One licence, one computer.

Send the key to the church. They type it into **Settings → Licence → Use this key**; upper or
lower case and stray spaces are all fine.

## Looking after churches

```sql
-- Who has what
select business, key_hint, plan, status, paid_until, machines_used, max_machines, last_seen_at
from public.licence_admin_list where product = 'rg-present' order by last_seen_at desc nulls last;

-- Move a licence to a new computer: free the slot, then they activate the same key there
select a.id, a.machine_name, a.app_version, a.last_seen_at
from public.machine_activations a join public.licence_keys k on k.id = a.licence_key_id
where k.key_hint = 'V7G7R' and a.status = 'active';
select public.admin_release_machine('<activation id>');

-- Extend a licence (a church that paid by hand, or an apology)
update public.licence_keys set paid_until = paid_until + 30 where key_hint = 'V7G7R' and product = 'rg-present';

-- Stop a key (refund, abuse). The app then refuses it at the next renewal; a service in progress
-- is still never interrupted.
update public.licence_keys set status = 'revoked' where key_hint = 'V7G7R' and product = 'rg-present';

-- What has been happening
select at, event, detail from public.licence_events
where licence_key_id in (select id from public.licence_keys where product = 'rg-present')
order by at desc limit 50;
```

`licence_events` is where to look first when a church says something is wrong: `activated`,
`renewed`, `purchased`, `refused_machine_limit`, `refused_wrong_product`, `unknown_key`,
`trial_refused_used`.

## Before trusting a change

The whole of the above was exercised on 15 November 2026 against the live service, and the test
rows deleted afterwards:

- a key issued with `admin_issue_licence` activates in the app, reports `valid` and the right
  paid-to date, and is accepted in lower case with spaces;
- `admin_release_machine` frees the slot, so the same key activates on another computer;
- the free trial issues once per computer per product and is refused the second time;
- a fresh install is `unlicensed` and cannot go live; a library that predates the build gets its
  90 days and can;
- with something already live, a refused licence does not take it off the screen.

**Do not test with a real church's key.** Make a `ZZ Test …` business, use it, and delete the
rows when finished.
