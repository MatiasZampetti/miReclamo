import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LogoProps {
  /** Lado del contenedor en px */
  size?: number;
  className?: string;
  /** Contenedor blanco redondeado (recomendado sobre fondos oscuros o de color) */
  boxed?: boolean;
}

/**
 * Isotipo de miReclamo. El PNG tiene fondo transparente y sus separadores
 * internos son huecos, por eso `boxed` apoya el logo sobre un cuadro blanco
 * para que se lea igual en cualquier fondo.
 */
export function Logo({ size = 40, className, boxed = true }: LogoProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden',
        boxed && 'rounded-xl bg-white shadow-sm ring-1 ring-black/5',
        className
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/logo.png"
        alt="miReclamo"
        width={512}
        height={512}
        priority
        className={cn('object-contain', boxed ? 'h-[80%] w-[80%]' : 'h-full w-full')}
      />
    </div>
  );
}

export default Logo;
