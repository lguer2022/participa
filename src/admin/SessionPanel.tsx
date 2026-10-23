import { useState } from 'react';
import Leaderboard from '../components/Leaderboard';
import { downloadCsv, errorMessage, phaseLabel, rpc, type AdminSession, type ExportData } from '../api';
import { useRoom } from '../useRoom';

type Props = {
  session: AdminSession;
  onAction: (a: 'next' | 'reveal' | 'close') => Promise<void>;
  onDismiss: () => void;
};

export default function SessionPanel({ session, onAction, onDismiss }: Props) {
  const { state } = useRoom(session.pin);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const link = `${window.location.origin}/join/${session.pin}`;
  const closed = session.status === 'closed';
  const isLast = session.question_index + 1 >= session.question_total;
  const nextLabel =
    session.phase === 'waiting' ? 'Empezar con la primera pregunta' : isLast ? 'Terminar la actividad' : 'Pasar a la siguiente pregunta';
  const participants = state?.participants ?? 0;
  const votes = state?.total_votes ?? 0;

  async function act(a: 'next' | 'reveal' | 'close') {
    setBusy(true);
    try {
      await onAction(a);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* el navegador no permitió copiar */
    }
  }

  async function exportCsv() {
    setError('');
    try {
      const data = await rpc<ExportData>('admin_export', { p_session: session.id });
      const slug = session.title.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      downloadCsv(`participa-${slug || 'resultados'}-${session.pin}.csv`, data);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section className={'session' + (closed ? ' closed' : '')} aria-label="Sala en curso">
      <div className="session-head">
        <div>
          <p className="muted">{closed ? 'Sala cerrada' : 'Sala abierta'}: {session.title}</p>
          <p className="session-pin">{session.pin}</p>
        </div>
        <dl className="stats">
          <div>
            <dt>Personas</dt>
            <dd>{participants}</dd>
          </div>
          {!closed && session.phase !== 'waiting' && (
            <div>
              <dt>Respuestas</dt>
              <dd>
                {votes}
                <small>/{participants}</small>
              </dd>
            </div>
          )}
        </dl>
      </div>

      {!closed && (
        <>
          <p className="session-phase">
            {phaseLabel[session.phase]}
            {session.question_index >= 0 && (
              <>
                {' '}
                (pregunta {session.question_index + 1} de {session.question_total})
              </>
            )}
          </p>
          {state?.question_text && <p className="session-q">{state.question_text}</p>}
          <div className="row wrap">
            <button disabled={busy} onClick={() => act('next')}>
              {nextLabel}
            </button>
            <button className="secondary" disabled={busy || session.phase !== 'question'} onClick={() => act('reveal')}>
              Mostrar resultados
            </button>
            <button className="ghost" onClick={() => window.open('/present/' + session.pin, '_blank', 'noopener')}>
              Abrir el proyector
            </button>
          </div>
          <p className="small muted">
            Enlace para participantes: <b>{link}</b>{' '}
            <button type="button" className="linkbutton" onClick={copy}>
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </p>
        </>
      )}

      {session.mode === 'quiz' && state?.leaderboard?.length ? (
        <div className="session-board">
          <p className="muted small">Ranking</p>
          <Leaderboard rows={state.leaderboard} />
        </div>
      ) : null}

      {error && <p className="error">{error}</p>}

      <div className="row wrap session-foot">
        <button className="ghost" onClick={exportCsv}>
          Descargar resultados (CSV)
        </button>
        {closed ? (
          <button className="ghost" onClick={onDismiss}>
            Ocultar
          </button>
        ) : (
          <button
            className="danger ghost"
            disabled={busy}
            onClick={() => {
              if (confirm('¿Cerrar la sala? Nadie más va a poder responder.')) void act('close');
            }}
          >
            Cerrar la sala
          </button>
        )}
      </div>
    </section>
  );
}
