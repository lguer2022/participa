import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Results from '../components/Results';
import Leaderboard from '../components/Leaderboard';
import Shape from '../components/Shape';
import { errorMessage, rpc, type PublicState } from '../api';
import { useRoom } from '../useRoom';

const skipKey = (pin: string) => `participa:sin-apodo:${pin}`;

function NicknameForm({ pin, onDone }: { pin: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await rpc('set_nickname', { p_pin: pin, p_nickname: name });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={save}>
      <h2>¿Cómo querés aparecer en el ranking?</h2>
      <p className="muted">Es opcional y solo lo ve esta sala. No uses tu nombre completo si no querés.</p>
      <input value={name} maxLength={24} autoFocus placeholder="Tu apodo" onChange={(e) => setName(e.target.value)} />
      <button disabled={busy || !name.trim()}>Guardar apodo</button>
      <button
        type="button"
        className="ghost"
        onClick={() => {
          try {
            sessionStorage.setItem(skipKey(pin), '1');
          } catch {
            /* sin almacenamiento */
          }
          onDone();
        }}
      >
        Seguir sin apodo
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function Score({ state }: { state: PublicState }) {
  if (state.mode !== 'quiz' || state.my_score == null) return null;
  return (
    <p className="scoreline">
      <b>{state.my_score.toLocaleString('es-AR')}</b> puntos
      {state.my_rank != null && (
        <>
          , puesto <b>{state.my_rank}</b> de {state.participants}
        </>
      )}
    </p>
  );
}

function Feedback({ state }: { state: PublicState }) {
  if (state.mode !== 'quiz') return null;
  if (!state.my_answer) return <p className="feedback neutral">No respondiste esta pregunta.</p>;
  return state.my_points ? (
    <p className="feedback good">Correcta. Sumaste {state.my_points.toLocaleString('es-AR')} puntos.</p>
  ) : (
    <p className="feedback bad">Esta vez no. La correcta está marcada abajo.</p>
  );
}

export default function Join() {
  const { pin = '' } = useParams();
  const { state, loading, error, refresh } = useRoom(pin);
  const [saving, setSaving] = useState('');
  const [localError, setLocalError] = useState('');
  const [nickDone, setNickDone] = useState(() => {
    try {
      return sessionStorage.getItem(skipKey(pin)) === '1';
    } catch {
      return false;
    }
  });

  async function submit(optionId: string) {
    setSaving(optionId);
    setLocalError('');
    navigator.vibrate?.(30);
    try {
      await rpc('submit_answer', { p_pin: pin, p_option: optionId });
      await refresh();
    } catch (e) {
      setLocalError(errorMessage(e));
    } finally {
      setSaving('');
    }
  }

  let body;
  if (loading) body = <p className="waiting">Conectando con la sala</p>;
  else if (error)
    body = (
      <div className="card stack">
        <p className="error">{error}</p>
        <Link to="/" className="textlink">
          Probar con otro código
        </Link>
      </div>
    );
  else if (state) {
    const askNick = !state.is_admin && state.mode === 'quiz' && state.status === 'open' && !state.nickname && !nickDone;
    body = (
      <>
        <header className="room-head">
          <h1>{state.title}</h1>
          {state.nickname && <span className="tag">{state.nickname}</span>}
        </header>
        {state.is_admin && (
          <p className="alert">
            Estás viendo la sala con tu sesión de administrador, así que no podés votar. Para probar como participante,
            abrí el enlace en otro navegador o en el celular.
          </p>
        )}
        {askNick ? (
          <NicknameForm
            pin={pin}
            onDone={() => {
              setNickDone(true);
              void refresh();
            }}
          />
        ) : state.status === 'closed' ? (
          <div className="card stack">
            <h2>Terminó la actividad.</h2>
            <Score state={state} />
            {state.leaderboard && <Leaderboard rows={state.leaderboard} />}
            <p className="muted">Gracias por participar.</p>
          </div>
        ) : !state.question_id ? (
          <div className="card stack">
            <h2>Ya estás en la sala.</h2>
            <p className="waiting">La primera pregunta aparece acá cuando empiece</p>
          </div>
        ) : (
          <section className="question" aria-live="polite">
            <p className="qcount">
              Pregunta {state.question_number} de {state.question_total}
            </p>
            <h2 className="qtext">{state.question_text}</h2>
            {state.show_results ? (
              <>
                <Feedback state={state} />
                <Results state={state} />
                <Score state={state} />
              </>
            ) : (
              <>
                <div className="answers">
                  {state.options.map((o, i) => {
                    const chosen = state.my_answer === o.id;
                    return (
                      <button
                        className={'answer c' + i + (chosen ? ' chosen' : '') + (state.my_answer && !chosen ? ' faded' : '')}
                        key={o.id}
                        onClick={() => submit(o.id)}
                        disabled={!!saving || !!state.my_answer || state.is_admin}
                        aria-pressed={chosen}
                      >
                        <Shape index={i} size={26} />
                        <span>{o.label}</span>
                        {saving === o.id && <span className="sr-only">Enviando</span>}
                      </button>
                    );
                  })}
                </div>
                {state.my_answer && <p className="sent">Respuesta enviada. Mirá la pantalla mientras llegan las demás.</p>}
              </>
            )}
          </section>
        )}
      </>
    );
  }

  return (
    <Layout>
      <div className="participant">
        <p className="room-code">Sala {pin}</p>
        {body}
        {localError && <p className="error">{localError}</p>}
      </div>
    </Layout>
  );
}
