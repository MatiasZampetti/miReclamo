import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { api } from './api-client';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const { token, user } = await api.auth.login(
            credentials.email as string,
            credentials.password as string,
          );
          // Devolvemos todos los campos explícitamente para que NextAuth los persista
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            tenant_id: user.tenant_id,
            accessToken: token,   // ← guardamos como accessToken directamente
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        // user aquí es el objeto devuelto por authorize
        const u = user as {
          id: string;
          email: string;
          name: string;
          role: string;
          tenant_id: string;
          accessToken: string;
        };
        token.accessToken = u.accessToken;
        token.role = u.role;
        token.tenant_id = u.tenant_id;
      }
      return token;
    },
    session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.user.role = token.role as string;
      session.user.tenant_id = token.tenant_id as string;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
});

// Aumentamos los tipos de NextAuth v5
declare module 'next-auth' {
  interface User {
    role: string;
    tenant_id: string;
    accessToken: string;
  }
  interface Session {
    accessToken: string;
    user: {
      role: string;
      tenant_id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

// next-auth v5 reexporta el tipo JWT desde @auth/core/jwt sin declararlo propio,
// así que la augmentation tiene que apuntar al módulo original.
declare module '@auth/core/jwt' {
  interface JWT {
    accessToken?: string;
    role?: string;
    tenant_id?: string;
  }
}
