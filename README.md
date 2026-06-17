# miReclamo

Sistema de reclamos ciudadanos por WhatsApp con clasificación automática mediante IA y dashboard de administración para municipalidades.

---

## Descripción general

Un ciudadano manda un mensaje de texto libre por WhatsApp describiendo su reclamo. Un agente de inteligencia artificial (Claude de Anthropic) interpreta el mensaje, lo clasifica automáticamente en una categoría (luminaria, limpieza, baches, etc.), y si le falta información le pregunta al ciudadano de forma conversacional. Una vez que tiene todo, guarda el reclamo en la base de datos y el ciudadano recibe una confirmación. Los administradores acceden a un dashboard web para ver, gestionar y hacer seguimiento de todos los reclamos.

---

## Stack tecnológico

### Backend
| Tecnología | Versión | Uso |
|---|---|---|
| Node.js | v24+ | Runtime del servidor |
| Fastify | v4 | Framework HTTP, manejo de rutas y plugins |
| TypeScript | v5 | Tipado estático |
| tsx | v4 | Ejecución de TypeScript en desarrollo |
| Zod | v3 | Validación de esquemas y variables de entorno |
| bcryptjs | v2 | Hash de contraseñas de administradores |
| @fastify/jwt | v8 | Autenticación JWT para el dashboard |
| @fastify/cors | v9 | Configuración de CORS entre API y frontend |
| @fastify/formbody | v7 | Parseo de form-data enviado por Twilio |

### Frontend
| Tecnología | Versión | Uso |
|---|---|---|
| Next.js | v14 | Framework React con App Router |
| React | v18 | Librería de UI |
| Tailwind CSS | v3 | Estilos utilitarios |
| next-auth | v5 beta | Autenticación del dashboard |
| @tanstack/react-table | v8 | Tabla de reclamos con filtros y paginación |
| recharts | v2 | Gráficos de estadísticas |
| react-hook-form | v7 | Manejo de formularios |
| lucide-react | — | Íconos |

### Inteligencia Artificial
| Tecnología | Detalle |
|---|---|
| Anthropic Claude API | Modelo: `claude-haiku-4-5-20251001` |
| SDK | `@anthropic-ai/sdk` v0.30 |
| Estrategia | Tool use (`save_complaint`) para señalar cuándo guardar el reclamo |
| Prompt | Dinámico — se construye en tiempo real con las categorías activas del tenant |
| Costo estimado | < $0.01 por conversación completa con Haiku |

### Base de datos
| Tecnología | Detalle |
|---|---|
| Supabase | PostgreSQL administrado en la nube |
| @supabase/supabase-js | v2 — cliente oficial |
| Autenticación | Service Role Key (desde el backend, bypasea RLS) |
| Multi-tenant | Todas las tablas tienen `tenant_id` para soportar múltiples municipalidades |

### WhatsApp / Mensajería
| Tecnología | Detalle |
|---|---|
| Twilio WhatsApp Sandbox | Para desarrollo y testing |
| SDK | `twilio` v5 |
| Mecanismo | Webhook HTTP POST — Twilio llama a tu servidor cuando llega un mensaje |
| Verificación | Firma HMAC con `X-Twilio-Signature` |

### Infraestructura local
| Tecnología | Uso |
|---|---|
| ngrok | Túnel para exponer localhost a internet (necesario para el webhook de Twilio) |
| npm workspaces | Monorepo — maneja `apps/api` y `apps/web` desde la raíz |

---

## Arquitectura del sistema

```
Ciudadano
    │
    │  WhatsApp
    ▼
Twilio (intermediario WhatsApp Business)
    │
    │  POST /webhook/twilio
    │  (form-urlencoded: Body, From)
    ▼
Fastify API — apps/api (puerto 3001)
    │
    ├── Responde 200 a Twilio inmediatamente (evita timeout de 15s)
    │
    └── setImmediate (procesamiento async)
            │
            ├── Carga/crea sesión en Supabase
            ├── Carga categorías activas del tenant
            ├── Construye system prompt dinámico
            │
            ▼
        Claude API (claude-haiku-4-5)
            │
            ├── Respuesta de texto → envía por WhatsApp via Twilio API
            │
            └── Tool use: save_complaint
                    │
                    ▼
                Supabase (PostgreSQL)
                    │
                    ▼
                Dashboard admin — apps/web (puerto 3000)
```

---

## Base de datos — Esquema

### Tablas principales

| Tabla | Descripción |
|---|---|
| `tenants` | Entidades (municipalidades). Base del modelo multi-tenant. |
| `admin_users` | Usuarios del dashboard. Contraseña hasheada con bcrypt. |
| `categories` | Categorías de reclamos, configurables por tenant (luminaria, limpieza, etc.) |
| `subcategories` | Subcategorías anidadas dentro de cada categoría |
| `sessions` | Estado de cada conversación de WhatsApp activa. El contexto se guarda en JSONB. |
| `messages` | Historial completo de mensajes de cada conversación |
| `complaints` | Reclamos finalizados y clasificados por el agente |

### Contexto de sesión (JSONB)

Cada fila de `sessions` guarda el estado de la conversación en un campo `context`:

```json
{
  "state": "collecting",
  "collected": {
    "category_id": "uuid-de-luminaria",
    "description": "Hay un poste apagado",
    "location": null
  },
  "missing_fields": ["location"],
  "messages": [
    { "role": "user", "content": "hay un poste apagado" },
    { "role": "assistant", "content": "¿En qué dirección está el poste?" }
  ],
  "attempts": 2
}
```

Esto hace que la API sea **stateless** — no guarda nada en memoria, todo vive en la base de datos. Si el servidor se reinicia, las conversaciones en curso continúan sin problema.

---

## API — Endpoints

### Públicos
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/webhook/twilio` | Recibe mensajes entrantes de WhatsApp |
| GET | `/webhook/twilio` | Verificación del webhook (Twilio) |
| POST | `/api/auth/login` | Login de administrador, devuelve JWT |
| GET | `/health` | Health check del servidor |

### Protegidos (requieren JWT)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/complaints` | Lista reclamos con filtros (status, category, fechas, paginación) |
| GET | `/api/complaints/:id` | Detalle de un reclamo |
| GET | `/api/complaints/:id/messages` | Historial de la conversación de WhatsApp |
| PATCH | `/api/complaints/:id/status` | Cambiar estado del reclamo |
| GET | `/api/categories` | Lista categorías con subcategorías anidadas |
| POST | `/api/categories` | Crear categoría |
| PATCH | `/api/categories/:id` | Editar categoría |
| DELETE | `/api/categories/:id` | Eliminar categoría |
| POST | `/api/categories/:id/subcategories` | Crear subcategoría |
| PATCH | `/api/categories/:id/subcategories/:subId` | Editar subcategoría |
| DELETE | `/api/categories/:id/subcategories/:subId` | Eliminar subcategoría |
| GET | `/api/stats/summary` | Totales y promedios |
| GET | `/api/stats/categories` | Reclamos por categoría |
| GET | `/api/stats/timeline` | Reclamos en el tiempo (día/semana/mes) |

---

## Agente de IA — Diseño

### Flujo conversacional

```
GREETING → COLLECTING → (Claude invoca save_complaint) → COMPLETED
```

### Tool use

El agente usa un tool de Claude llamado `save_complaint`. En lugar de parsear texto libre para detectar cuándo terminar, Claude llama explícitamente a este tool cuando tiene toda la información necesaria. Esto es más robusto y predecible que parsear lenguaje natural.

Campos del tool:
- `category_id` — UUID de la categoría clasificada
- `subcategory_id` — UUID de la subcategoría (opcional)
- `description` — texto completo del reclamo
- `location` — dirección extraída de la conversación
- `summary` — resumen en una oración generado por Claude
- `complainant_name` — nombre si el ciudadano lo mencionó
- `confidence` — nivel de confianza en la clasificación (0.0 a 1.0)

### Prompt dinámico

El system prompt se construye en cada request con las categorías activas del tenant. Esto significa que **agregar o editar una categoría desde el dashboard tiene efecto inmediato** en el próximo mensaje que procese el agente.

---

## Autenticación

- El dashboard usa **NextAuth v5** con el provider `Credentials`
- Al hacer login, NextAuth llama a `POST /api/auth/login` en el backend
- El backend verifica la contraseña con bcrypt y devuelve un **JWT firmado** (expira en 8h)
- El JWT se guarda en la sesión de NextAuth y se adjunta como `Bearer token` en cada request al backend
- El middleware de Next.js (`middleware.ts`) protege todas las rutas del dashboard y redirige a `/login` si no hay sesión

---

## Setup inicial

### 1. Instalar dependencias

```powershell
npm install
```

### 2. Configurar la base de datos en Supabase

1. Crear un proyecto en [supabase.com](https://supabase.com)
2. Ir a **SQL Editor** y ejecutar:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/seed.sql`
3. Generar el hash de la contraseña admin:
```powershell
cd apps/api; node -e "import('bcryptjs').then(b => b.default.hash('admin123', 10).then(h => console.log(h)))"
```
4. En **Table Editor → admin_users** reemplazar el campo `password_hash` con el hash generado

### 3. Configurar variables de entorno

**`apps/api/.env`**:
```
PORT=3001
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...          # Settings > API > service_role key
ANTHROPIC_API_KEY=sk-ant-...         # console.anthropic.com > API Keys
TWILIO_ACCOUNT_SID=ACxxxx            # console.twilio.com > Dashboard
TWILIO_AUTH_TOKEN=xxxx               # console.twilio.com > Dashboard
TWILIO_WHATSAPP_NUMBER=+14155238886  # Messaging > Try it out > Send a WhatsApp message
JWT_SECRET=min-32-caracteres-random
DEFAULT_TENANT_ID=00000000-0000-0000-0000-000000000001
```

**`apps/web/.env.local`**:
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=secreto-random
```

### 4. Configurar Twilio + ngrok

```powershell
# Instalar ngrok (una sola vez)
winget install ngrok.ngrok
ngrok config add-authtoken TU_TOKEN_DE_NGROK
```

Activar el sandbox de WhatsApp:
1. Ir a **Messaging → Try it out → Send a WhatsApp message** en Twilio
2. Desde tu celular, mandar el código `join xxxx-xxxx` al número del sandbox
3. Twilio responde confirmando la activación

### 5. Correr el proyecto

```powershell
# Terminal 1 — API
npm run dev:api

# Terminal 2 — Dashboard
npm run dev:web

# Terminal 3 — ngrok
ngrok http 3001
```

Copiar la URL de ngrok (ej: `https://xxxx.ngrok-free.dev`) y configurar en Twilio:
- **Messaging → Try it out → Send a WhatsApp message → Sandbox settings**
- "When a message comes in" → `https://xxxx.ngrok-free.dev/webhook/twilio`
- Método: `HTTP POST` → **Save**

---

## Correr el proyecto

- Dashboard: http://localhost:3000
- API: http://localhost:3001
- Inspector ngrok: http://127.0.0.1:4040

Credenciales por defecto:
| Campo | Valor |
|---|---|
| Email | admin@mireclamo.com |
| Contraseña | admin123 |

---

## Categorías por defecto (seed)

| Categoría | Subcategorías |
|---|---|
| Luminaria | Poste apagado, Poste dañado, Cables sueltos |
| Limpieza | Basura acumulada en vereda, Contenedor desbordado, Limpieza de zanjón |
| Baches y pavimento | Bache en calzada, Vereda rota |
| Espacios verdes | Poda de árboles, Mantenimiento de plaza |
| Tránsito | Semáforo roto, Señal faltante |

Todas son editables desde el dashboard en `/categories`.

---

## Estructura del proyecto

```
miReclamo/
├── apps/
│   ├── api/                        # Fastify backend (puerto 3001)
│   │   ├── src/
│   │   │   ├── config/
│   │   │   │   └── env.ts          # Validación de variables de entorno con Zod
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts         # Verificación JWT
│   │   │   │   └── twilio-verify.ts # Verificación de firma Twilio
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts         # Login
│   │   │   │   ├── webhook.ts      # Entrada de mensajes WhatsApp
│   │   │   │   ├── complaints.ts   # CRUD reclamos
│   │   │   │   ├── categories.ts   # CRUD categorías/subcategorías
│   │   │   │   └── stats.ts        # Estadísticas
│   │   │   ├── services/
│   │   │   │   ├── ai/
│   │   │   │   │   ├── agent.ts    # Orquestador principal del agente IA
│   │   │   │   │   ├── prompts.ts  # Constructor del system prompt dinámico
│   │   │   │   │   └── tools.ts    # Definición del tool save_complaint
│   │   │   │   ├── sessions.ts     # Gestión de sesiones de conversación
│   │   │   │   ├── twilio.ts       # Envío de mensajes WhatsApp
│   │   │   │   └── supabase.ts     # Cliente Supabase singleton
│   │   │   ├── types/
│   │   │   │   └── index.ts        # Tipos TypeScript compartidos
│   │   │   └── index.ts            # Entry point del servidor
│   │   ├── .env.example
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                        # Next.js dashboard (puerto 3000)
│       ├── app/
│       │   ├── (auth)/login/       # Página de login
│       │   ├── (dashboard)/
│       │   │   ├── complaints/     # Tabla de reclamos
│       │   │   │   └── [id]/       # Detalle del reclamo + visor de chat
│       │   │   ├── categories/     # CRUD categorías
│       │   │   └── stats/          # Gráficos y estadísticas
│       │   └── api/auth/           # Handler de NextAuth
│       ├── components/
│       │   ├── dashboard-nav.tsx   # Navegación lateral
│       │   └── session-provider.tsx
│       ├── lib/
│       │   ├── api-client.ts       # Cliente HTTP tipado para el backend
│       │   ├── auth.ts             # Configuración NextAuth
│       │   └── utils.ts            # Helpers (cn, formatDate, STATUS_LABELS)
│       ├── middleware.ts            # Protección de rutas
│       └── .env.local.example
│
└── supabase/
    ├── migrations/
    │   └── 001_initial_schema.sql  # Schema completo con índices y triggers
    └── seed.sql                    # Tenant, admin y categorías por defecto
```

---

## Multi-tenant

El sistema está diseñado para soportar múltiples municipalidades. Actualmente corre con un tenant fijo (`DEFAULT_TENANT_ID`), pero agregar una segunda municipalidad solo requiere:

1. Insertar una fila en `tenants`
2. Crear sus categorías en `categories`
3. Asignarle su número de Twilio en `tenants.whatsapp_number`
4. Crear sus admins en `admin_users`

No requiere cambios de código ni de esquema.

---

## Limitaciones del entorno de desarrollo

| Limitación | Solución en producción |
|---|---|
| ngrok genera una URL nueva cada vez que se reinicia | Usar dominio estático de ngrok (pago) o deploy en la nube |
| Twilio Sandbox requiere código de activación por usuario | Registrar número oficial de WhatsApp Business con Meta |
| Servidor corre solo en localhost | Deploy en Railway, Render, Fly.io o VPS |
| No hay HTTPS propio | El hosting en la nube lo provee automáticamente |
