import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname === '/login';

  if (!isLoggedIn && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL('/map', req.url));
  }
});

export const config = {
  // Todo menos: rutas de API, internos de Next y archivos estáticos (cualquier ruta
  // con extensión). Sin esta última exclusión el middleware redirige /logo.png al
  // login y las imágenes se rompen para usuarios no autenticados.
  matcher: ['/((?!api|_next|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml|webmanifest)$).*)'],
};
