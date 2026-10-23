# Participa

Encuestas y competencias en vivo para clases, charlas y reuniones. Quien conduce proyecta un código y un QR; la audiencia responde desde el celular, sin instalar nada ni registrarse.

**Autor:** Mg. Lic. Prof. Leandro Guerschberg · 2026
**Versión:** 0.2.0

## Funcionalidades

- **Dos modalidades:** encuesta (sin respuesta correcta, para recoger opiniones) y competencia (con respuesta correcta, puntaje y ranking).
- **Preguntas de opción única** con 2 a 4 alternativas. Cada alternativa tiene un color y una forma (círculo, triángulo, cuadrado, rombo), de modo que se distinguen también con daltonismo.
- **Ingreso por código de 6 dígitos o QR**, con apodo opcional en las competencias.
- **Panel de conducción en vivo:** personas conectadas, respuestas recibidas, avance de preguntas y ranking.
- **Pantalla de proyección** pensada para leerse desde el fondo de la sala, con resultados en barras, respuesta correcta y ranking parcial y final.
- **Puntaje:** 500 puntos por acertar más hasta 500 por rapidez (decrecen durante 20 segundos).
- **Editor de actividades:** crear, renombrar, editar, reordenar y borrar preguntas y actividades.
- **Exportación de resultados** en CSV (compatible con Excel y Google Sheets).

## Tecnología

- React 19 + TypeScript, compilado con Vite.
- Supabase: PostgreSQL, autenticación (anónima para participantes, correo y contraseña para administración) y Realtime.
- Netlify para la publicación.

## Puesta en marcha

### 1. Supabase

1. Crear un proyecto en Supabase.
2. En **Authentication → Sign In / Providers**, activar **Allow anonymous sign-ins**.
3. En **Authentication → Users**, crear la cuenta de administración (correo y contraseña) y copiar su **User UID**.
4. En **SQL Editor**, ejecutar completo `supabase/schema.sql`. Luego, en una consulta aparte:

   ```sql
   insert into public.admin_users(user_id) values ('UID-DE-LA-CUENTA-ADMINISTRADORA');
   ```

5. Desactivar **Allow new users to sign up** para que nadie más pueda crear cuentas permanentes.
6. En **Authentication → Rate Limits**, ajustar el límite de ingresos anónimos por hora al tamaño de la audiencia esperada (el valor por defecto es bajo y en una red compartida limita la cantidad de personas que pueden entrar).
7. En **Project Settings → API Keys**, copiar la URL del proyecto y la **publishable key** (nunca la *secret key*).

`supabase/schema.sql` se puede volver a ejecutar para actualizar una base existente: no borra datos.

### 2. Desarrollo local

Requiere Node.js 20 o superior.

```bash
npm install
cp .env.example .env   # completar con la URL y la publishable key
npm run dev
```

Rutas principales:

| Ruta | Uso |
| --- | --- |
| `/` | Ingreso de participantes con el código |
| `/admin` | Panel de administración |
| `/join/<código>` | Sala, vista del participante |
| `/present/<código>` | Pantalla para proyectar |

La sesión de administración y la de participante comparten el navegador: para probar ambas a la vez, usar navegadores o perfiles distintos.

### 3. Publicación en Netlify

1. *Add new project → Import an existing project* y elegir este repositorio. `netlify.toml` ya define la compilación y la redirección de rutas.
2. En *Environment variables*, cargar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Agregar la dirección publicada como *Site URL* en **Supabase → Authentication → URL Configuration**.

Las variables `VITE_` quedan visibles en el navegador: solo deben contener la URL pública y la publishable key.

## Seguridad y privacidad

- Ninguna tabla es accesible directamente desde el cliente. Toda la lectura y escritura pasa por funciones del servidor que validan la identidad, el rol de administración, la sala y la pregunta.
- La respuesta correcta y los votos no se envían a los dispositivos hasta que se revelan los resultados.
- Cada identidad puede votar una sola vez por pregunta.
- De cada participante solo se guarda un identificador anónimo y, si lo elige, un apodo. No se registran nombres, correos ni direcciones IP.
- Los avisos de Realtime solo indican "actualizar"; no transportan datos.
- Las salas abiertas se cierran automáticamente a las 24 horas y sus códigos se reutilizan.

## Límites conocidos

- No es apto para votaciones vinculantes: borrar las cookies o cambiar de navegador permite obtener una nueva identidad.
- Antes de usarlo con audiencias abiertas o masivas conviene activar CAPTCHA para los ingresos anónimos y hacer una prueba de carga. El plan gratuito de Supabase admite 200 conexiones Realtime simultáneas.
- Los usuarios anónimos no se eliminan solos. Para limpiar los de más de 30 días:

  ```sql
  delete from auth.users where is_anonymous and created_at < now() - interval '30 days';
  ```

## Historial de versiones

- **0.2.0** — Nuevo diseño visual; editor de actividades; puntaje, apodos y ranking; panel de sala en vivo; exportación CSV; cierre automático de salas y reutilización de códigos.
- **0.1.0** — Primera versión: encuestas y competencias de opción única, ingreso por código y QR, resultados en vivo.

## Derechos

© 2026 Mg. Lic. Prof. Leandro Guerschberg. Todos los derechos reservados. Ver [LICENSE](LICENSE).
