import { lazy, Suspense } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import Shell from './components/Shell';
import { Loading } from './components/bits';
import Home from './pages/Home';

const Themes = lazy(() => import('./pages/Themes'));
const Theme = lazy(() => import('./pages/Theme'));
const Ideas = lazy(() => import('./pages/Ideas'));
const Idea = lazy(() => import('./pages/Idea'));
const Timing = lazy(() => import('./pages/Timing'));
const Library = lazy(() => import('./pages/Library'));
const Program = lazy(() => import('./pages/Program'));
const Coming = lazy(() => import('./pages/Coming'));
const Niches = lazy(() => import('./pages/Niches'));
const Centers = lazy(() => import('./pages/Centers'));
const Center = lazy(() => import('./pages/Center'));
const MapPage = lazy(() => import('./pages/Map'));
const Engine = lazy(() => import('./pages/Engine'));

const NotFound = () => <div className="pt-24"><h1 className="z-h1">Nothing here</h1><p className="z-lede mt-5">That page does not exist. <Link to="/" className="z-link">Back to the front page</Link>.</p></div>;

export default function App() {
  return (
    <Suspense fallback={<div className="max-w-[1240px] mx-auto px-5 sm:px-8"><Loading /></div>}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="themes" element={<Themes />} />
          <Route path="themes/:id" element={<Theme />} />
          <Route path="ideas" element={<Ideas />} />
          <Route path="idea/:id" element={<Idea />} />
          <Route path="timing" element={<Timing />} />
          <Route path="library" element={<Library />} />
          <Route path="program/:key" element={<Program />} />
          <Route path="coming" element={<Coming />} />
          <Route path="niches" element={<Niches />} />
          <Route path="centers" element={<Centers />} />
          <Route path="center/:id" element={<Center />} />
          <Route path="map" element={<MapPage />} />
          <Route path="engine" element={<Engine />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
