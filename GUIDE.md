# Money Dashboard — Full Guide

How the app is structured, what's on every screen, how you enter data, and how it
all connects. (Companion to `README.md`, which covers deployment.)

---

## The core idea & how data flows

Everything is **one "plan" document** held in memory in the app: your settings,
incomes, one-off bonuses, bills, savings targets, events, and scenarios. When the
app loads it fetches that document once (`GET /api/state`). Every time you change
*anything*, the app updates the in-memory copy and, after you stop typing for
~0.8s, **auto-saves** the whole document back to the database (`PUT /api/state`).

That's the small indicator top-right: **Editing… → Saving… → Saved**. There's no
"save" button to hunt for — it's continuous, and because it's stored server-side
in Cloudflare D1, opening the app on another device shows the same data.

All the *maths* (forecasts, tax, scenarios) runs **in your browser**, instantly.
The server only stores and serves data; it never calculates. That's why sliders
and what-ifs redraw with no lag.

**"Months" are offsets from now:** month 1 = this month, month 12 = a year out.
Everywhere you see "by month 24", it means 24 months from today.

---

## Navigation

A **bottom bar** with the two everyday screens — **This Month** and **Forecast** —
plus a **⋯ More** button that opens a sheet with everything else: **Dashboard,
Scenarios, Pay calculator, Actuals, History, Plan editor, Settings**.

The design intent: the two screens you open monthly are front-and-centre; all the
depth sits one tap back.

---

## 1. Plan editor — *this is where you enter almost everything*

The master data screen. Five sections, each a list with an **+ Add** button; tap
any row to edit it in a pop-up, or the ✕ to delete.

- **Opening cash** — a single £ box: how much cash you have right now. The starting
  point for every forecast.
- **Income** — tap **+ Add**, then choose **entry mode**:
  - **Net (take-home):** enter the amount and how often (**Monthly / Quarterly /
    Annual / Weekly / 4-weekly**). Used as-is.
  - **Gross (salary):** enter the **gross annual** salary, **pension %** and
    **pension type** (Salary sacrifice / Net pay / Relief at source), any
    **salary-sacrifice items** (£/month, e.g. benefits), and an optional
    **tax code**. The app estimates take-home from 2026/27 UK (NI / rUK) tax.
  - An **Active** toggle keeps an income on file but excludes it from calculations.
- **Bills** — name, **category** (used for reporting later), **amount**,
  **frequency**, Active toggle. Frequencies are normalised to a monthly equivalent
  automatically (a £300 quarterly bill counts as £100/month).
- **Savings targets** — name, **current balance**, **monthly contribution**,
  **annual interest rate %**. A toggle **"This is a goal"** turns it into a target:
  add a **target amount** and a **by-month**. Plus a **ring-fenced** toggle (money
  you're earmarking).
- **One-off events** — a lumpy future cost (holiday, new boiler): **total cost**,
  **start month**, **duration in months**. The cost is spread evenly across those
  months in the forecast.

Everything you add here feeds every other screen.

---

## 2. This Month — the simple monthly snapshot

Read-only; it reflects your plan for the current month:

- A grid of headline numbers: **Free cash** (income − bills − events), **Safe to
  spend** (free cash *after* setting aside savings), **Current cash**, **Monthly
  income** (net), **Bills**, **Into savings**.
- **Savings targets** — each shows its balance vs goal, a progress bar, how much
  you're putting in, how much you'd *need* per month to hit the goal, and an
  **on-track / behind** badge.
- **Quick actuals** — a fast way to log what each bill actually cost this month:
  each active bill shows its planned amount and a box to type the real amount,
  with the **variance** (over = red, under = green). Saves immediately.

---

## 3. Forecast — looking ahead

- A **line chart** of **cash** (blue) and **total savings** (green) over your
  horizon, with a **12 / 24 / 36-month** switch.
- A **scenario selector** so you can chart the base plan or any what-if.
- Key figures: **end cash**, **end savings**, **lowest projected cash** (and which
  month it happens — your danger point), and **net flow per month**.
- A **"balance at month" slider** — drag to any future month to see exactly what
  your cash and savings will be then.
- **Per-target end balances** — where each savings pot lands by the end.

Savings figures **compound** monthly at each target's interest rate, and your
bonuses and events drop into the right months.

---

## 4. Scenarios — what-ifs

Two kinds, both compared live against your real plan:

- **Adjustment scenario** — "what if I changed some numbers?" Every income, bill
  and savings line gets an **override box and a slider**. Leave it blank =
  unchanged; drag/type a new value = use that; set it to **0 = cancel that item**.
  You can also attach **events that only exist in this scenario** (e.g. "what if I
  take a 3-month sabbatical"). As you drag, the forecast recomputes instantly.
- **Target scenario** — "save £X by a date." Set the amount and deadline; it tells
  you the **required monthly contribution** and whether you're **on track** (and
  which month you'd actually hit it). Tweak other lines to free up the cash and
  watch the target's projected end balance respond.
- **Compare** — tick **Base + any scenarios** and it overlays their cash lines on
  one chart, plus a table of month-1 free cash, lowest cash, end cash and end
  savings side by side.

Scenarios never change your real plan — they're overlays on top of it.

---

## 5. Pay calculator — gross → net, in detail

- **Quick calc:** a scratchpad — type a gross salary, pension %/type, salary
  sacrifice and a tax code, and see the full breakdown without saving anything.
- **Saved gross incomes:** every "gross" income from your Plan editor appears here
  with the same controls *and* a full breakdown: gross → **pension/sacrifice →
  personal allowance → taxable income → income tax → employee NI → net annual →
  net monthly**, plus a basic-rate top-up line for relief-at-source pensions.
  Edits here save back to your plan. A bar visualises gross vs tax vs NI vs net.
- **Bonuses:** add one-off bonuses (name, which month, gross, optional pension
  sacrifice %). It shows the **net** of the bonus, taxed *marginally* on top of
  your normal salary, and drops that net into the chosen month in your forecast.
- Clearly flagged as an **estimate**, not exact payroll PAYE.

The tax engine knows 2026/27 rUK: £12,570 allowance with the £100k taper,
20/40/45% bands, 8%/2% employee NI, and the three pension treatments — or it uses
your **tax code** if you enter one.

### Tax codes understood

| Code | Effect |
| --- | --- |
| `1257L` (any `nnnnL/M/N/T`) | Tax-free allowance = number × 10 (e.g. £12,570), no taper |
| `0T` | No allowance, normal bands |
| `BR` | Whole income at 20% |
| `D0` | Whole income at 40% |
| `D1` | Whole income at 45% |
| `K###` | Negative allowance — adds `### × 10` to taxable income (e.g. `K475` → +£4,750) |
| `NT` | No tax |
| `…W1` / `…M1` / `…X` | Emergency suffixes accepted and ignored for this annual estimate |

Leave the tax code blank to use the standard allowance + £100k taper.

---

## 6. Actuals — planned vs actual spending

- A **month picker** at the top.
- Every active bill listed with its **planned** amount, a box for the **actual**,
  an optional note, and the **variance**.
- A **category rollup** table: planned vs actual vs variance grouped by your bill
  categories, with totals — your monthly "where did it go" report.
- An **optional bank import** panel (open banking): connect your bank, pull
  transactions, and assign each one to a bill to fill in the actuals automatically
  (off until you add GoCardless keys — see README §Open banking).

---

## 7. History — snapshots over real time

- A **Save snapshot** button (with an optional label) captures this month's key
  figures — free cash, bills, cash balance, total savings — *and* a full copy of
  your plan, stamped with the date.
- The list shows every dated snapshot; you can delete them.
- **Trend charts** plot those figures across the real months you've saved
  snapshots — so over time you build an actual history of how your finances moved.
- **Compare two snapshots** to see exactly what changed between two dates.

This is the one place that accumulates *real history*; everything else is
"as of now."

---

## 8. Dashboard — all the charts in one place

A horizon selector plus the full set of visualisations: cash over time by scenario,
total savings by scenario, each target's balance with goal-progress bars, **spend
by category** (doughnut), **monthly cashflow** (income vs outflow bars), **free
cash by scenario**, and the snapshot trend. The "big picture" view, pulling from
the same plan.

---

## 9. Settings

- **Projection default** (12/24/36), **currency** (GBP), **tax year**.
- A **tax configuration editor** — personal allowance, the income-tax bands
  (threshold + rate), and the NI thresholds/rates. Seeded with 2026/27 figures;
  a future tax year is a single edit here rather than a code change.

---

## How the maths works (the engine)

All client-side, recomputed instantly on any change:

- **Frequency normalisation** — converts any frequency to a monthly equivalent
  (Quarterly ÷3, Annual ÷12, Weekly ×52/12, 4-weekly ×13/12).
- **Gross → net** — applies pension/sacrifice, allowance (or tax code), banded
  income tax and employee NI to estimate take-home; bonuses are taxed marginally
  on top of base salary.
- **Projection** — month by month: `net flow = income (+ bonus) − bills − events −
  savings contributions`; cash rolls forward from opening cash; each savings target
  compounds monthly (`balance × (1 + rate/12) + contribution`); it also tracks the
  lowest cash point.
- **Scenarios** — applies your overrides (blank = unchanged, 0 = cancelled) and
  scenario-specific events, then re-projects.
- **Goals** — works out the monthly contribution needed to hit a target by its
  deadline (with compound interest), and the month a goal is actually reached.

---

## How it all links together

- **Plan editor is the hub.** You enter incomes/bills/savings/events/opening cash
  there once.
- **This Month** and **Forecast** are read-only lenses on that plan (now, and
  projected forward).
- **Scenarios** overlay temporary overrides on the plan without touching it.
- **Pay calculator** reads and edits the gross incomes/bonuses in the plan.
- **Actuals** and **History/snapshots** are the *over-time* layer — what really
  happened, stored separately from the plan.
- **Settings** controls the assumptions (horizon, tax) the engine uses everywhere.
- **Every edit auto-saves** to the database, and the **client-side engine**
  recomputes all the numbers and charts instantly.
