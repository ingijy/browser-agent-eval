# Browser Agent Eval

## What this is

A small benchmark that checks whether a browser agent actually completes a shopping task, using recorded actions and an independent final-state verifier.

**4 tasks · 20 synthetic products · scripted baseline + real LLM agent · inspectable PASS / FAIL evidence.** No database, payment, or build step.

## Why I built it

An agent saying “done” does not prove that it met the user's constraints. I built this small benchmark to practice defining success, executing agents in an environment, recording their behavior, and verifying outcomes independently. Failed runs are useful evidence too.

## Architecture

```text
Task → Agent → Environment → Trajectory → Verifier → PASS / FAIL
         ↑          │                       ↑
         └── DOM observation                └── final cart + task conditions
                                                + trusted catalog
```

The harness loads a task, starts a local storefront, and opens a fresh Playwright browser context. Each action changes or inspects the page and is recorded. After termination, the harness reads the actual cart from browser storage and compares it with the rendered cart. The verifier checks product IDs against the trusted catalog.

## Agent Loop

```text
Observation → Model decision → Browser action → New observation → …
```

At every step, the LLM receives the instruction, current DOM observation, previous actions/results, and remaining step budget. It chooses one action; Playwright executes it and reads the next observation. There is no prescribed sequence, including the first action.

The model does not receive the catalog file, structured success conditions, or expected product IDs. It can open/search the catalog, inspect products, add/remove cart items, navigate, and finish. Actions are restricted to available controls and visible products. `finish` requests termination; it cannot award PASS. API errors and invalid decisions stop explicitly, with no fallback to a script.

## Scripted Baseline vs LLM Agent

| | Scripted baseline | LLM agent |
| --- | --- | --- |
| Decision logic | Predetermined stages and rules | A real model request at each step |
| Input | DOM + structured public constraints | DOM + natural-language instruction + history |
| Typical behavior | Search, filter, inspect, add, finish | Next action selected dynamically |
| Entry point | `npm run eval` | `npm run eval:llm` |
| API key | Not required | Required |

Both share the browser executor, recorder, and verifier. The baseline additionally has a filter action, so these interfaces are **not a controlled apples-to-apples model comparison**.

## Example Task

[Keyboard task](tasks/keyboard_001.json):

> 找到价格不超过500元、评分至少4.5、支持次日达的机械键盘，并加入购物车。购物车中只保留这一件商品。

Find a mechanical keyboard costing at most ¥500, rated at least 4.5, with next-day delivery. Leave exactly one unit and no other items in the cart.

```json
"success_conditions": {
  "category": "mechanical_keyboard",
  "max_price": 500,
  "min_rating": 4.5,
  "delivery": "next_day",
  "cart_quantity": 1
}
```

Several products can satisfy a task; success is not tied to a winning product ID. Price and rating boundaries are inclusive. Task validation rejects inconsistent constraints and unsupported condition fields.

## Example Trajectory

Excerpt from the preserved [real Qwen success](examples/llm_keyboard_001/trajectory.json), abbreviated to show the executed transition:

| step | observation | action | arguments (`target`) | result |
| --- | --- | --- | --- | --- |
| 2 | Catalog with visible products | `click_product` | `product_01` | Detail: ¥399, 4.7, next-day |
| 3 | Detail for `product_01` | `add_to_cart` | `product_01` | Detail page; confirmation visible in screenshot |
| 4 | Detail for `product_01` | `open_cart` | `/cart` | Cart contains `product_01`, quantity 1 |

The JSON records `step`, `observation`, `action`, `target`, and the post-action observation in `result`, plus screenshots and errors. New runs also record explicit `arguments: { "target": ... }`; older LLM examples retain their original `target` schema. LLM steps include a brief decision summary and call latency/token counts, not hidden reasoning.

Records are written after each attempted step. A rejected decision has null execution fields and an error: it is not represented as an executed action. Harness final-state inspection is separate from agent steps.

## Verification

[The verifier](src/verifier.js) checks category, price, rating, delivery, and exactly-one-item quantity against the trusted catalog. Agent-reported prices and completion claims are ignored. Runtime errors, page errors, or disagreement between stored and rendered cart also make the overall run FAIL.

| Preserved browser evidence | Result | What it demonstrates |
| --- | --- | --- |
| [Scripted baseline](examples/keyboard_001/result.json) | PASS, 8 steps | `product_01`: ¥399, rating 4.7, next-day |
| [Real Qwen success](examples/llm_keyboard_001/result.json) | PASS, 5 steps | Model-selected `open → click_product → add_to_cart → open_cart → finish` |
| [Deliberate constraint violation](examples/constraint_fail/result.json) | FAIL: `price_constraint_failed` | A scripted negative control adds the ¥529 `product_02` in a real browser, then claims completion |
| [Real Qwen invalid action](examples/llm_invalid_action_fail/result.json) | FAIL: `runner_error`, empty cart | Latest acceptance attempt selected `add_to_cart` from the catalog; validator rejected it |
| [Real Qwen one-step limit](examples/llm_step_limit_fail/result.json) | FAIL: empty cart + `runner_error` | Deliberately insufficient action budget |

The Qwen model in these examples is `qwen3.5-flash`. All listed runs are dated 2026-09-29; exact timestamps and errors are in each result. The success and step-limit examples predate final acceptance. The latest live LLM attempt failed and is retained rather than rerun until it passes. These selected development examples are **not a success-rate estimate**.

Final acceptance ran the baseline and deliberate browser constraint failure once each, one live Qwen attempt, and 19 existing focused verifier/interface checks. Interface tests use test doubles; they do not establish model capability.

## How to Run

Requires Node.js **20.12+**, npm, and a browser:

```sh
git clone https://github.com/ingijy/browser-agent-eval.git
cd browser-agent-eval
npm ci
npx playwright install chromium
npm run eval
```

On Windows with Microsoft Edge already installed, skip the browser download:

```sh
npm ci
npm run eval -- --edge
```

The evaluator starts and stops its own loopback server. PASS exits 0; FAIL or startup errors exit nonzero. This project was verified on Windows with Node 24 and Edge. The bundled Chromium path has not been exercised in this checkout. On PowerShell, use `npm.cmd` / `npx.cmd` if execution policy blocks `npm` / `npx`.

### Run the real LLM agent

Copy `.env.example` to `.env` and fill in your own provider key locally. Example configuration for the Qwen Beijing compatible endpoint:

```dotenv
LLM_API_KEY=your-local-key
LLM_MODEL=qwen3.5-flash
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_ENABLE_THINKING=false
```

```sh
npm run eval:llm -- keyboard_001 --edge
```

Omit `--edge` to use installed Chromium; add `--headed` to watch. Live calls send simulated task/page observations and action history to your configured provider and incur its API charges. A compatible provider must support Chat Completions JSON mode. Use a model and key available for your endpoint; leave `LLM_ENABLE_THINKING` blank outside providers supporting that option. Existing process environment variables override `.env`.

A run allows at most 20 decisions and 60 seconds per API call. Invalid model actions can produce FAIL; a successful model run is not guaranteed. Missing credentials, HTTP errors, and timeouts are reported explicitly.

### Inspect results without an API key

Open the printed run directory:

- `result.json`: PASS/FAIL, reasons, agent/model, final cart, runtime errors.
- `trajectory.json`: actual attempted steps and their observations/results.
- `01.png`, `02.png`, …: screenshots after executed actions.
- `task.json`, `products.json`: snapshots used for scoring.

Or inspect the committed `examples/` immediately. Recheck their recorded cart states:

```sh
npm run verify:run -- examples/llm_keyboard_001
# PASS
npm run verify:run -- examples/constraint_fail
# FAIL: price_constraint_failed (expected exit code 1)
```

These commands inspect saved state, not browser replay or runtime-error reassessment. To make a counterfactual over-budget cart in memory, use `npm run verify:run -- examples/llm_keyboard_001 --product product_02`; it does not rewrite evidence or represent a new agent run.

Other entry points: `npm start` opens a manual storefront at `http://127.0.0.1:3000`; `npm run eval -- mouse_001 --edge` selects another task. `npm test` runs existing tests with Chromium; in PowerShell use `$env:BROWSER_CHANNEL = 'msedge'` first to select Edge for browser tests.

## Project Structure

```text
tasks/                 Instructions, constraints, success conditions
data/products.json     Synthetic trusted catalog
web/                   Local shopping environment
src/baseline.js        Scripted decision logic
src/llm-agent.js        Observation-driven model decisions and validation
src/llm-adapter.js      API transport and local configuration
src/browser.js         DOM observations and browser actions
src/runner.js          Execution, trajectory recording, final-state collection
src/verifier.js        Independent constraint checks
src/verify-run.js      Offline recorded-cart checks
examples/              Portable success and failure evidence
tests/                 Existing verifier, interface, and browser checks
```

Generated `runs/`, dependencies, `.env`, logs, and an unrelated local calculator exercise are excluded from Git.

## Limitations

- Four fixed Chinese-language tasks and synthetic products demonstrate the evaluation loop, not general agent ability or production readiness.
- Observations are structured DOM data. Semantic actions simplify control; screenshots are evidence, not model input.
- Real models can choose invalid actions; validation stops such runs without an automatic retry. The latest live attempt shows this limitation.
- The environment omits accounts, inventory changes, checkout, and payments. Same-process adapters and localStorage are not an adversarial security boundary.
- Baseline and LLM receive different affordances; no comparative performance claim is made. Cross-platform installation has not been independently validated.

## Possible Extensions

More held-out tasks, additional models under aligned interfaces, more complex environments, and trajectory analysis. These are possible directions, not implemented features.
