import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Layout from '../components/Layout';
import ActivityEditor from '../admin/ActivityEditor';
import SessionPanel from '../admin/SessionPanel';
import { db, errorMessage, modeLabel, rpc, type Activity, type ActivityDetail, type AdminSession, type Mode } from '../api';

const SESSION_KEY = 'participa:active-session';

function storeSession(id: string | null) {
  try {
    if (id) sessionStorage.setItem(SESSION_KEY, id);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* almacenamiento no disponible: no es crítico */
  }
}

function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function login(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'El correo o la contraseña no coinciden.' : error.message);
      onLogin();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login card">
      <h1>Administración</h1>
      <p className="muted">Ingresá con la cuenta habilitada para crear y conducir actividades.</p>
      <form onSubmit={login} className="stack">
        <label className="field">
          <span>Correo electrónico</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function NewActivity({ onCreated }: { onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<Mode>('poll');
  const [error, setError] = useState('');

  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const id = await rpc<string>('admin_create_activity', { p_title: title, p_mode: mode });
      setTitle('');
      onCreated(id);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form className="newact stack" onSubmit={create}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        minLength={3}
        maxLength={120}
        aria-label="Título de la nueva actividad"
        placeholder="Título de la nueva actividad"
      />
      <div className="segmented" role="radiogroup" aria-label="Tipo de actividad">
        {(['poll', 'quiz'] as Mode[]).map((m) => (
          <label key={m} className={mode === m ? 'on' : ''}>
            <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} />
            {modeLabel[m]}
          </label>
        ))}
      </div>
      <p className="tiny muted">
        {mode === 'poll' ? 'Sin respuesta correcta: para recoger opiniones.' : 'Con respuesta correcta, puntaje y ranking.'}
      </p>
      <button>Crear actividad</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

export default function Admin() {
  const [user, setUser] = useState<boolean | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [session, setSession] = useState<AdminSession | null>(null);
  const [error, setError] = useState('');
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  const loadList = useCallback(async () => {
    try {
      setActivities(await rpc<Activity[]>('admin_list_activities'));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  const loadDetail = useCallback(async (id: string | null) => {
    if (!id) return setDetail(null);
    try {
      setDetail(await rpc<ActivityDetail>('admin_get_activity', { p_activity: id }));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadList(), loadDetail(selectedRef.current)]);
  }, [loadList, loadDetail]);

  const restoreSession = useCallback(async () => {
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(SESSION_KEY);
    } catch {
      /* sin almacenamiento */
    }
    if (!id) return;
    try {
      setSession(await rpc<AdminSession>('admin_session_info', { p_session: id }));
    } catch {
      storeSession(null);
    }
  }, []);

  const start = useCallback(() => {
    void loadList();
    void restoreSession();
  }, [loadList, restoreSession]);

  useEffect(() => {
    void db.auth.getUser().then(({ data }) => {
      const isAdmin = Boolean(data.user && !data.user.is_anonymous);
      setUser(isAdmin);
      if (isAdmin) start();
    });
  }, [start]);

  useEffect(() => {
    void loadDetail(selected);
  }, [selected, loadDetail]);

  async function launch(activityId: string) {
    setError('');
    try {
      const s = await rpc<AdminSession>('admin_launch', { p_activity: activityId });
      setSession(s);
      storeSession(s.id);
      await refreshAll();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function action(type: 'next' | 'reveal' | 'close') {
    if (!session) return;
    setError('');
    try {
      await rpc('admin_control', { p_session: session.id, p_action: type });
      setSession(await rpc<AdminSession>('admin_session_info', { p_session: session.id }));
      if (type === 'close') await refreshAll();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (user === null)
    return (
      <Layout>
        <p className="waiting">Cargando</p>
      </Layout>
    );

  if (!user)
    return (
      <Layout>
        <LoginForm
          onLogin={() => {
            setUser(true);
            start();
          }}
        />
      </Layout>
    );

  return (
    <Layout wide>
      <div className="admin">
        <aside className="sidebar">
          <div className="row">
            <h1 className="h-small">Actividades</h1>
            <span className="spacer" />
            <button
              className="linkbutton"
              onClick={async () => {
                await db.auth.signOut();
                storeSession(null);
                setSession(null);
                setUser(false);
              }}
            >
              Salir
            </button>
          </div>
          <NewActivity
            onCreated={(id) => {
              setSelected(id);
              void loadList();
            }}
          />
          {activities.length === 0 ? (
            <p className="muted small">Todavía no creaste actividades.</p>
          ) : (
            <ul className="actlist">
              {activities.map((a) => (
                <li key={a.id}>
                  <button className={'actitem' + (a.id === selected ? ' on' : '')} onClick={() => setSelected(a.id)}>
                    <span className="actitem-title">{a.title}</span>
                    <span className="actitem-meta">
                      {modeLabel[a.mode]}, {a.question_count} {a.question_count === 1 ? 'pregunta' : 'preguntas'}
                      {a.open_session && <span className="live">en vivo</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="workspace">
          {error && <p className="error">{error}</p>}
          {session && (
            <SessionPanel
              session={session}
              onAction={action}
              onDismiss={() => {
                storeSession(null);
                setSession(null);
              }}
            />
          )}
          {detail ? (
            <ActivityEditor
              detail={detail}
              onChanged={refreshAll}
              onLaunch={() => void launch(detail.id)}
              onDeleted={() => {
                setSelected(null);
                void loadList();
              }}
            />
          ) : (
            !session && (
              <div className="empty">
                <h2>Elegí una actividad o creá una nueva</h2>
                <p className="muted">
                  Una encuesta sirve para escuchar opiniones. Una competencia suma puntos por acertar rápido y muestra un
                  ranking al final.
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </Layout>
  );
}
