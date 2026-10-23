import type { PublicState } from '../api';
import Shape from './Shape';

export default function Results({ state, big = false }: { state: PublicState; big?: boolean }) {
  const total = state.total_votes;
  const max = Math.max(1, ...state.options.map((o) => o.votes ?? 0));
  const quiz = state.mode === 'quiz';
  return (
    <div className={'results' + (big ? ' big' : '')}>
      {state.options.map((o, i) => {
        const votes = o.votes ?? 0;
        const pct = total ? Math.round((votes / total) * 100) : 0;
        const dim = quiz && !o.is_correct;
        return (
          <div className={'result c' + i + (dim ? ' dim' : '') + (o.is_correct ? ' correct' : '')} key={o.id}>
            <div className="result-label">
              <Shape index={i} size={big ? 26 : 18} />
              <span className="result-text">{o.label}</span>
              {o.is_correct && <span className="badge good">Correcta</span>}
              {!big && state.my_answer === o.id && <span className="badge">Tu voto</span>}
            </div>
            <div className="result-bar">
              <div className="track">
                <div className="fill" style={{ width: (votes / max) * 100 + '%' }} />
              </div>
              <span className="result-num">
                {pct}% <small>({votes})</small>
              </span>
            </div>
          </div>
        );
      })}
      <p className="muted small">
        {total} {total === 1 ? 'respuesta' : 'respuestas'}
      </p>
    </div>
  );
}
