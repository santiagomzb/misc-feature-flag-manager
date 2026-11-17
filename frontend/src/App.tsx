import { useEffect, useState, type FormEvent } from 'react';

type Flag = { key: string; description: string; enabled: boolean };

export default function App() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [createError, setCreateError] = useState('');
  const [toggleError, setToggleError] = useState('');
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function createFlag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating || loading || loadError) return;
    setCreating(true);
    setNotice('');
    setCreateError('');
    try {
      const response = await fetch('/api/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, description, enabled: false }),
      });
      const flag = await response.json();
      if (!response.ok) throw new Error(flag.message ?? 'Could not create flag.');
      setFlags((current) => [...current, flag]);
      setKey('');
      setDescription('');
      setNotice(`Created ${flag.key}.`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Could not create flag.');
    } finally {
      setCreating(false);
    }
  }

  async function toggleFlag(flag: Flag) {
    if (savingKey) return;
    setSavingKey(flag.key);
    setNotice('');
    setToggleError('');
    try {
      const response = await fetch(`/api/flags/${encodeURIComponent(flag.key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !flag.enabled }),
      });
      const updated = await response.json();
      if (!response.ok) throw new Error(updated.message ?? 'Could not update flag.');
      setFlags((current) => current.map((item) => item.key === updated.key ? updated : item));
      setNotice(`${updated.key} ${updated.enabled ? 'enabled' : 'disabled'}.`);
    } catch (error) {
      setToggleError(error instanceof Error ? error.message : 'Could not update flag.');
    } finally {
      setSavingKey(null);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    async function loadFlags() {
      try {
        const response = await fetch('/api/flags', { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? 'Could not load flags.');
        if (!controller.signal.aborted) setFlags(data);
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : 'Could not load flags.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadFlags();
    return () => controller.abort();
  }, [loadAttempt]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="masthead flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="brand-mark" aria-hidden="true">⚑</span>
          <span className="brand-name">Feature Flag Manager</span>
        </div>
        <span className="local-badge"><span aria-hidden="true" />Local workspace</span>
      </header>

      <main id="main">
        <div className="page-heading flex flex-wrap items-end justify-between gap-8">
          <div>
            <p className="eyebrow">A little control goes a long way</p>
            <h1>Feature flags</h1>
            <p className="intro">Create a flag. Switch it on or off. Keep things simple.</p>
          </div>
          <dl className="stats flex gap-8" aria-label="Flag counts">
            <div><dt>Total flags</dt><dd>{loading || loadError ? '—' : String(flags.length).padStart(2, '0')}</dd></div>
            <div><dt>Enabled</dt><dd>{loading || loadError ? '—' : String(flags.filter((flag) => flag.enabled).length).padStart(2, '0')}</dd></div>
          </dl>
        </div>

        <div className="workspace-grid grid items-start gap-7 lg:grid-cols-[330px_minmax(0,1fr)]">
          <section className="create-panel" aria-labelledby="create-heading">
            <p className="eyebrow">01 / Add a flag</p>
            <h2 id="create-heading">Start with a switch.</h2>
            <p className="section-description">New flags start disabled. Turn them on when you’re ready.</p>
            <form onSubmit={createFlag}>
              <fieldset disabled={creating || loading || Boolean(loadError)} className="grid gap-5">
                <div className="field">
                  <label htmlFor="flag-key">Key</label>
                  <input id="flag-key" value={key} onChange={(event) => setKey(event.target.value)} required pattern={'[a-z][a-z0-9_\\-]*'} maxLength={80} placeholder="e.g. new_checkout" autoComplete="off" spellCheck={false} aria-describedby="key-help" />
                  <p id="key-help" className="field-help">Start with a lowercase letter. Use lowercase letters, numbers, underscores or hyphens.</p>
                </div>
                <div className="field">
                  <div className="flex items-center justify-between gap-3"><label htmlFor="flag-description">Description</label><span className="optional">Optional</span></div>
                  <textarea id="flag-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="What does this flag control?" rows={3} />
                </div>
                <button type="submit" className="create-button">{creating ? 'Creating…' : 'Create flag'}<span aria-hidden="true">+</span></button>
              </fieldset>
              {createError && <p role="alert" className="error-message mt-4">{createError}</p>}
            </form>
          </section>

          <section className="flags-panel min-w-0" aria-labelledby="flags-heading">
            <div className="list-heading flex flex-wrap items-end justify-between gap-4">
              <div><p className="eyebrow">02 / Manage flags</p><h2 id="flags-heading">Your flags</h2></div>
              <p className="saved-note">Changes are saved locally</p>
            </div>
            {loading && <p role="status" className="empty-state">Loading flags…</p>}
            {loadError && <div role="alert" className="error-message error-panel"><p>{loadError}</p><button type="button" className="retry-button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</button></div>}
            {!loading && !loadError && flags.length === 0 && <div className="empty-state"><span className="empty-symbol" aria-hidden="true">⚑</span><h3>No flags yet</h3><p>Create your first flag to get started.</p></div>}
            {toggleError && <p role="alert" className="error-message my-4">{toggleError} Use the switch to try again.</p>}
            <ul className="flag-list">
              {flags.map((flag) => (
                <li key={flag.key} className="flag-row flex items-center justify-between gap-5">
                  <div className="min-w-0"><h3>{flag.key}</h3>{flag.description && <p>{flag.description}</p>}</div>
                  <div className="flag-state flex shrink-0 items-center gap-3">
                    <span className={flag.enabled ? 'state-label enabled-label' : 'state-label'}>{savingKey === flag.key ? 'Saving…' : flag.enabled ? 'Enabled' : 'Disabled'}</span>
                    <button type="button" role="switch" aria-label={flag.key} aria-checked={flag.enabled} disabled={savingKey !== null} onClick={() => toggleFlag(flag)} className="flag-switch"><span /></button>
                  </div>
                </li>
              ))}
            </ul>
            {!loading && <p role="status" className="notice" aria-live="polite">{notice}</p>}
          </section>
        </div>
      </main>

      <footer className="footer flex flex-wrap justify-between gap-3"><span>Small switches. Clear decisions.</span><span>Feature Flag Manager</span></footer>
    </div>
  );
}
