import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Shape from '../components/Shape';

const steps = [
  { title: 'Armá las preguntas', text: 'Una encuesta para escuchar opiniones o una competencia con respuesta correcta y ranking.' },
  { title: 'Mostrá el código', text: 'La sala proyecta un QR y seis números. Cada persona entra desde su celular, sin instalar nada.' },
  { title: 'Mirá las respuestas', text: 'Los votos llegan en vivo y vos decidís cuándo revelar los resultados.' },
];

export default function Home() {
  const [pin, setPin] = useState('');
  const navigate = useNavigate();
  const ready = /^\d{6}$/.test(pin);

  return (
    <Layout>
      <section className="hero">
        <div className="hero-copy">
          <h1>
            Preguntale
            <br />a la sala.
          </h1>
          <p className="lead">
            Encuestas y competencias en vivo para clases, charlas y reuniones. Quien participa entra con un código desde
            el celular.
          </p>
          <form
            className="pinform"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) navigate('/join/' + pin);
            }}
          >
            <label htmlFor="pin">Código de la sala</label>
            <div className="pinrow">
              <input
                id="pin"
                value={pin}
                maxLength={6}
                inputMode="numeric"
                autoComplete="off"
                placeholder="000000"
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              />
              <button disabled={!ready}>Entrar</button>
            </div>
          </form>
        </div>
        <div className="hero-cards" aria-hidden="true">
          {['Sí', 'No', 'Quizás', 'No sé'].map((t, i) => (
            <div key={t} className={'paddle c' + i}>
              <Shape index={i} size={30} />
              <span>{t}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="steps" aria-labelledby="como">
        <h2 id="como">Cómo funciona</h2>
        <ol>
          {steps.map((s) => (
            <li key={s.title}>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </Layout>
  );
}
