import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import Results from '../components/Results';
import Leaderboard from '../components/Leaderboard';
import Shape from '../components/Shape';
import { ConfigAlert, Wordmark } from '../components/Layout';
import { useRoom } from '../useRoom';

/** Pantalla para proyectar: sin menú, pensada para leerse desde el fondo de la sala. */
export default function Present() {
  const { pin = '' } = useParams();
  const { state, loading, error } = useRoom(pin);
  const link = `${window.location.origin}/join/${pin}`;
  const host = window.location.host;

  function fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }

  let body;
  if (loading) body = <p className="waiting">Conectando</p>;
  else if (error) body = <h2>{error}</h2>;
  else if (state) {
    if (state.status === 'closed') {
      body = (
        <div className="finale">
          <h1>{state.title}</h1>
          {state.mode === 'quiz' && state.leaderboard?.length ? (
            <>
              <h2>Ranking final</h2>
              <Leaderboard rows={state.leaderboard} big />
            </>
          ) : (
            <h2>Gracias por participar.</h2>
          )}
        </div>
      );
    } else if (!state.question_id) {
      body = (
        <div className="lobby">
          <div className="lobby-text">
            <h1>{state.title}</h1>
            <p className="lobby-how">
              Entrá a <b>{host}</b> y escribí el código
            </p>
            <div className="bigpin" aria-label={'Código ' + pin.split('').join(' ')}>
              {pin.slice(0, 3)}
              <span> </span>
              {pin.slice(3)}
            </div>
            <p className="joined">
              <span className="pulse" aria-hidden="true" />
              {state.participants} {state.participants === 1 ? 'persona adentro' : 'personas adentro'}
            </p>
          </div>
          <div className="qr">
            <QRCodeSVG value={link} size={260} marginSize={0} />
            <span>o escaneá con la cámara</span>
          </div>
        </div>
      );
    } else {
      const pct = state.participants ? Math.min(100, (state.total_votes / state.participants) * 100) : 0;
      body = (
        <div className="stage">
          <p className="qcount">
            Pregunta {state.question_number} de {state.question_total}
          </p>
          <h1 className="stage-q">{state.question_text}</h1>
          {state.show_results ? (
            <Results state={state} big />
          ) : (
            <>
              <div className="stage-options">
                {state.options.map((o, i) => (
                  <div key={o.id} className={'stage-option c' + i}>
                    <Shape index={i} size={34} />
                    <span>{o.label}</span>
                  </div>
                ))}
              </div>
              <div className="progress" aria-label="Respuestas recibidas">
                <div className="track">
                  <div className="fill" style={{ width: pct + '%' }} />
                </div>
                <span>
                  <b>{state.total_votes}</b> de {state.participants} respondieron
                </span>
              </div>
            </>
          )}
          {state.show_results && state.mode === 'quiz' && state.leaderboard?.length ? (
            <aside className="stage-board">
              <h2>Van ganando</h2>
              <Leaderboard rows={state.leaderboard.slice(0, 3)} />
            </aside>
          ) : null}
        </div>
      );
    }
  }

  return (
    <div className="present">
      <ConfigAlert />
      <div className="present-bar">
        <Wordmark />
        <span>
          {host}/join/{pin}
        </span>
        <button className="ghost small" onClick={fullscreen}>
          Pantalla completa
        </button>
      </div>
      <div className="present-body">{body}</div>
    </div>
  );
}
