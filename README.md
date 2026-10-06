# PhotoShare Eventos

Aplicacion web responsive para crear eventos, compartir un QR y permitir que los invitados suban fotos desde su telefono.

## Estado actual

Este repositorio contiene el arranque del frontend en Angular:

- Creacion local de eventos.
- Generacion de QR para el enlace del evento.
- Pagina publica del evento.
- Seleccion o captura de imagen desde el celular.
- Compresion en navegador a JPEG 75%.
- Galeria local temporal con vista ampliada.

La persistencia actual usa `localStorage` solo para desarrollo. La siguiente etapa es conectar Cloudflare Workers, Supabase y Google Drive.

## Desarrollo local

```bash
npm install
npm start
```

Abrir `http://localhost:4200/`.

## Publicacion en GitHub Pages

La aplicacion se publica con GitHub Actions cuando hay cambios en `main`.

URL esperada:

```text
https://familiasegura2026aqp-gif.github.io/photoshare-eventos/
```

En GitHub, ir a `Settings > Pages` y seleccionar `GitHub Actions` como fuente de publicacion.

## Pendiente para backend

- Ejecutar `supabase/schema.sql` en el SQL Editor de Supabase.
- Crear Worker en Cloudflare con `npm run worker:deploy`.
- Configurar Google Drive API.
- Guardar secretos en Cloudflare, nunca en Angular.
- Reemplazar `EventStoreService` por llamadas HTTP al Worker.

## Backend Cloudflare Worker

Para desarrollo local del Worker:

```bash
cp .dev.vars.example .dev.vars
npm run worker:dev
```

En Windows PowerShell puedes copiarlo asi:

```powershell
Copy-Item .dev.vars.example .dev.vars
```

Luego completar `.dev.vars` con secretos reales. Ese archivo no debe subirse a Git.

Secretos que deben configurarse en Cloudflare:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put GOOGLE_CLIENT_EMAIL
npx wrangler secret put GOOGLE_PRIVATE_KEY
```

La carpeta raiz `PhotoShare` de Google Drive debe compartirse como editor con la cuenta de servicio:

```text
photoshare-drive-uploader@photoshare-510821.iam.gserviceaccount.com
```

Despues copia el ID de esa carpeta desde la URL de Drive y configuralo en `wrangler.jsonc` como `GOOGLE_DRIVE_ROOT_FOLDER_ID`, o como variable en Cloudflare.

## Variables importantes

La app Angular solo usa:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

No subir ni pegar en el frontend:

- `SUPABASE_SERVICE_ROLE_KEY`
- credenciales de Google Drive
- secretos de Cloudflare
