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
import { applyAnalysis } from './applyAnalysis';
import { PitchMap } from './PitchMap';
import { RecordingPlayer } from './RecordingPlayer';
import type {
  Calibration,
  Delivery,
  Job,
  Point,
  Session,
  SessionState,
  SessionSummary,
  TrackPoint,
} from './types';
import './style.css';

type Mode = 'inspect' | 'bounce' | 'track' | 'calibrate' | 'seed';
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
  const [analysisSeed, setAnalysisSeed] = useState<TrackPoint | null>(null);
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
  const [showOverview, setShowOverview] = useState(false);
  const [restoreRevision, setRestoreRevision] = useState('');
  const [deletePending, setDeletePending] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  const pendingAnalysis = useRef<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  const selectedDelivery = draft?.deliveries.find((d) => d.id === selected);
  const visible =
    draft?.deliveries.filter(
      (d) =>
        (filter === 'all' || d.status === filter) &&
        (bowlerFilter === 'all' || d.bowler === bowlerFilter),
    ) || [];
  const analysis = draft ? analyse(visible, draft.calibration, draft.target) : null;
  const selectedGround = analysis?.points.find((p) => p.delivery.id === selected);
  const imageContact = !!selectedDelivery?.bounce && !selectedGround;
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
    setAnalysisSeed(null);
    setPlaying(false);
    setJobs([]);
    pendingAnalysis.current = null;
    setFilter('all');
    setBowlerFilter('all');
    setCalPoints([]);
    setDeletePending(false);
    setShowSettings(false);
    setShowOverview(false);
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

  async function save(stateOverride?: SessionState): Promise<Session | null> {
    if (!session || !draft) return null;
    setBusy('Saving');
    setError('');
    try {
      const s = await api<Session>(`/sessions/${session.id}`, {
        method: 'PUT',
        ...json({ revision: session.revision, state: stateOverride ?? draft }),
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

  useEffect(() => {
    const job = jobs.find((j) => j.id === pendingAnalysis.current);
    if (!job || !['completed', 'failed'].includes(job.status)) return;
    pendingAnalysis.current = null;
    if (job.status === 'failed') {
      setError(job.error || 'Analysis failed');
      return;
    }
    if (!job.result || !draft || !session) return;
    if (dirty || job.input.revision !== session.revision) {
      setNotice('Analysis is ready. Use analysis to load it into your edited draft.');
      return;
    }
    setUndo((history) => [...history.slice(-39), clone(draft)]);
    const next = applyAnalysis(draft, job.delivery_id, job.result, job.input.seed?.frame);
    setDraft(next);
    setDirty(true);
    if (job.result.bounce) {
      setFrame(job.result.bounce.frame);
      setPlaying(false);
    }
    setNotice(
      job.result.bounce
        ? 'Automatic bounce and track loaded. Save to keep the analysis.'
        : 'Track loaded; bounce remains unresolved. See the analysis details.',
    );
  }, [jobs, session, draft, dirty]);

  const seek = useCallback(
    (next: number) => {
      if (session) setFrame(Math.max(0, Math.min(session.video.frames - 1, next)));
    },
    [session],
  );

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
    setAnalysisSeed(null);
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
    if (playing) {
      setPlaying(false);
      setNotice('Playback paused. Wait for the still frame, then click the ball.');
      return;
    }
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
    if (mode === 'seed') {
      setAnalysisSeed({ ...point, frame, provenance: 'manual', score: null });
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

  function beginAnalysis(recoveryFrame?: number) {
    if (!selectedDelivery || busy || activeJob) return;
    setPlaying(false);
    setMode('seed');
    setAnalysisSeed(null);
    setError('');
    setNotice('');
    if (typeof recoveryFrame === 'number') setFrame(recoveryFrame);
    else if (frame < selectedDelivery.start || frame > selectedDelivery.end)
      setFrame(selectedDelivery.start);
  }

  async function runTracker(seedOverride: TrackPoint | null) {
    if (!session || !selectedDelivery || !draft) return;
    setPlaying(false);
    const next = clone(draft);
    if (seedOverride) {
      const delivery = next.deliveries.find((d) => d.id === selected)!;
      delivery.track = [
        ...delivery.track.filter((p) => p.frame !== seedOverride.frame),
        seedOverride,
      ].sort((a, b) => a.frame - b.frame);
    }
    const current = dirty || seedOverride ? await save(next) : session;
    if (!current) return;
    setBusy('Starting delivery analysis');
    setError('');
    try {
      const seed = seedOverride;
      const job = await api<Job>(`/sessions/${session.id}/jobs`, {
        method: 'POST',
        ...json({ delivery_id: selected, seed: seed || null }),
      });
      setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
      pendingAnalysis.current = job.id;
      setMode('inspect');
      setAnalysisSeed(null);
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
                  <button
                    className="primary"
                    onClick={() => void save()}
                    disabled={!dirty || !!busy}
                  >
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
              <div className="workspace-navigation">
                <div role="group" aria-label="Workspace view">
                  <button
                    className={!showOverview ? 'view-active' : ''}
                    aria-pressed={!showOverview}
                    onClick={() => setShowOverview(false)}
                  >
                    Delivery review
                  </button>
                  <button
                    className={showOverview ? 'view-active' : ''}
                    aria-pressed={showOverview}
                    onClick={() => setShowOverview(true)}
                  >
                    Session overview
                  </button>
                </div>
                <span>
                  {draft.deliveries.length} deliveries ·{' '}
                  {draft.deliveries.filter((d) => d.bounce).length} contact locations
                </span>
              </div>
              <section className="metrics" hidden={!showOverview}>
                <Metric
                  title="DELIVERIES"
                  value={String(visible.length).padStart(2, '0')}
                  detail={
                    draft.calibration
                      ? `${analysis?.reviewed.length || 0} reviewed / ${analysis?.estimated.length || 0} ground estimates`
                      : `${visible.filter((d) => d.bounce).length} bounce contacts / ${visible.filter((d) => !d.bounce).length} unresolved`
                  }
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
                  detail={
                    draft.calibration
                      ? 'From the batter-end stump line'
                      : 'Ground calibration required for metres'
                  }
                  icon={<MapPin size={17} />}
                />
                <Metric
                  title="LENGTH SPREAD"
                  value={analysis?.spread ? analysis.spread.y.toFixed(2) : '—'}
                  unit={analysis?.spread ? 'm' : ''}
                  detail={
                    draft.calibration
                      ? 'Population standard deviation'
                      : 'Ground calibration required for metres'
                  }
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
                  <div className="delivery-switcher">
                    <label>
                      Ball colour
                      <select
                        aria-label="Ball colour"
                        value={draft.ball_colour ?? 'auto'}
                        onChange={(e) =>
                          edit((s) => {
                            s.ball_colour = e.target.value as 'auto' | 'red' | 'white';
                          })
                        }
                      >
                        <option value="auto">Auto detect</option>
                        <option value="red">Red ball</option>
                        <option value="white">White ball</option>
                      </select>
                    </label>
                    <label>
                      Review range
                      <select
                        aria-label="Choose delivery"
                        value={selected}
                        onChange={(e) => selectDelivery(e.target.value)}
                      >
                        <option value="">
                          {draft.deliveries.length
                            ? 'Whole recording'
                            : 'Whole recording · no deliveries yet'}
                        </option>
                        {draft.deliveries.map((d, i) => (
                          <option key={d.id} value={d.id}>
                            {d.label || `Delivery ${i + 1}`} ·{' '}
                            {d.status === 'estimated'
                              ? 'Bounce candidate'
                              : d.status.replace('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="secondary" onClick={addDelivery} disabled={!!busy}>
                      <Plus size={15} /> Add delivery
                    </button>
                    {selectedDelivery && (
                      <button
                        className="primary"
                        onClick={() => beginAnalysis()}
                        disabled={!!busy || !!activeJob}
                      >
                        <WandSparkles size={15} />
                        {activeJob ? 'Analysing…' : 'Analyze delivery'}
                      </button>
                    )}
                  </div>
                  {mode === 'seed' && selectedDelivery && (
                    <div className="seed-guide" role="region" aria-label="Choose tracking start">
                      <div>
                        <h3>Choose the starting ball position</h3>
                        <p>
                          Pause near the release, then click the centre of the visible ball.
                          Tracking will follow it forward from this frame.
                        </p>
                        {analysisSeed && (
                          <p className="seed-confirmation">
                            Starting point selected on frame {analysisSeed.frame}.
                            {analysisSeed.frame !== frame &&
                              ' Return to that frame or select a new point.'}
                          </p>
                        )}
                        {analysisSeed && (
                          <svg
                            className="seed-crop"
                            role="img"
                            aria-label="Selected ball magnified"
                            viewBox={`${analysisSeed.x * session.video.width - 24} ${analysisSeed.y * session.video.height - 24} 48 48`}
                          >
                            <image
                              href={`/api/sessions/${session.id}/frame/${analysisSeed.frame}`}
                              width={session.video.width}
                              height={session.video.height}
                            />
                            <circle
                              cx={analysisSeed.x * session.video.width}
                              cy={analysisSeed.y * session.video.height}
                              r="9"
                              fill="none"
                              stroke="#ffb65c"
                              strokeWidth="0.7"
                            />
                          </svg>
                        )}
                        <small>
                          Choose the ball, not a hat or pad. Earlier observations are retained when
                          you restart later in this delivery.
                        </small>
                      </div>
                      <div className="seed-actions">
                        <button
                          className="secondary"
                          disabled={!!busy}
                          onClick={() => {
                            setPlaying(false);
                            setFrame(selectedDelivery.start);
                          }}
                        >
                          Go to delivery start
                        </button>
                        <button
                          className="primary"
                          disabled={
                            !analysisSeed ||
                            analysisSeed.frame !== frame ||
                            loadedFrame !== frame ||
                            playing ||
                            !!busy ||
                            !!activeJob
                          }
                          onClick={() => {
                            if (analysisSeed) void runTracker(analysisSeed);
                          }}
                        >
                          Start tracking
                        </button>
                        {analysisSeed && analysisSeed.frame !== frame && (
                          <button
                            className="secondary"
                            onClick={() => {
                              setPlaying(false);
                              setFrame(analysisSeed.frame);
                            }}
                          >
                            Return to starting frame
                          </button>
                        )}
                        <button
                          className="text-button"
                          disabled={!!busy || !!activeJob}
                          onClick={() => void runTracker(null)}
                        >
                          Find ball automatically
                        </button>
                        <button
                          className="text-button"
                          disabled={!!busy || !!activeJob}
                          onClick={() => {
                            setMode('inspect');
                            setAnalysisSeed(null);
                          }}
                        >
                          Cancel selection
                        </button>
                      </div>
                    </div>
                  )}
                  {!selectedDelivery && (
                    <div className="workflow-hint">
                      Move to the start of a ball, add a delivery, then analyse it. You can correct
                      the result frame by frame.
                    </div>
                  )}

                  <div
                    className={`video-stage ${mode !== 'inspect' ? 'marking' : ''}`}
                    style={{ aspectRatio: `${session.video.width}/${session.video.height}` }}
                  >
                    <RecordingPlayer
                      key={session.id}
                      sessionId={session.id}
                      fps={session.video.fps}
                      frame={frame}
                      end={selectedDelivery?.end ?? session.video.frames - 1}
                      playing={playing}
                      imageRef={image}
                      onFrame={setFrame}
                      onPlaying={setPlaying}
                      onLoaded={setLoadedFrame}
                      onError={setError}
                    />
                    <svg
                      viewBox="0 0 1000 1000"
                      preserveAspectRatio="none"
                      onClick={mark}
                      aria-label="Video annotation surface"
                    >
                      {mode === 'seed' && analysisSeed?.frame === frame && (
                        <g aria-label="Selected tracking start">
                          <circle
                            cx={analysisSeed.x * 1000}
                            cy={analysisSeed.y * 1000}
                            r="12"
                            fill="none"
                            stroke="#9addca"
                            strokeWidth="3"
                            vectorEffect="non-scaling-stroke"
                          />
                          <path
                            d={`M${analysisSeed.x * 1000 - 20},${analysisSeed.y * 1000}h40 M${analysisSeed.x * 1000},${analysisSeed.y * 1000 - 20}v40`}
                            stroke="#fff"
                            strokeWidth="1.5"
                            vectorEffect="non-scaling-stroke"
                          />
                        </g>
                      )}
                      {(mode === 'seed'
                        ? []
                        : overlay
                          ? visible
                          : selectedDelivery
                            ? [selectedDelivery]
                            : []
                      ).map((d, i) => (
                        <g key={d.id} opacity={overlay && d.id !== selected ? 0.5 : 1}>
                          {segments(d.track.filter((p) => overlay || p.frame <= frame)).map(
                            ({ a, b }) => (
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
                            ),
                          )}
                          {d.track
                            .filter((p) => overlay || p.frame <= frame)
                            .map((p) => (
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
                      ))}
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
                        : mode === 'track' || mode === 'seed'
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
                        if (!selectedDelivery && frame >= session.video.frames - 1) setFrame(0);
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
                          onClick={() => beginAnalysis()}
                          disabled={!!busy || !!activeJob}
                        >
                          <WandSparkles size={15} />{' '}
                          {activeJob ? 'Analysing…' : 'Reanalyse delivery'}
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
                          <option value="estimated" disabled={!selectedDelivery.bounce}>
                            Automatic estimate
                          </option>
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
                          {latestJob.result?.diagnostics && (
                            <p>
                              Observed frames: {latestJob.result.diagnostics.observed_frames}.
                              Interval coverage:{' '}
                              {Math.round(latestJob.result.diagnostics.coverage * 100)}%. Longest
                              detection gap: {latestJob.result.diagnostics.longest_gap} frames. Stop
                              reason:{' '}
                              {latestJob.result.diagnostics.stop_reason.replaceAll('-', ' ')}.
                              Coverage describes available observations, not tracking accuracy.
                            </p>
                          )}
                          {latestJob.result?.contact_analysis && (
                            <div className="contact-result">
                              <b>
                                {latestJob.result.bounce
                                  ? 'Bounce candidate · review contact'
                                  : 'Bounce unresolved'}
                              </b>
                              {latestJob.result.bounce && (
                                <button
                                  className="secondary"
                                  onClick={() => {
                                    setFrame(latestJob.result!.bounce!.frame);
                                    setPlaying(false);
                                  }}
                                >
                                  View contact / frame {latestJob.result.bounce.frame} /{' '}
                                  {formatTime(latestJob.result.bounce.frame, session.video.fps)}
                                </button>
                              )}
                              {latestJob.result.contact_analysis.ground ? (
                                <p>
                                  Estimated line: {latestJob.result.contact_analysis.ground.line}.
                                  Length: {latestJob.result.contact_analysis.ground.y.toFixed(2)} m
                                  / {latestJob.result.contact_analysis.ground.length}.
                                </p>
                              ) : (
                                <p>
                                  {latestJob.result.contact_analysis.ground_reason ||
                                    latestJob.result.contact_analysis.reason}
                                </p>
                              )}
                            </div>
                          )}
                          {latestJob.result?.diagnostics?.first_lost_frame != null && (
                            <div
                              className="tracking-recovery"
                              role="region"
                              aria-label="Recover tracking"
                            >
                              <b>
                                Ball lost at frame {latestJob.result.diagnostics.first_lost_frame}
                              </b>
                              <p>
                                Inspect the last observation, step forward until the ball is
                                visible, then select it again. Earlier points are kept.
                              </p>
                              <button
                                className="secondary"
                                disabled={!!busy || !!activeJob}
                                onClick={() =>
                                  beginAnalysis(
                                    latestJob.result!.diagnostics!.last_reliable_frame ??
                                      selectedDelivery.start,
                                  )
                                }
                              >
                                Correct ball and resume
                              </button>
                            </div>
                          )}
                          {latestJob.result && (
                            <button
                              className="secondary"
                              onClick={() => {
                                edit((s) =>
                                  Object.assign(
                                    s,
                                    applyAnalysis(
                                      s,
                                      selected,
                                      latestJob.result!,
                                      latestJob.input.seed?.frame,
                                    ),
                                  ),
                                );
                                if (latestJob.result?.bounce)
                                  setFrame(latestJob.result.bounce.frame);
                                setNotice(
                                  'Suggestions loaded as a draft. Manual points were retained. Review before saving.',
                                );
                              }}
                            >
                              Use analysis ({latestJob.result.points.length} points)
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
                      <h2>{imageContact ? 'Pitch contact' : 'Pitch map'}</h2>
                      <span className="badge">
                        {draft.calibration && !imageContact ? 'METRES' : 'IMAGE POSITION'}
                      </span>
                    </div>
                    <div className="map-subheading">
                      {!selectedDelivery && visible.some((d) => d.bounce)
                        ? 'Choose a delivery to inspect its contact.'
                        : selectedDelivery?.bounce
                          ? `Contact at frame ${selectedDelivery.bounce.frame}`
                          : 'Locate the bounce to see where this ball pitched.'}
                    </div>
                    {selectedDelivery && !visible.some((d) => d.id === selected) && (
                      <div className="map-empty">
                        <p>The selected delivery is hidden by your filters.</p>
                        <button
                          className="text-button"
                          onClick={() => {
                            setFilter('all');
                            setBowlerFilter('all');
                          }}
                        >
                          Show selected delivery
                        </button>
                      </div>
                    )}
                    {imageContact && selectedDelivery?.bounce ? (
                      <div className="contact-preview">
                        <div
                          style={{
                            position: 'relative',
                            aspectRatio: `${session.video.width}/${session.video.height}`,
                          }}
                        >
                          <img
                            src={`/api/sessions/${session.id}/frame/${selectedDelivery.bounce.frame}`}
                            alt="Pitch contact location on the recording"
                          />
                          <svg
                            viewBox="0 0 1000 1000"
                            preserveAspectRatio="none"
                            role="button"
                            tabIndex={0}
                            aria-label="Open bounce source frame"
                            onClick={() => {
                              setPlaying(false);
                              setFrame(selectedDelivery.bounce!.frame);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setPlaying(false);
                                setFrame(selectedDelivery.bounce!.frame);
                              }
                            }}
                          >
                            <circle
                              cx={selectedDelivery.bounce.x * 1000}
                              cy={selectedDelivery.bounce.y * 1000}
                              r="20"
                              fill="#ff9b4c55"
                              stroke="#ffb65c"
                              strokeWidth="2"
                              vectorEffect="non-scaling-stroke"
                            />
                            <path
                              d={`M${selectedDelivery.bounce.x * 1000 - 30},${selectedDelivery.bounce.y * 1000}h60 M${selectedDelivery.bounce.x * 1000},${selectedDelivery.bounce.y * 1000 - 30}v60`}
                              stroke="white"
                              strokeWidth="1.5"
                              vectorEffect="non-scaling-stroke"
                            />
                          </svg>
                        </div>
                        <b>
                          {selectedDelivery.status === 'reviewed'
                            ? 'Reviewed contact'
                            : selectedDelivery.bounce.provenance === 'manual'
                              ? 'Marked contact'
                              : 'Bounce candidate'}{' '}
                          / F{selectedDelivery.bounce.frame}
                        </b>
                        <p>
                          The pin marks the estimated ground-contact position in this camera view.
                        </p>
                        <small>
                          Metre-based line and length need a fixed camera and known ground geometry.
                        </small>
                      </div>
                    ) : (
                      <PitchMap
                        deliveries={visible}
                        calibration={draft.calibration}
                        target={draft.target}
                        selected={selected}
                        onSelect={selectDelivery}
                      />
                    )}
                    {selectedDelivery?.bounce ? (
                      <div className="map-contact-summary">
                        {selectedGround && (
                          <b>
                            {selectedGround.y.toFixed(2)} m from batter end ·{' '}
                            {Math.abs(selectedGround.x).toFixed(2)} m{' '}
                            {selectedGround.x < 0 ? 'left' : 'right'}
                          </b>
                        )}
                        <span className="contact-status">
                          {selectedDelivery.status === 'reviewed'
                            ? 'Reviewed contact'
                            : selectedDelivery.bounce.provenance === 'manual'
                              ? 'Manually marked'
                              : 'Automatic estimate · needs review'}
                        </span>
                        <button
                          className="secondary"
                          onClick={() => {
                            setPlaying(false);
                            setFrame(selectedDelivery.bounce!.frame);
                          }}
                        >
                          Show contact frame
                        </button>
                        {selectedDelivery.status !== 'reviewed' && (
                          <button
                            className="primary"
                            disabled={
                              frame !== selectedDelivery.bounce.frame ||
                              loadedFrame !== frame ||
                              playing
                            }
                            onClick={() =>
                              editDelivery((d) => {
                                d.status = 'reviewed';
                              })
                            }
                          >
                            Confirm contact
                          </button>
                        )}
                        {selectedDelivery.bounce.ground_eligible === false && (
                          <p>
                            Camera stability could not be confirmed. The contact is shown on the
                            recording instead of mapped into metres.
                          </p>
                        )}
                      </div>
                    ) : !selectedDelivery && visible.some((d) => d.bounce) ? (
                      <div className="map-empty">
                        <b>Session contacts</b>
                        <p>
                          Choose a delivery to highlight where it pitched and open its contact
                          frame.
                        </p>
                      </div>
                    ) : (
                      <div className="map-empty" role="status">
                        <b>
                          {selectedDelivery?.status === 'full_toss'
                            ? 'Marked as a full toss'
                            : 'No bounce location yet'}
                        </b>
                        <p>
                          {selectedDelivery?.status === 'full_toss'
                            ? 'This delivery has no ground contact to plot.'
                            : selectedDelivery?.status === 'unresolved'
                              ? 'Analysis could not locate a supported bounce. Pause at the contact frame and mark it, or try a clearer delivery.'
                              : 'Analyse a delivery or mark its ground contact. A ball trail alone does not locate a bounce.'}
                        </p>
                        {selectedDelivery && selectedDelivery.status !== 'full_toss' && (
                          <button
                            className="secondary"
                            onClick={() => {
                              setPlaying(false);
                              setMode('bounce');
                            }}
                          >
                            Locate bounce manually
                          </button>
                        )}
                      </div>
                    )}
                    {!draft.calibration && (
                      <div className="map-setup">
                        <p>
                          To compare line and length in metres, set four ground reference points.
                        </p>
                        <button
                          className="text-button"
                          onClick={() => {
                            setMode('calibrate');
                            setCalPoints([]);
                            setPlaying(false);
                          }}
                        >
                          Set up pitch map
                        </button>
                      </div>
                    )}
                    <div className="map-legend">
                      <span>
                        <i className="legend-bounce" /> Reviewed
                      </span>
                      <span>
                        <i className="legend-bounce grey" /> Unreviewed / automatic
                      </span>
                      <span>
                        <i className="target-icon" /> Target
                      </span>
                    </div>
                    <div className="map-note">
                      Ground locations are estimates. Airborne paths are shown only on the video.
                    </div>
                  </section>
                  {draft.calibration && (
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
                  )}
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
                      <option value="estimated">Automatic estimates</option>
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
                                    estimated: 'Automatic estimate',
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
                    Statistics include reviewed and automatic ground estimates
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
