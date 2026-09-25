import { useEffect, useMemo, useState } from "react";
import { optimizeToolCall } from "@cutdex/core";
import Account from "./Account";

type Bench = {
  toolTokenReductionPercent: number;
  estimatedContextReductionPercent: number;
  estimatedRequestTokenDeltaPercent: number;
  taskSuccessDelta: number;
  taskSuccessBaseline: number;
  taskSuccessOptimized: number;
  sampleCount: number;
  callsOptimized: number;
  correctlyUnchanged: number;
  medianOptimizationLatencyMs: number;
  baselinePassed: number;
  optimizedPassed: number;
  dataReductionPercent: number;
  baselineContextTokens: number;
  cutdexContextTokens: number;
  estimatedInputCostUsd: { baseline: number; cutdex: number; saved: number; inputPerMillion: number };
};

const fallback: Bench = {
  toolTokenReductionPercent: 81.8,
  estimatedContextReductionPercent: 81.7,
  estimatedRequestTokenDeltaPercent: 12.1,
  taskSuccessDelta: 0,
  taskSuccessBaseline: 95.8,
  taskSuccessOptimized: 95.8,
  sampleCount: 120,
  callsOptimized: 70,
  correctlyUnchanged: 50,
  medianOptimizationLatencyMs: 0.013,
  baselinePassed: 115,
  optimizedPassed: 115,
  dataReductionPercent: 81.8,
  baselineContextTokens: 5_383_330,
  cutdexContextTokens: 984_190,
  estimatedInputCostUsd: { baseline: 16.15, cutdex: 2.95, saved: 13.20, inputPerMillion: 3 },
};

const sampleTask = "Find the five most recent failed orders";
const sampleQuery = "SELECT * FROM orders;";

function Number({ value, suffix = "%" }: { value: number; suffix?: string }) { return <>{value.toFixed(1)}{suffix}</>; }

function measuredReduction(bench: Bench): number {
  return bench.baselineContextTokens ? Math.round((1 - bench.cutdexContextTokens / bench.baselineContextTokens) * 1000) / 10 : bench.estimatedContextReductionPercent;
}

export default function App() {
  const [bench, setBench] = useState<Bench>(fallback);
  const [task, setTask] = useState(sampleTask);
  const [query, setQuery] = useState(sampleQuery);

  useEffect(() => {
    fetch(`/latest.json?version=${Date.now()}`)
      .then((response) => response.ok ? response.json() : fallback)
      .then((value: Partial<Bench>) => setBench({ ...fallback, ...value }))
      .catch(() => undefined);
  }, []);

  const result = useMemo(() => optimizeToolCall({ task, tool: { name: "database.query", kind: "READ", readOnly: true }, request: { query } }), [task, query]);
  if (window.location.pathname === "/benchmarks") return <Benchmarks bench={bench} />;
  if (window.location.pathname === "/account") return <Account />;

  return <main>
    <Header />
    <section className="hero wrap">
      <div className="hero-copy-block">
        <p className="eyebrow">Local-first · source-side optimization</p>
        <h1>Cut eligible tool context by <strong><Number value={bench.estimatedContextReductionPercent} /></strong></h1>
        <p><strong>Cutdex narrows read-only SQL and GraphQL requests before the source returns data, so less irrelevant tool output reaches the model.</strong></p>
        <div className="hero-proof"><b><Number value={bench.estimatedContextReductionPercent} /> less measured tool context</b><span>{bench.sampleCount} deterministic cases · {bench.taskSuccessDelta.toFixed(1)}pp task-success change</span></div>
        <div className="hero-links"><a className="primary-link" href="#connect">Install local mode <span>↓</span></a><a href="#proof">See the boundary <span>↓</span></a></div>
        <p className="claim-note">Fixture result, not a Codex bill. Your real savings depend on how many eligible reads your agent makes.</p>
      </div>
      <TerminalArt />
    </section>

    <section className="reality wrap" id="proof">
      <div className="reality-lede"><p className="eyebrow">The honest boundary</p><h2>One command wires the path. It does not rewrite every Codex tool.</h2><p>That distinction is the product: Cutdex is deterministic middleware for eligible structured reads, not a claim that it can intercept shell, browser, filesystem, reasoning, or every MCP server.</p></div>
      <div className="reality-grid">
        <div><strong>Guaranteed locally</strong><p>The SQL/GraphQL transformer makes no model request and passes writes, unknown tools, and unsupported shapes through unchanged.</p></div>
        <div><strong>Codex integration</strong><p><code>connect codex</code> installs an MCP tool plus managed instructions. Codex must choose that tool before a broad read.</p></div>
        <div><strong>Strongest measurement</strong><p><code>executeWithCutdex</code> wraps an executor, compacts the structured result, and avoids an extra model round-trip.</p></div>
      </div>
    </section>

    <section className="truth wrap"><h2>What it actually changes</h2><div className="truth-grid"><div><strong>Before</strong><code>SELECT * FROM orders;</code><span>42 fields × 1,000 rows</span></div><div className="rewrite-arrow">→</div><div><strong>After</strong><code>SELECT id, status, created_at<br />FROM orders<br />WHERE status = 'failed'<br />ORDER BY created_at DESC<br />LIMIT 5;</code><span>3 fields × 5 rows</span></div></div><p>Only read requests are narrowed. Writes, unsupported syntax, and ambiguous tasks pass through unchanged.</p></section>

    <section className="usage-proof wrap" id="usage"><div className="usage-intro"><h2>What the run costs.</h2><p>This {bench.sampleCount}-case fixture measures the request plus returned result. At the illustrative $<Number value={bench.estimatedInputCostUsd.inputPerMillion} suffix="" /> per million input tokens:</p></div><div className="usage-cards"><div className="usage-card"><span>Without CutDex</span><strong>{bench.baselineContextTokens.toLocaleString()} tokens</strong><small>${bench.estimatedInputCostUsd.baseline.toFixed(2)} input cost</small></div><div className="usage-card usage-card-after"><span>With CutDex</span><strong>{bench.cutdexContextTokens.toLocaleString()} tokens</strong><small>${bench.estimatedInputCostUsd.cutdex.toFixed(2)} input cost</small></div><div className="usage-saved"><span>Measured saving</span><strong>${bench.estimatedInputCostUsd.saved.toFixed(2)}</strong><small>{bench.estimatedContextReductionPercent}% less input context</small></div></div><p className="usage-note">This is not a Codex bill: it excludes system prompts, history, reasoning, generated output, and provider-specific tokenization. For an actual run, compare paired provider usage with <code>cutdex analyze traces.jsonl</code>.</p><div className="usage-loss"><strong>What is lost</strong><span>Only unrequested fields and rows from eligible read results. Writes, reasoning, code generation, and ambiguous calls are not compressed.</span></div></section>

    <ComparisonTable bench={bench} />

    <section className="billing-boundary wrap"><h2>The model stays in your Codex plan.</h2><div className="boundary-grid"><div><strong>Cutdex</strong><p>Runs locally, makes zero model requests, and does not call the OpenAI API.</p></div><div><strong>Codex</strong><p>When you sign in with ChatGPT, Codex uses the plan's Work/Codex allowance. That allowance is not an API-token invoice and varies with the task, model, reasoning, and output.</p></div><div><strong>Boundary</strong><p>Only eligible structured reads are narrowed. Reasoning and unrelated tools remain outside this path.</p></div></div><p className="billing-source">OpenAI documents the current plan-versus-API boundary <a href="https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex" rel="noreferrer">here ↗</a>. Cutdex cannot read your account allowance, so it does not publish a subscription-savings percentage.</p></section>

    <section className="next-steps wrap"><p className="eyebrow">Keep cutting responsibly</p><h2>Three levers that reduce real usage.</h2><div className="next-grid"><div><strong>Own the executor</strong><p>Use <code>executeWithCutdex</code> when your app owns the source-tool call. It optimizes and compacts in one adapter call, with no extra model round-trip.</p></div><div><strong>Measure paired runs</strong><p>Record provider-reported input and output tokens for the same task with and without Cutdex, then run <code>cutdex analyze traces.jsonl</code>.</p></div><div><strong>Reduce retries</strong><p>Prefer one bounded read with explicit fields, filters, sort, and limit. Keep ambiguous requests, writes, and already-narrow calls unchanged.</p></div></div></section>

    <section className="connect wrap" id="connect"><h2>Connect Codex in two commands.</h2><div className="steps"><div><b>1</b><div><h3>Register the local optimizer</h3><p>No API key is required for the default path.</p><CopyCommand value="npx cutdex@latest connect codex" /></div></div><div><b>2</b><div><h3>Restart Codex and verify</h3><p>Run <code>/mcp</code> and then check the local integration.</p><CopyCommand value="cutdex doctor" /></div></div></div><div className="connection-note"><strong>Optional hosted mode</strong><p>Hosted keys are only for remote quotas. The local MCP path is the plan-safe default and makes no OpenAI API call.</p><strong>Scope</strong><p>Codex mode reduces eligible structured read payloads when Codex follows the instruction. It does not reduce reasoning or intercept built-in shell, browser, filesystem, or other MCP tools.</p></div></section>

    <section className="playground wrap" id="playground"><div className="play-head"><h2>See a request shrink.</h2><p>This demo runs locally in the browser. No key or model call.</p></div><div className="play-grid"><label>Task<textarea value={task} onChange={(event) => setTask(event.target.value)} /></label><label>Original tool call<textarea value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="output"><div className="output-top"><span>Optimized request</span><span className={result.safety === "safe" ? "safe-status" : "pass-status"}>{result.safety === "safe" ? "Narrowed safely" : "Passed through"}</span></div><pre>{result.optimizedRequest.query}</pre><div className="explain-list" aria-live="polite">{result.applied.length ? result.applied.map((item) => <div key={item.name}><b>{item.name}</b><span>{item.reason}</span></div>) : <div><b>PASS THROUGH</b><span>{result.explanation[0] ?? "No safe transformation found."}</span></div>}</div></div></div></section>
    <Footer />
  </main>;
}

function CopyCommand({ value }: { value: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    setState("copied");
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const input = document.createElement("textarea");
        input.value = value; input.setAttribute("readonly", ""); input.style.position = "fixed"; input.style.opacity = "0";
        document.body.appendChild(input); input.select();
        if (!document.execCommand("copy")) throw new Error("copy unavailable");
        input.remove();
      }
      window.setTimeout(() => setState("idle"), 1600);
    } catch { setState("failed"); }
  }
  return <span className="copy-command"><code>{value}</code><button type="button" onClick={copy} aria-label={`Copy ${value}`}>{state === "copied" ? "Copied" : state === "failed" ? "Select manually" : "Copy"}</button></span>;
}

function Header() { return <header className="wrap site-header"><a className="brand" href="/" aria-label="Cutdex home">cutdex<span>_</span></a><nav><a href="/#usage">usage</a><a href="/#comparison">compare</a><a href="/#connect">connect</a><a href="/#playground">playground</a><a href="/benchmarks">benchmark</a><a href="https://github.com/TaxCollector23/siftline" rel="noreferrer">github ↗</a></nav></header>; }
function Footer() { return <footer className="wrap footer"><span>© 2026 Cutdex</span><span>source-side request optimization</span><span>MIT</span></footer>; }
function TerminalArt() { return <div className="terminal-art" aria-label="CutDex CLI setup example"><div className="terminal-bar"><span>terminal</span><span>● ● ●</span></div><pre><span className="terminal-orange">╭──────────────────────────╮{`\n`}│          CutDex          │{`\n`}│  source-side optimizer   │{`\n`}╰──────────────────────────╯</span>{`\n\n`}<span className="terminal-prompt">$</span> cutdex connect codex{`\n`}<span className="terminal-orange">✓ local MCP + AGENTS.md installed</span>{`\n\n`}<span className="terminal-prompt">$</span> cutdex doctor{`\n`}<span className="terminal-orange">✓ no OpenAI API calls</span></pre></div>; }
function ComparisonTable({ bench }: { bench: Bench }) {
  const reduction = measuredReduction(bench);
  const savedTokens = bench.baselineContextTokens - bench.cutdexContextTokens;
  return <section className="comparison wrap" id="comparison"><div className="comparison-intro"><div><p className="eyebrow">Measured comparison</p><h2>Same fixture. Different billing boundary.</h2></div><p>The calculation below is deliberately scoped: it models the eligible request plus returned result. It does not convert a ChatGPT subscription allowance into API tokens.</p></div><div className="comparison-formula"><span>Calculation</span><code>({bench.baselineContextTokens.toLocaleString()} − {bench.cutdexContextTokens.toLocaleString()}) ÷ {bench.baselineContextTokens.toLocaleString()} = {reduction.toFixed(1)}%</code><small>{savedTokens.toLocaleString()} approximate input-context tokens removed across {bench.sampleCount} deterministic cases.</small></div><div className="comparison-scroll"><table className="comparison-table"><thead><tr><th scope="col">Run</th><th scope="col">Measured result</th><th scope="col">Billing / allowance view</th><th scope="col">Safe claim</th></tr></thead><tbody><tr><th scope="row">Regular API-style run</th><td>{bench.baselineContextTokens.toLocaleString()} input-context tokens</td><td>${bench.estimatedInputCostUsd.baseline.toFixed(2)} at an illustrative ${bench.estimatedInputCostUsd.inputPerMillion}/M input rate</td><td>Baseline for this fixture</td></tr><tr className="comparison-highlight"><th scope="row">API-style run + Cutdex</th><td>{bench.cutdexContextTokens.toLocaleString()} tokens · {reduction.toFixed(1)}% lower</td><td>${bench.estimatedInputCostUsd.cutdex.toFixed(2)} · ${bench.estimatedInputCostUsd.saved.toFixed(2)} modeled saving at the same illustrative rate</td><td>Measured fixture reduction, not a universal API price</td></tr><tr><th scope="row">Codex signed into ChatGPT</th><td>Not exposed by this fixture</td><td>Uses the plan's Work/Codex allowance or applicable credits, not API pricing</td><td>No subscription-usage percentage is published</td></tr><tr><th scope="row">Cutdex local optimizer</th><td>0 model requests · {bench.medianOptimizationLatencyMs.toFixed(3)}ms median local transform</td><td>$0 OpenAI API calls in local mode</td><td>Middleware verified; source-tool and model usage remain outside Cutdex</td></tr></tbody></table></div><p className="comparison-note">Task success stayed {bench.taskSuccessBaseline.toFixed(1)}% → {bench.taskSuccessOptimized.toFixed(1)}% ({bench.taskSuccessDelta.toFixed(1)}pp). {bench.callsOptimized} calls changed and {bench.correctlyUnchanged} were correctly left alone. The benchmark uses local deterministic fixtures and approximate UTF-8-byte tokenization.</p></section>;
}
function Benchmarks({ bench }: { bench: Bench }) { return <main><Header /><section className="bench-page wrap"><p className="eyebrow">Deterministic fixture · generated from the repo</p><h1>Measure the part Cutdex can change.</h1><p className="hero-copy">This deterministic suite measures read-result and request-context reduction across {bench.sampleCount} tasks. It does not claim lower provider billing or more subscription usage.</p><div className="bench-table"><div><span>Tool-result token reduction</span><strong><Number value={bench.toolTokenReductionPercent} /></strong></div><div><span>Approx. tool-context reduction</span><strong><Number value={bench.estimatedContextReductionPercent} /></strong></div><div><span>Task-success delta</span><strong>{bench.taskSuccessDelta.toFixed(1)}pp</strong></div><div><span>Quality gate</span><strong>{bench.taskSuccessDelta >= -1 ? "PASS" : "FAIL"}</strong></div></div><div className="method"><h2>What the number means</h2><div><p>Baseline: {bench.baselineContextTokens.toLocaleString()} measured input-context tokens, about ${bench.estimatedInputCostUsd.baseline.toFixed(2)} at ${bench.estimatedInputCostUsd.inputPerMillion}/M. Cutdex: {bench.cutdexContextTokens.toLocaleString()} tokens, about ${bench.estimatedInputCostUsd.cutdex.toFixed(2)}. Estimated saving: ${bench.estimatedInputCostUsd.saved.toFixed(2)}.</p><p>The context figure excludes system prompts, conversation history, reasoning, generated output, and provider tokenization. Run <code>cutdex analyze traces.jsonl</code> against paired provider traces for actual usage and cost.</p><a className="primary-link" href="https://github.com/TaxCollector23/siftline/blob/main/benchmarks/results/latest.md" rel="noreferrer">Open the generated report <span>↗</span></a></div></div></section><Footer /></main>; }
