import { Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import Admin from './pages/Admin';
import Join from './pages/Join';
import Present from './pages/Present';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/join/:pin" element={<Join />} />
      <Route path="/present/:pin" element={<Present />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
