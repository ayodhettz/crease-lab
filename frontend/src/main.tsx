import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDot,
  Crosshair,
  Film,
  Flag,
  Focus,
  Layers,
  LoaderCircle,
  MapPin,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react';
import { api, json } from './api';
import { analyse, segments } from './geometry';
import { PitchMap } from './PitchMap';
import type {
  Calibration,
  Delivery,
  Job,
  Point,
  Session,
  SessionState,
  SessionSummary,
} from './types';
import './style.css';

type Mode = 'inspect' | 'bounce' | 'track' | 'calibrate';
const clone = <T,>(value: T): T => structuredClone(value);
const formatTime = (frame: number, fps: number) =>
  `${Math.floor(frame / fps / 60)
    .toString()
    .padStart(2, '0')}:${((frame / fps) % 60).toFixed(2).padStart(5, '0')}`;

function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState<SessionState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [undo, setUndo] = useState<SessionState[]>([]);
  const [selected, setSelected] = useState('');
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loadedFrame, setLoadedFrame] = useState(-1);
  const [mode, setMode] = useState<Mode>('inspect');
  const [calPoints, setCalPoints] = useState<Point[]>([]);
  const [calWidth, setCalWidth] = useState(3.05);
  const [calLength, setCalLength] = useState(20.12);
  const [filter, setFilter] = useState('all');
  const [bowlerFilter, setBowlerFilter] = useState('all');
  const [overlay, setOverlay] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [restoreRevision, setRestoreRevision] = useState('');
  const [deletePending, setDeletePending] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const selectedDelivery = draft?.deliveries.find((d) => d.id === selected);
  const visible =
    draft?.deliveries.filter(
      (d) =>
        (filter === 'all' || d.status === filter) &&
        (bowlerFilter === 'all' || d.bowler === bowlerFilter),
    ) || [];
  const analysis = draft ? analyse(visible, draft.calibration, draft.target) : null;
  const activeJob = jobs.find(
    (j) => j.delivery_id === selected && (j.status === 'queued' || j.status === 'running'),
  );
  const latestJob = jobs.find((j) => j.delivery_id === selected);

  async function refreshList() {
    setSessions(await api<SessionSummary[]>('/sessions'));
  }
  useEffect(() => {
    refreshList().catch((e) => setError(e.message));
  }, []);

  const acceptSession = (s: Session) => {
    setSession(s);
    setDraft(clone(s.state));
    setDirty(false);
    setUndo([]);
    setSelected(s.state.deliveries[0]?.id || '');
    setFrame(s.state.deliveries[0]?.start || 0);
    setLoadedFrame(-1);
    setMode('inspect');
    setPlaying(false);
    setJobs([]);
    setFilter('all');
    setBowlerFilter('all');
    setCalPoints([]);
    setDeletePending(false);
    setShowSettings(false);
    setRestoreRevision('');
    if (s.state.calibration) {
      setCalWidth(s.state.calibration.width);
      setCalLength(s.state.calibration.length);
    }
  };

  async function openSession(id: string) {
    if (busy) return;
    if (dirty) {
      setPendingSwitch(id);
      return;
    }
    setBusy('Loading session');
    try {
      acceptSession(await api<Session>(`/sessions/${id}`));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  function edit(fn: (s: SessionState) => void) {
    if (!draft || busy) return;
    const next = clone(draft);
    fn(next);
    setUndo((history) => [...history.slice(-39), clone(draft)]);
    setDraft(next);
    setDirty(true);
    setNotice('');
  }
  function editDelivery(fn: (d: Delivery) => void) {
    edit((s) => {
      const d = s.deliveries.find((d) => d.id === selected);
      if (d) fn(d);
    });
  }

  async function save(): Promise<Session | null> {
    if (!session || !draft) return null;
    setBusy('Saving');
    setError('');
    try {
      const s = await api<Session>(`/sessions/${session.id}`, {
        method: 'PUT',
        ...json({ revision: session.revision, state: draft }),
      });
      setSession(s);
      setDraft(clone(s.state));
      setDirty(false);
      setUndo([]);
      setNotice(`Saved revision ${s.revision}`);
      await refreshList();
      return s;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy('');
    }
  }

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!session) return;
    let live = true;
    const poll = () =>
      api<Job[]>(`/sessions/${session.id}/jobs`)
        .then((result) => {
          if (live) setJobs(result);
        })
        .catch(() => {});
    poll();
    const timer = setInterval(poll, 1500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [session?.id]);

  const seek = useCallback(
    (next: number) => {
      if (session) setFrame(Math.max(0, Math.min(session.video.frames - 1, next)));
    },
    [session],
  );

  // Frame preview is intentionally sampled; analysis always uses original frames.
  useEffect(() => {
    if (!playing || !session) return;
    const timer = setInterval(
      () =>
        setFrame((f) => {
          const last = selectedDelivery?.end ?? session.video.frames - 1;
          const next = f + Math.max(1, Math.round(session.video.fps / 12));
          if (next >= last) {
            setPlaying(false);
            return last;
          }
          return next;
        }),
      1000 / 12,
    );
    return () => clearInterval(timer);
  }, [playing, session?.id, selectedDelivery?.id]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag)) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setPlaying(false);
        seek(frame + 1);
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setPlaying(false);
        seek(frame - 1);
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [frame, seek]);

  async function createDemo() {
    if (dirty) {
      setError('Save your current session before opening a demo.');
      return;
    }
    setBusy('Creating demo');
    setError('');
    try {
      acceptSession(await api<Session>('/sessions/demo', { method: 'POST' }));
      await refreshList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function importVideo(file: File) {
    if (dirty) {
      setError('Save your current session before importing another recording.');
      return;
    }
    setBusy('Importing recording');
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      acceptSession(await api<Session>('/sessions/import', { method: 'POST', body: form }));
      await refreshList();
      setNotice('Recording imported. Start by calibrating the pitch.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  function selectDelivery(id: string) {
    setSelected(id);
    setPlaying(false);
    setMode('inspect');
    const d = draft?.deliveries.find((d) => d.id === id);
    if (d) setFrame(d.bounce?.frame ?? d.start);
  }

  function addDelivery() {
    if (!session || !draft) return;
    if (frame >= session.video.frames - 1) {
      setError('Move to an earlier frame before adding a delivery.');
      return;
    }
    const id = crypto.randomUUID();
    edit((s) =>
      s.deliveries.push({
        id,
        label: `Delivery ${String(s.deliveries.length + 1).padStart(2, '0')}`,
        bowler: '',
        tag: '',
        start: frame,
        end: Math.min(session.video.frames - 1, frame + Math.round(session.video.fps * 2)),
        status: 'unreviewed',
        bounce: null,
        track: [],
      }),
    );
    setSelected(id);
    setMode('inspect');
  }

  function mark(e: React.MouseEvent<SVGSVGElement>) {
    if (!image.current || mode === 'inspect') return;
    if (loadedFrame !== frame) {
      setError('Wait for this frame to finish loading before marking it.');
      return;
    }
    const box = e.currentTarget.getBoundingClientRect();
    const point = {
      x: Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (e.clientY - box.top) / box.height)),
    };
    setPlaying(false);
    if (mode === 'calibrate') {
      if (calPoints.length < 4) setCalPoints([...calPoints, point]);
      return;
    }
    if (!selectedDelivery) {
      setError('Add or select a delivery first.');
      return;
    }
    if (frame < selectedDelivery.start || frame > selectedDelivery.end) {
      setError('Move inside the selected delivery before marking a point.');
      return;
    }
    editDelivery((d) => {
      d.status = 'unreviewed';
      if (mode === 'bounce') d.bounce = { ...point, frame, provenance: 'manual' };
      if (mode === 'track')
        d.track = [
          ...d.track.filter((p) => p.frame !== frame),
          { ...point, frame, provenance: 'manual' as const, score: null },
        ].sort((a, b) => a.frame - b.frame);
    });
  }

  async function runTracker() {
    if (!session || !selectedDelivery) return;
    const current = dirty ? await save() : session;
    if (!current) return;
    setBusy('Starting tracker');
    setError('');
    try {
      const seed = selectedDelivery.track.find((p) => p.frame === frame);
      const job = await api<Job>(`/sessions/${session.id}/jobs`, {
        method: 'POST',
        ...json({ delivery_id: selected, seed: seed || null }),
      });
      setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  const cornerNames = [
    'far left (batter end)',
    'far right (batter end)',
    'near right (bowler end)',
    'near left (bowler end)',
  ];
  const frameUrl = session ? `/api/sessions/${session.id}/frame/${frame}` : '';
  const bowlerNames = [...new Set(draft?.deliveries.map((d) => d.bowler).filter(Boolean))];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Crease Lab home">
          <span className="brand-mark">
            <Activity size={23} />
          </span>
          <span>
            crease<span className="brand-light">lab</span>
            <small>THE PRACTICE WORKSPACE</small>
          </span>
        </a>
        <div className="sidebar-section">
          WORKSPACE <span>LOCAL</span>
        </div>
        <button className="nav-active" onClick={() => setShowSettings(false)}>
          <Layers size={17} /> Net sessions <span className="count">{sessions.length}</span>
        </button>
        <div className="session-heading">
          YOUR SESSIONS
          <button
            aria-label="Import a recording"
            onClick={() => upload.current?.click()}
            disabled={!!busy}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="session-list">
          {sessions.map((s) => (
            <button
              className={`session-link ${session?.id === s.id ? 'selected' : ''}`}
              key={s.id}
              onClick={() => openSession(s.id)}
            >
              <Film size={15} />
              <span>
                {s.name}
                <small>
                  {s.deliveries} deliveries {s.video.synthetic ? ' / demo' : ''}
                </small>
              </span>
              {session?.id === s.id && <span className="session-dot" />}
            </button>
          ))}
          {!sessions.length && (
            <p className="sidebar-empty">Your practice sessions will live here.</p>
          )}
        </div>
        <button
          className="sidebar-import"
          onClick={() => upload.current?.click()}
          disabled={!!busy}
        >
          <Upload size={16} /> Import footage
        </button>
        <div className="local-note">
          <span className="online-dot" /> On your machine<small>Your recordings stay local.</small>
        </div>
        <div className="sidebar-footer">
          <div className="avatar">CL</div>
          <div>
            Practice, with perspective.<small>Crease Lab / v0.1</small>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span className="slash">/</span>
            <b>Net sessions</b>
            {session && (
              <>
                <span className="slash">/</span>
                <span>{session.video.synthetic ? 'Demo session' : 'Session review'}</span>
              </>
            )}
          </div>
          <select
            className="mobile-sessions"
            aria-label="Choose session"
            value={session?.id || ''}
            onChange={(e) => {
              if (e.target.value === '__import') upload.current?.click();
              else if (e.target.value) openSession(e.target.value);
            }}
          >
            <option value="">Choose a session</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="__import">+ Import recording</option>
          </select>
          <span className="top-status">
            <span className="online-dot" /> LOCAL WORKSPACE
          </span>
        </header>
        <input
          ref={upload}
          type="file"
          accept="video/mp4,.mp4"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importVideo(f);
            e.target.value = '';
          }}
        />
        <div className="main-content">
          {(error || notice || busy) && (
            <div className={`message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
              {busy && <LoaderCircle size={16} className="spin" />}
              {error || busy || notice}
              <button
                aria-label="Dismiss message"
                onClick={() => {
                  setError('');
                  setNotice('');
                }}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {!session || !draft ? (
            <section className="welcome">
              <div className="eyebrow">
                <CircleDot size={14} /> ONE CAMERA. A CLEARER PICTURE.
              </div>
              <h1>
                Every delivery
                <br />
                <em>tells you something.</em>
              </h1>
              <p>
                Turn your net footage into a picture of your bowling.
                <br />
                Review ball paths, mark the bounce, and find your length.
              </p>
              <div className="welcome-actions">
                <button
                  className="primary"
                  onClick={() => upload.current?.click()}
                  disabled={!!busy}
                >
                  <Upload size={17} /> Import a recording
                </button>
                <button className="secondary" onClick={createDemo} disabled={!!busy}>
                  <Play size={16} /> Explore the demo
                </button>
              </div>
              <div className="welcome-pitch">
                <div className="mini-pitch">
                  <span />
                  <span />
                  <span />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div>
                  <b>Built for your next net session.</b>
                  <p>
                    A fixed bowler-end camera, an MP4 recording, and a few ground markers are all
                    you need to get started.
                  </p>
                  <small>Assisted analysis. Manual control. No accuracy claims yet.</small>
                </div>
              </div>
              <div className="welcome-steps">
                <span>
                  <b>01</b> Set up your pitch
                </span>
                <span>
                  <b>02</b> Review your deliveries
                </span>
                <span>
                  <b>03</b> See the patterns
                </span>
              </div>
            </section>
          ) : (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">
                    NET SESSION <span>/</span>{' '}
                    {session.video.synthetic ? 'SYNTHETIC DEMO' : 'RECORDED FOOTAGE'}
                  </div>
                  <h1>{draft.name}</h1>
                  <p>
                    {session.video.width} × {session.video.height} <span>·</span>{' '}
                    {session.video.fps.toFixed(0)} fps <span>·</span>{' '}
                    {formatTime(session.video.frames - 1, session.video.fps)} <span>·</span>{' '}
                    {dirty ? 'Unsaved changes' : `Saved revision ${session.revision}`}
                  </p>
                </div>
                <div className="heading-actions">
                  <button
                    className="icon-button"
                    aria-label="Session settings"
                    onClick={() => setShowSettings(!showSettings)}
                  >
                    <Settings2 size={18} />
                  </button>
                  <button
                    className="secondary"
                    disabled={!undo.length || !!busy}
                    onClick={() => {
                      if (undo.length) {
                        setDraft(undo[undo.length - 1]);
                        setUndo(undo.slice(0, -1));
                        setDirty(true);
                      }
                    }}
                  >
                    <RotateCcw size={15} /> Undo
                  </button>
                  <button className="primary" onClick={save} disabled={!dirty || !!busy}>
                    <Save size={16} /> {dirty ? 'Save changes' : 'Saved'}
                  </button>
                </div>
              </section>
              {showSettings && (
                <section className="settings panel">
                  <div className="panel-heading">
                    <h2>Session settings</h2>
                    <button
                      className="icon-button"
                      aria-label="Close settings"
                      onClick={() => setShowSettings(false)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="settings-grid">
                    <label>
                      Session name
                      <input
                        value={draft.name}
                        onChange={(e) =>
                          edit((s) => {
                            s.name = e.target.value;
                          })
                        }
                      />
                    </label>
                    <label>
                      Session notes
                      <textarea
                        value={draft.notes}
                        onChange={(e) =>
                          edit((s) => {
                            s.notes = e.target.value;
                          })
                        }
                      />
                    </label>
                    <div>
                      <label>
                        Restore a saved revision
                        <select
                          value={restoreRevision}
                          onChange={(e) => setRestoreRevision(e.target.value)}
                        >
                          <option value="">Choose revision</option>
                          {session.history.map((h) => (
                            <option value={h.revision} key={h.revision}>
                              Revision {h.revision}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="secondary"
                        disabled={!restoreRevision}
                        onClick={async () => {
                          try {
                            const old = await api<{ state: SessionState }>(
                              `/sessions/${session.id}/revisions/${restoreRevision}`,
                            );
                            edit((s) => Object.assign(s, old.state));
                            setSelected(old.state.deliveries[0]?.id || '');
                            setNotice('Revision loaded as a draft. Save to keep it.');
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        Load revision as draft
                      </button>
                    </div>
                    <div className="delete-section">
                      <b>Delete this session</b>
                      <p>
                        Removes the imported copy and analysis. Your original recording is retained.
                      </p>
                      {deletePending ? (
                        <div className="button-row">
                          <button
                            className="danger"
                            onClick={async () => {
                              try {
                                await api(`/sessions/${session.id}`, { method: 'DELETE' });
                                setSession(null);
                                setDraft(null);
                                setDirty(false);
                                await refreshList();
                              } catch (e) {
                                setError((e as Error).message);
                              }
                            }}
                          >
                            Confirm delete
                          </button>
                          <button className="secondary" onClick={() => setDeletePending(false)}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button className="danger" onClick={() => setDeletePending(true)}>
                          <Trash2 size={14} /> Delete session
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              )}
              <section className="metrics">
                <Metric
                  title="DELIVERIES"
                  value={String(visible.length).padStart(2, '0')}
                  detail={`${analysis?.reviewed.length || 0} reviewed with bounce`}
                  icon={<Layers size={17} />}
                />
                <Metric
                  title="ON TARGET"
                  value={analysis?.hitRate == null ? '—' : `${Math.round(analysis.hitRate * 100)}%`}
                  detail={`${analysis?.excluded || 0} excluded from statistics`}
                  icon={<Crosshair size={17} />}
                />
                <Metric
                  title="AVERAGE LENGTH"
                  value={analysis?.mean ? analysis.mean.y.toFixed(2) : '—'}
                  unit={analysis?.mean ? 'm' : ''}
                  detail="From the batter-end stump line"
                  icon={<MapPin size={17} />}
                />
                <Metric
                  title="LENGTH SPREAD"
                  value={analysis?.spread ? analysis.spread.y.toFixed(2) : '—'}
                  unit={analysis?.spread ? 'm' : ''}
                  detail="Population standard deviation"
                  icon={<Activity size={17} />}
                />
              </section>
              <div className="analysis-layout">
                <section className="review panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        Delivery review{' '}
                        <span className="badge">
                          {selectedDelivery?.label || 'NO DELIVERY SELECTED'}
                        </span>
                      </h2>
                    </div>
                    <button
                      className={`text-button ${overlay ? 'active' : ''}`}
                      aria-pressed={overlay}
                      onClick={() => setOverlay(!overlay)}
                    >
                      <Layers size={14} /> Overlay all
                    </button>
                  </div>
                  <div className="review-toolbar">
                    <button
                      className={mode === 'inspect' ? 'selected-tool' : ''}
                      onClick={() => setMode('inspect')}
                    >
                      <Focus size={14} /> Inspect
                    </button>
                    <button
                      className={mode === 'bounce' ? 'selected-tool' : ''}
                      disabled={!selectedDelivery}
                      onClick={() => {
                        setMode('bounce');
                        setPlaying(false);
                      }}
                    >
                      <MapPin size={14} /> Mark bounce
                    </button>
                    <button
                      className={mode === 'track' ? 'selected-tool' : ''}
                      disabled={!selectedDelivery}
                      onClick={() => {
                        setMode('track');
                        setPlaying(false);
                      }}
                    >
                      <CircleDot size={14} /> Mark ball
                    </button>
                    <button
                      className={mode === 'calibrate' ? 'selected-tool' : ''}
                      onClick={() => {
                        setMode('calibrate');
                        setCalPoints([]);
                        setPlaying(false);
                      }}
                    >
                      <Crosshair size={14} /> Calibrate
                    </button>
                  </div>
                  <div
                    className={`video-stage ${mode !== 'inspect' ? 'marking' : ''}`}
                    style={{ aspectRatio: `${session.video.width}/${session.video.height}` }}
                  >
                    <img
                      ref={image}
                      src={frameUrl}
                      alt={`Recording frame ${frame}`}
                      draggable={false}
                      onLoad={() => setLoadedFrame(frame)}
                      onError={() =>
                        setError('Could not load this frame. Try a different frame or recording.')
                      }
                    />
                    <svg
                      viewBox="0 0 1000 1000"
                      preserveAspectRatio="none"
                      onClick={mark}
                      aria-label="Video annotation surface"
                    >
                      {(overlay ? visible : selectedDelivery ? [selectedDelivery] : []).map(
                        (d, i) => (
                          <g key={d.id} opacity={overlay && d.id !== selected ? 0.5 : 1}>
                            {segments(d.track).map(({ a, b }) => (
                              <line
                                key={`${a.frame}-${b.frame}`}
                                x1={a.x * 1000}
                                y1={a.y * 1000}
                                x2={b.x * 1000}
                                y2={b.y * 1000}
                                stroke={
                                  overlay
                                    ? ['#f4c95f', '#70d9c1', '#f3a47a', '#b0b8ff'][i % 4]
                                    : '#f3c559'
                                }
                                strokeWidth="2"
                                vectorEffect="non-scaling-stroke"
                                strokeDasharray={
                                  a.provenance === 'estimated' || b.provenance === 'estimated'
                                    ? '4 5'
                                    : undefined
                                }
                              />
                            ))}
                            {d.track.map((p) => (
                              <circle
                                key={`point-${p.frame}`}
                                cx={p.x * 1000}
                                cy={p.y * 1000}
                                r="2.5"
                                fill={p.provenance === 'manual' ? '#9addca' : '#f3c559'}
                              >
                                <title>
                                  {p.provenance} / frame {p.frame}
                                </title>
                              </circle>
                            ))}
                            {d.track
                              .filter((p) => p.frame === frame)
                              .map((p) => (
                                <circle
                                  key={p.frame}
                                  cx={p.x * 1000}
                                  cy={p.y * 1000}
                                  r="8"
                                  fill="none"
                                  stroke="#fff3c3"
                                  strokeWidth="2"
                                  vectorEffect="non-scaling-stroke"
                                />
                              ))}
                            {d.bounce && (
                              <g>
                                <circle
                                  cx={d.bounce.x * 1000}
                                  cy={d.bounce.y * 1000}
                                  r="13"
                                  fill="#ef855344"
                                  stroke="#ffac77"
                                  strokeWidth="2"
                                  vectorEffect="non-scaling-stroke"
                                />
                                <circle
                                  cx={d.bounce.x * 1000}
                                  cy={d.bounce.y * 1000}
                                  r="3"
                                  fill="#fff0d2"
                                />
                              </g>
                            )}
                          </g>
                        ),
                      )}
                      {mode === 'calibrate' && (
                        <>
                          <polygon
                            points={calPoints.map((p) => `${p.x * 1000},${p.y * 1000}`).join(' ')}
                            fill="#6edbc222"
                            stroke="#8de8d1"
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                          />
                          {calPoints.map((p, i) => (
                            <g key={i}>
                              <circle
                                cx={p.x * 1000}
                                cy={p.y * 1000}
                                r="9"
                                fill="#203c35"
                                stroke="#97e9d4"
                                strokeWidth="2"
                                vectorEffect="non-scaling-stroke"
                              />
                              <text x={p.x * 1000 + 16} y={p.y * 1000} fill="white" fontSize="27">
                                {i + 1}
                              </text>
                            </g>
                          ))}
                        </>
                      )}
                    </svg>
                    <div className="video-top-label">
                      <span className="record-dot" />
                      {session.video.synthetic ? 'DEMO FOOTAGE' : 'SOURCE FOOTAGE'}
                    </div>
                    <div className="video-bottom-label">
                      {mode === 'bounce'
                        ? 'Click the ground contact point at the bounce frame'
                        : mode === 'track'
                          ? 'Click the ball centre on this frame'
                          : mode === 'calibrate'
                            ? `Corner ${Math.min(calPoints.length + 1, 4)}: ${cornerNames[Math.min(calPoints.length, 3)]}`
                            : 'Observed image-space paths / ground-contact markers'}
                    </div>
                  </div>
                  <div className="playback">
                    <button
                      className="play-button"
                      aria-label={playing ? 'Pause preview' : 'Play preview'}
                      onClick={() => {
                        if (selectedDelivery && frame >= selectedDelivery.end)
                          setFrame(selectedDelivery.start);
                        setPlaying(!playing);
                      }}
                    >
                      {playing ? <Pause size={17} /> : <Play size={17} />}
                    </button>
                    <button
                      aria-label="Previous frame"
                      onClick={() => {
                        setPlaying(false);
                        seek(frame - 1);
                      }}
                    >
                      <ArrowLeft size={15} />
                    </button>
                    <button
                      aria-label="Next frame"
                      onClick={() => {
                        setPlaying(false);
                        seek(frame + 1);
                      }}
                    >
                      <ArrowRight size={15} />
                    </button>
                    <span className="timecode">{formatTime(frame, session.video.fps)}</span>
                    <input
                      aria-label="Recording timeline"
                      type="range"
                      min="0"
                      max={session.video.frames - 1}
                      value={frame}
                      onChange={(e) => {
                        setPlaying(false);
                        seek(Number(e.target.value));
                      }}
                    />
                    <span className="frame-label">F {frame}</span>
                  </div>
                  {mode === 'calibrate' ? (
                    <div className="calibration-controls">
                      <div>
                        <b>Set the ground plane</b>
                        <p>
                          Click far-left → far-right → near-right → near-left ground markers. Enter
                          the measured rectangle dimensions. Defaults are examples.
                        </p>
                      </div>
                      <div className="calibration-fields">
                        <label>
                          Width (m)
                          <input
                            type="number"
                            step="0.01"
                            min="0.2"
                            value={calWidth}
                            onChange={(e) => setCalWidth(Number(e.target.value))}
                          />
                        </label>
                        <label>
                          Length (m)
                          <input
                            type="number"
                            step="0.01"
                            min="1.1"
                            value={calLength}
                            onChange={(e) => setCalLength(Number(e.target.value))}
                          />
                        </label>
                        <button className="secondary" onClick={() => setCalPoints([])}>
                          Reset points
                        </button>
                        <button
                          className="primary"
                          disabled={calPoints.length !== 4}
                          onClick={() => {
                            const c: Calibration = {
                              points: calPoints,
                              width: calWidth,
                              length: calLength,
                            };
                            edit((s) => {
                              s.calibration = c;
                            });
                            setMode('inspect');
                            setNotice('Calibration updated in draft. Save to validate it.');
                          }}
                        >
                          <Check size={14} /> Apply calibration
                        </button>
                      </div>
                      <small>
                        Length is measured from the far/batter end. Move the camera? Recalibrate.
                        Lens distortion is not corrected in this prototype.
                      </small>
                    </div>
                  ) : (
                    <div className="review-footnote">
                      <span>
                        <i className="legend-line" /> Tracked image path{' '}
                        <i className="legend-bounce" /> Ground contact
                      </span>
                      <span>
                        ← → frame step <span className="dot-separator">·</span> Space to play
                      </span>
                    </div>
                  )}
                  {selectedDelivery && mode !== 'calibrate' && (
                    <div className="delivery-editor">
                      <div className="editor-grid">
                        <label>
                          Label
                          <input
                            aria-label="Delivery label"
                            value={selectedDelivery.label}
                            onChange={(e) =>
                              editDelivery((d) => {
                                d.label = e.target.value;
                              })
                            }
                          />
                        </label>
                        <label>
                          Bowler
                          <input
                            value={selectedDelivery.bowler}
                            placeholder="Add bowler"
                            onChange={(e) =>
                              editDelivery((d) => {
                                d.bowler = e.target.value;
                              })
                            }
                          />
                        </label>
                        <label>
                          Tag
                          <input
                            value={selectedDelivery.tag}
                            placeholder="e.g. Set 1"
                            onChange={(e) =>
                              editDelivery((d) => {
                                d.tag = e.target.value;
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="interval-row">
                        <span>
                          Frames {selectedDelivery.start}–{selectedDelivery.end}
                        </span>
                        <button
                          className="text-button"
                          disabled={frame >= selectedDelivery.end}
                          onClick={() =>
                            editDelivery((d) => {
                              d.start = frame;
                              d.track = d.track.filter((p) => p.frame >= frame);
                              if (d.bounce && d.bounce.frame < frame) d.bounce = null;
                              d.status = 'unreviewed';
                            })
                          }
                        >
                          <Flag size={13} /> Set start here
                        </button>
                        <button
                          className="text-button"
                          disabled={frame <= selectedDelivery.start}
                          onClick={() =>
                            editDelivery((d) => {
                              d.end = frame;
                              d.track = d.track.filter((p) => p.frame <= frame);
                              if (d.bounce && d.bounce.frame > frame) d.bounce = null;
                              d.status = 'unreviewed';
                            })
                          }
                        >
                          <Flag size={13} /> Set end here
                        </button>
                      </div>
                      <div className="review-actions">
                        <button
                          className="secondary"
                          onClick={runTracker}
                          disabled={!!busy || !!activeJob}
                        >
                          <WandSparkles size={15} /> {activeJob ? 'Tracking…' : 'Suggest track'}
                        </button>
                        <select
                          aria-label="Review status"
                          value={selectedDelivery.status}
                          onChange={(e) =>
                            editDelivery((d) => {
                              d.status = e.target.value as Delivery['status'];
                              if (d.status === 'full_toss' || d.status === 'unresolved')
                                d.bounce = null;
                            })
                          }
                        >
                          <option value="unreviewed">Needs review</option>
                          <option value="reviewed" disabled={!selectedDelivery.bounce}>
                            Reviewed bounce
                          </option>
                          <option value="full_toss">Full toss / no bounce</option>
                          <option value="unresolved">Unresolved</option>
                        </select>
                        <button
                          className="text-button"
                          disabled={!selectedDelivery.track.some((p) => p.frame === frame)}
                          onClick={() =>
                            editDelivery((d) => {
                              d.track = d.track.filter((p) => p.frame !== frame);
                              d.status = 'unreviewed';
                            })
                          }
                        >
                          Remove point here
                        </button>
                        {selectedDelivery.bounce && (
                          <button
                            className="text-button"
                            onClick={() => {
                              setFrame(selectedDelivery.bounce!.frame);
                              setMode('bounce');
                            }}
                          >
                            Go to bounce
                          </button>
                        )}
                      </div>
                      {latestJob && (
                        <div className="job-result">
                          <span className="badge">{latestJob.status.toUpperCase()}</span>
                          <p>
                            {latestJob.error ||
                              latestJob.result?.message ||
                              'Processing the saved delivery. Existing annotations are preserved.'}
                          </p>
                          {latestJob.result && (
                            <button
                              className="secondary"
                              onClick={() => {
                                editDelivery((d) => {
                                  const manual = d.track.filter((p) => p.provenance === 'manual');
                                  const manualFrames = new Set(manual.map((p) => p.frame));
                                  d.track = [
                                    ...latestJob.result!.points.filter(
                                      (p) =>
                                        !manualFrames.has(p.frame) &&
                                        p.frame >= d.start &&
                                        p.frame <= d.end,
                                    ),
                                    ...manual,
                                  ].sort((a, b) => a.frame - b.frame);
                                  d.status = 'unreviewed';
                                });
                                setNotice(
                                  'Suggestions loaded as a draft. Manual points were retained. Review before saving.',
                                );
                              }}
                            >
                              Use suggestions ({latestJob.result.points.length})
                            </button>
                          )}
                          {latestJob.input.revision !== session.revision && (
                            <small>
                              Based on revision {latestJob.input.revision}. Check for changes before
                              using suggestions.
                            </small>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </section>
                <aside className="map-column">
                  <section className="panel map-panel">
                    <div className="panel-heading">
                      <h2>Pitch map</h2>
                      <span className="badge">METRES</span>
                    </div>
                    <div className="map-subheading">Where your deliveries land.</div>
                    <PitchMap
                      deliveries={visible}
                      calibration={draft.calibration}
                      target={draft.target}
                      selected={selected}
                      onSelect={selectDelivery}
                    />
                    <div className="map-legend">
                      <span>
                        <i className="legend-bounce" /> Reviewed
                      </span>
                      <span>
                        <i className="legend-bounce grey" /> Unreviewed
                      </span>
                      <span>
                        <i className="target-icon" /> Target
                      </span>
                    </div>
                    <div className="map-note">
                      Ground locations are estimates. Airborne paths are shown only on the video.
                    </div>
                  </section>
                  <section className="panel target-panel">
                    <div className="panel-heading">
                      <h2>
                        <Crosshair size={15} /> Target zone
                      </h2>
                    </div>
                    <div className="target-fields">
                      {(['x_min', 'x_max', 'y_min', 'y_max'] as const).map((k) => (
                        <label key={k}>
                          {
                            {
                              x_min: 'Left (m)',
                              x_max: 'Right (m)',
                              y_min: 'Short edge (m)',
                              y_max: 'Long edge (m)',
                            }[k]
                          }
                          <input
                            type="number"
                            step="0.1"
                            value={draft.target[k]}
                            onChange={(e) =>
                              edit((s) => {
                                s.target[k] = Number(e.target.value);
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <small>
                      Lateral: negative left, positive right, facing the batter. Length increases
                      toward the bowler.
                    </small>
                  </section>
                </aside>
              </div>
              <section className="panel deliveries-panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      Deliveries <span className="badge">{visible.length}</span>
                    </h2>
                    <p>A session is built one ball at a time.</p>
                  </div>
                  <div className="button-row">
                    <select
                      aria-label="Filter bowler"
                      value={bowlerFilter}
                      onChange={(e) => setBowlerFilter(e.target.value)}
                    >
                      <option value="all">All bowlers</option>
                      {bowlerNames.map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Filter review status"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">All statuses</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="unreviewed">Needs review</option>
                      <option value="full_toss">Full toss</option>
                      <option value="unresolved">Unresolved</option>
                    </select>
                    <button className="secondary" onClick={addDelivery}>
                      <Plus size={15} /> Add delivery here
                    </button>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>DELIVERY</th>
                        <th>BOWLER / TAG</th>
                        <th>INTERVAL</th>
                        <th>BOUNCE LENGTH</th>
                        <th>STATUS</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((d, i) => {
                        const p = analysis?.points.find((p) => p.delivery.id === d.id);
                        return (
                          <tr key={d.id} className={selected === d.id ? 'selected-row' : ''}>
                            <td>
                              <button
                                className="delivery-select"
                                onClick={() => selectDelivery(d.id)}
                              >
                                <span className="delivery-number">
                                  {String(i + 1).padStart(2, '0')}
                                </span>
                                {d.label || 'Untitled delivery'}
                                {selected === d.id && <span className="selected-dot" />}
                              </button>
                            </td>
                            <td>
                              {d.bowler || '—'}
                              <small>{d.tag || 'No tag'}</small>
                            </td>
                            <td className="mono">
                              {formatTime(d.start, session.video.fps)} →{' '}
                              {formatTime(d.end, session.video.fps)}
                            </td>
                            <td>{p ? `${p.y.toFixed(2)} m` : '—'}</td>
                            <td>
                              <span className={`status-pill ${d.status}`}>
                                <span />
                                {
                                  {
                                    reviewed: 'Reviewed',
                                    unreviewed: 'Needs review',
                                    full_toss: 'Full toss',
                                    unresolved: 'Unresolved',
                                  }[d.status]
                                }
                              </span>
                            </td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label={`Remove ${d.label}`}
                                onClick={() => {
                                  edit((s) => {
                                    s.deliveries = s.deliveries.filter((x) => x.id !== d.id);
                                  });
                                  if (selected === d.id) setSelected('');
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!visible.length && (
                    <div className="empty-deliveries">
                      <CircleDot size={23} />
                      <b>
                        {draft.deliveries.length
                          ? 'No deliveries match these filters.'
                          : 'Ready for the first ball.'}
                      </b>
                      <p>Move to the delivery start and choose “Add delivery here”.</p>
                    </div>
                  )}
                </div>
                <div className="table-footer">
                  <span>
                    {visible.length} shown / {draft.deliveries.length} total <span>·</span>{' '}
                    Statistics use reviewed bounces only
                  </span>
                  <div>
                    <a
                      className={dirty ? 'disabled-link' : ''}
                      aria-disabled={dirty}
                      href={dirty ? undefined : `/api/sessions/${session.id}/export.csv`}
                    >
                      <ArrowDownToLine size={14} /> Session CSV
                    </a>
                    <a
                      className={dirty || !draft.calibration ? 'disabled-link' : ''}
                      aria-disabled={dirty || !draft.calibration}
                      href={
                        dirty || !draft.calibration
                          ? undefined
                          : `/api/sessions/${session.id}/export.png`
                      }
                    >
                      <ArrowDownToLine size={14} /> Session PNG
                    </a>
                  </div>
                </div>
              </section>
              <footer className="workspace-footer">
                <span>
                  <CircleDot size={13} /> Progress over perfection.
                </span>
                <span>
                  Single-camera practice analysis <span>·</span>{' '}
                  {dirty ? 'Save to enable exports' : 'Exports include the whole saved session'}
                </span>
              </footer>
            </>
          )}
        </div>
      </main>
      {pendingSwitch && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="unsaved-title">
            <h2 id="unsaved-title">Keep your changes?</h2>
            <p>
              This session has unsaved edits. Save them before switching, or discard this draft.
            </p>
            <div className="button-row">
              <button className="secondary" onClick={() => setPendingSwitch('')}>
                Cancel
              </button>
              <button
                className="secondary"
                onClick={async () => {
                  const id = pendingSwitch;
                  setPendingSwitch('');
                  acceptSession(await api<Session>(`/sessions/${id}`));
                }}
              >
                Discard draft
              </button>
              <button
                className="primary"
                onClick={async () => {
                  const saved = await save();
                  if (saved) {
                    const id = pendingSwitch;
                    setPendingSwitch('');
                    acceptSession(await api<Session>(`/sessions/${id}`));
                  }
                }}
              >
                Save and switch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  title,
  value,
  unit,
  detail,
  icon,
}: {
  title: string;
  value: string;
  unit?: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="metric">
      <div className="metric-title">
        {title}
        <span>{icon}</span>
      </div>
      <div className="metric-value">
        {value}
        <small>{unit}</small>
      </div>
      <p>{detail}</p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
