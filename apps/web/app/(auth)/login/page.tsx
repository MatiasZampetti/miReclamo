'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Loader2, MessageSquare, BarChart3, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GradientHeading } from '@/components/ui/gradient-heading';
import { ThemeToggle } from '@/components/theme-toggle';
import GradientAnimation from '@/components/ui/bg-animated-gradient';

const GRADIENTS = [
  {
    stops: [
      { color: '#1e3a8a', position: 0 },
      { color: '#4c1d95', position: 45 },
      { color: '#0f172a', position: 100 },
    ],
    centerX: 20,
    centerY: 25,
  },
  {
    stops: [
      { color: '#2563eb', position: 0 },
      { color: '#7c3aed', position: 40 },
      { color: '#0f172a', position: 100 },
    ],
    centerX: 80,
    centerY: 30,
  },
  {
    stops: [
      { color: '#0ea5e9', position: 0 },
      { color: '#6366f1', position: 50 },
      { color: '#0f172a', position: 100 },
    ],
    centerX: 70,
    centerY: 80,
  },
  {
    stops: [
      { color: '#4338ca', position: 0 },
      { color: '#1e3a8a', position: 50 },
      { color: '#0f172a', position: 100 },
    ],
    centerX: 25,
    centerY: 75,
  },
];

const FEATURES = [
  { icon: MessageSquare, title: 'Reclamos por WhatsApp', desc: 'Tus vecinos reclaman conversando con un agente IA.' },
  { icon: BarChart3, title: 'Panel en tiempo real', desc: 'Seguí el estado y las métricas de cada reclamo.' },
  { icon: ShieldCheck, title: 'Gestión centralizada', desc: 'Categorías, estados y notas en un solo lugar.' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn('credentials', { email, password, redirect: false });

    if (result?.error) {
      setError('Email o contraseña incorrectos');
      setLoading(false);
    } else {
      router.push('/complaints');
    }
  }

  return (
    <div className="relative min-h-screen lg:grid lg:grid-cols-2">
      {/* Panel izquierdo: branding + gradiente animado */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden p-12 text-white">
        <GradientAnimation gradients={GRADIENTS} animationDuration={12} />
        {/* velo para contraste */}
        <div className="absolute inset-0 bg-black/20" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm ring-1 ring-white/25">
            <span className="text-xl font-bold">R</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">miReclamo</span>
        </div>

        <div className="relative z-10 space-y-8">
          <div className="space-y-3">
            <GradientHeading variant="light" size="xl" className="!pb-0 drop-shadow">
              Reclamos ciudadanos, simples y modernos
            </GradientHeading>
            <p className="max-w-md text-white/70">
              La plataforma para que tu municipalidad gestione cada reclamo de punta a punta.
            </p>
          </div>

          <ul className="space-y-5">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <li key={f.title} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm ring-1 ring-white/20">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium">{f.title}</p>
                    <p className="text-sm text-white/65">{f.desc}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="relative z-10 text-xs text-white/50">
          © {new Date().getFullYear()} miReclamo · Panel de administración
        </p>
      </div>

      {/* Panel derecho: formulario */}
      <div className="relative flex items-center justify-center px-4 py-12 bg-background">
        {/* gradiente sutil de fondo en mobile */}
        <div className="absolute inset-0 lg:hidden overflow-hidden opacity-40">
          <GradientAnimation gradients={GRADIENTS} animationDuration={12} />
        </div>

        <div className="absolute right-4 top-4 z-10">
          <ThemeToggle />
        </div>

        <div className="relative z-10 w-full max-w-sm">
          <div className="mb-8 text-center lg:text-left">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm lg:hidden">
              <span className="text-xl font-bold">R</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Bienvenido de nuevo</h1>
            <p className="mt-1 text-sm text-muted-foreground">Ingresá tus credenciales para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@mireclamo.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? 'Ingresando...' : 'Ingresar'}
            </Button>
          </form>

          <div className="mt-6 rounded-lg border bg-muted/40 px-4 py-3 text-center text-xs text-muted-foreground">
            Demo: <span className="font-medium text-foreground">admin@mireclamo.com</span> · <span className="font-medium text-foreground">admin123</span>
          </div>
        </div>
      </div>
    </div>
  );
}
