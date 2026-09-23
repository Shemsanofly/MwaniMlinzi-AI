import { Link } from 'react-router-dom';

export default function Logo({ to = '/', light = false }) {
  return (
    <Link to={to} className="flex items-center gap-2" aria-label="MwaniMlinzi AI home">
      <img src="/favicon.svg" alt="" className="h-8 w-8" />
      <span className={`text-lg font-extrabold tracking-tight ${light ? 'text-white' : 'text-ocean-800'}`}>MwaniMlinzi <span className={light ? 'text-teal-300' : 'text-seaweed-600'}>AI</span></span>
    </Link>
  );
}
