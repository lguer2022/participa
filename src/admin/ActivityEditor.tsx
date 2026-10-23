import { useEffect, useState } from 'react';
import Shape from '../components/Shape';
import QuestionForm from './QuestionForm';
import { errorMessage, modeLabel, rpc, type ActivityDetail } from '../api';

type Props = {
  detail: ActivityDetail;
  onChanged: () => Promise<void>;
  onLaunch: () => void;
  onDeleted: () => void;
};

export default function ActivityEditor({ detail, onChanged, onLaunch, onDeleted }: Props) {
  const [title, setTitle] = useState(detail.title);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const locked = detail.has_open_session;
  const n = detail.questions.length;

  useEffect(() => {
    setTitle(detail.title);
    setEditing(null);
    setError('');
  }, [detail.id, detail.title]);

  async function run(fn: () => Promise<unknown>) {
    setError('');
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const saveTitle = () => {
    if (title.trim() && title.trim() !== detail.title)
      void run(() => rpc('admin_rename_activity', { p_activity: detail.id, p_title: title }));
  };

  return (
    <section className="editor" aria-label="Editar actividad">
      <div className="editor-head">
        <input
          className="title-input"
          value={title}
          maxLength={120}
          aria-label="Título de la actividad"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <div className="row wrap">
          <span className={'tag ' + detail.mode}>{modeLabel[detail.mode]}</span>
          <span className="muted small">
            {n} {n === 1 ? 'pregunta' : 'preguntas'}
          </span>
          <span className="spacer" />
          <button disabled={!n} onClick={onLaunch}>
            {locked ? 'Volver a la sala abierta' : 'Abrir sala'}
          </button>
        </div>
      </div>

      {locked && <p className="alert">Esta actividad tiene una sala abierta. Cerrala para editar las preguntas.</p>}
      {error && <p className="error">{error}</p>}

      <ol className="qlist">
        {detail.questions.map((q, idx) =>
          editing === q.id ? (
            <li key={q.id} className="qitem editing">
              <QuestionForm
                mode={detail.mode}
                initial={q}
                submitLabel="Guardar cambios"
                onCancel={() => setEditing(null)}
                onSave={async (text, options, correct) => {
                  await rpc('admin_update_question', { p_question: q.id, p_text: text, p_options: options, p_correct: correct });
                  setEditing(null);
                  await onChanged();
                }}
              />
            </li>
          ) : (
            <li key={q.id} className="qitem">
              <span className="qnum">{idx + 1}</span>
              <div className="qbody">
                <p className="qtitle">{q.body}</p>
                <ul className="qopts">
                  {q.options.map((o, i) => (
                    <li key={o.id} className={'c' + i + (o.is_correct ? ' correct' : '')}>
                      <Shape index={i} size={12} /> {o.label}
                      {o.is_correct && <span className="sr-only"> (correcta)</span>}
                    </li>
                  ))}
                </ul>
              </div>
              {!locked && (
                <div className="qactions">
                  <button className="icon" aria-label="Subir" title="Subir" disabled={idx === 0}
                    onClick={() => run(() => rpc('admin_move_question', { p_question: q.id, p_delta: -1 }))}>
                    ↑
                  </button>
                  <button className="icon" aria-label="Bajar" title="Bajar" disabled={idx === n - 1}
                    onClick={() => run(() => rpc('admin_move_question', { p_question: q.id, p_delta: 1 }))}>
                    ↓
                  </button>
                  <button className="ghost small" onClick={() => setEditing(q.id)}>
                    Editar
                  </button>
                  <button
                    className="ghost small danger"
                    onClick={() => {
                      const extra = q.has_responses ? ' También se borran sus votos de salas anteriores.' : '';
                      if (confirm('¿Borrar esta pregunta?' + extra))
                        void run(() => rpc('admin_delete_question', { p_question: q.id }));
                    }}
                  >
                    Borrar
                  </button>
                </div>
              )}
            </li>
          ),
        )}
      </ol>

      {!locked && (
        <div className="addq">
          <h3>{n ? 'Agregar otra pregunta' : 'Primera pregunta'}</h3>
          <QuestionForm
            key={n}
            mode={detail.mode}
            submitLabel="Agregar pregunta"
            onSave={async (text, options, correct) => {
              await rpc('admin_add_question', { p_activity: detail.id, p_text: text, p_options: options, p_correct: correct });
              await onChanged();
            }}
          />
        </div>
      )}

      {!locked && (
        <button
          className="ghost danger small delete-activity"
          onClick={() => {
            if (confirm(`¿Borrar «${detail.title}» con todas sus preguntas y resultados? No se puede deshacer.`))
              rpc('admin_delete_activity', { p_activity: detail.id })
                .then(onDeleted)
                .catch((e) => setError(errorMessage(e)));
          }}
        >
          Borrar actividad
        </button>
      )}
    </section>
  );
}
