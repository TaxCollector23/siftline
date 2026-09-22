import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { firebaseAuth, firebaseConfigured } from "./firebase";

type ApiKey = { id: string; name: string; lastFour: string; status: string; createdAt?: string; lastUsedAt?: string; rpmLimit: number; monthlyLimit: number };
const services = firebaseAuth();

export default function Account() {
  const [user, setUser] = useState<User | null>(services?.auth.currentUser ?? null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [createdKey, setCreatedKey] = useState<string>();
  const [message, setMessage] = useState<string>();

  useEffect(() => services ? onAuthStateChanged(services.auth, setUser) : undefined, [services]);
  useEffect(() => { if (user) void loadKeys(user); else setKeys([]) }, [user]);

  async function token(target: User): Promise<string> { return target.getIdToken() }
  async function loadKeys(target: User): Promise<void> {
    const response = await fetch("/api/v1/keys", { headers: { authorization: `Bearer ${await token(target)}` } });
    const result = await response.json() as { keys?: ApiKey[]; message?: string };
    if (!response.ok) { setMessage(result.message ?? "Could not load keys."); return }
    setKeys(result.keys ?? []);
  }
  async function createKey(): Promise<void> {
    if (!user) return;
    setMessage(undefined); setCreatedKey(undefined);
    const response = await fetch("/api/v1/keys", { method: "POST", headers: { authorization: `Bearer ${await token(user)}`, "content-type": "application/json" }, body: JSON.stringify({ name: "CLI key" }) });
    const result = await response.json() as { apiKey?: string; message?: string };
    if (!response.ok || !result.apiKey) { setMessage(result.message ?? "Could not create a key."); return }
    setCreatedKey(result.apiKey); await loadKeys(user);
  }
  async function revokeKey(id: string): Promise<void> {
    if (!user) return;
    const response = await fetch(`/api/v1/keys?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { authorization: `Bearer ${await token(user)}` } });
    if (!response.ok) { const result = await response.json() as { message?: string }; setMessage(result.message ?? "Could not revoke the key."); return }
    await loadKeys(user);
  }

  return <main><SiteHeader /><section className="account wrap"><h1>Optional hosted keys.<br /><em>Local mode first.</em></h1>{!firebaseConfigured ? <div className="account-notice"><h2>Local Cutdex mode needs no account.</h2><p>The default MCP server runs in-process and makes no OpenAI API calls. Hosted keys are only for optional remote quotas; this deployment has not enabled Firebase account storage.</p></div> : !user ? <div className="account-login"><h2>Sign in only for hosted quotas.</h2><p>Local Codex-plan mode does not require a key. Hosted keys are shown once and stored server-side only as a SHA-256 hash.</p><button onClick={() => services && signInWithPopup(services.auth, services.provider)}>Continue with Google <span>↗</span></button></div> : <><div className="account-user"><span>{user.email}</span><button className="link-button" onClick={() => services && signOut(services.auth)}>Sign out</button></div><div className="key-heading"><div><h2>Hosted API keys</h2><p>Optional remote quota: 60 requests per minute and 10,000 per month by default.</p></div><button onClick={createKey}>Create key <span>＋</span></button></div>{createdKey && <div className="new-key"><strong>Copy this now. It will not be shown again.</strong><code>{createdKey}</code></div>}<div className="key-list">{keys.map((key) => <div key={key.id}><strong>{key.name}</strong><code>•••• {key.lastFour}</code><span>{key.status}</span><span>{key.lastUsedAt ? `used ${new Date(key.lastUsedAt).toLocaleDateString()}` : "never used"}</span>{key.status === "active" && <button className="link-button danger" onClick={() => revokeKey(key.id)}>Revoke</button>}</div>)}{!keys.length && <p>No keys yet.</p>}</div></>}{message && <p className="error-message">{message}</p>}</section><SiteFooter /></main>;
}

function SiteHeader() { return <header className="wrap site-header"><a className="brand" href="/">cutdex<span>_</span></a><nav><a href="/#billing">billing</a><a href="/benchmarks">benchmark</a><a href="https://github.com/TaxCollector23/siftline">github ↗</a></nav></header> }
function SiteFooter() { return <footer className="wrap footer"><span>© 2026 Cutdex</span><span>local Codex context optimization</span><span>MIT</span></footer> }
