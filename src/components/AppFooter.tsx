import React from 'react';
import { Link } from 'react-router-dom';
import zypaceLogo from '../assets/zypace_solo_logo.png';
import poweredByStrava from '../assets/1.2-Strava-API-Logos/Powered by Strava/pwrdBy_strava_white/api_logo_pwrdBy_strava_horiz_white.svg';

const year = new Date().getFullYear();

const AppFooter: React.FC = () => {
  return (
    <footer className="mt-auto border-t border-zinc-800 bg-zinc-950 text-zinc-400 text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10 grid gap-10 md:grid-cols-4">
        <div className="space-y-3">
          <img src={zypaceLogo} alt="Zypace" className="h-8 w-auto" style={{ filter: 'brightness(0) invert(1)' }} />
          <p className="text-xs leading-relaxed text-zinc-500">Plataforma para planificar, seguir y optimizar tu entrenamiento con datos y generación inteligente de planes.</p>
          <p className="text-[10px] text-zinc-600">© {year} Zypace. Todos los derechos reservados.</p>
        </div>
        <div className="space-y-3">
          <h4 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Producto</h4>
          <ul className="space-y-2 text-xs">
            <li><Link to="/app" className="hover:text-lime-400 transition-colors">Dashboard</Link></li>
            <li><Link to="/races" className="hover:text-lime-400 transition-colors">Carreras</Link></li>
            <li><Link to="/training-plan" className="hover:text-lime-400 transition-colors">Plan</Link></li>
            <li><Link to="/settings" className="hover:text-lime-400 transition-colors">Ajustes</Link></li>
          </ul>
        </div>
        <div className="space-y-3">
          <h4 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Recursos</h4>
          <ul className="space-y-2 text-xs">
            <li><a href="#" className="hover:text-lime-400 transition-colors">Guía rápida</a></li>
            <li><a href="#" className="hover:text-lime-400 transition-colors">FAQ</a></li>
            <li><a href="#" className="hover:text-lime-400 transition-colors">Changelog</a></li>
            <li><a href="#" className="hover:text-lime-400 transition-colors">Estado</a></li>
          </ul>
        </div>
        <div className="space-y-3">
          <h4 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Legal</h4>
          <ul className="space-y-2 text-xs">
            <li><Link to="/terms" className="hover:text-lime-400 transition-colors">Términos</Link></li>
            <li><Link to="/privacy" className="hover:text-lime-400 transition-colors">Privacidad</Link></li>
            <li><Link to="/security" className="hover:text-lime-400 transition-colors">Seguridad</Link></li>
            <li><Link to="/cookies" className="hover:text-lime-400 transition-colors">Cookies</Link></li>
            <li><a href="mailto:contact@zypace.com" className="hover:text-lime-400 transition-colors">Contacto</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-4 flex flex-col md:flex-row items-center justify-between gap-2">
          <p className="text-[11px] text-zinc-600">Hecho con <span className="text-lime-400">❤</span> para runners.</p>
          <div className="flex items-center gap-4 text-[11px] text-zinc-600">
            <a href="#" className="hover:text-lime-400 transition-colors">Twitter</a>
            <a href="#" className="hover:text-lime-400 transition-colors">GitHub</a>
            <a href="#" className="hover:text-lime-400 transition-colors">Blog</a>
          </div>
          <img src={poweredByStrava} alt="Powered by Strava" className="h-5 w-auto" />
        </div>
      </div>
    </footer>
  );
};

export default AppFooter;
