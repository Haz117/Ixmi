# IxmiCheck - Sistema de Promotores

Sistema de gestión de promotores electorales con tres vistas principales: Login, Panel de Admin y Panel General.

## Características

- **Login**: Autenticación de usuarios con Firebase Auth
- **Panel de Admin**: Vista en tiempo real de todos los datos, estadísticas y gestión completa
- **Panel General**: Subida de archivos Excel, gestión de personas y marcado de votos

## Funcionalidades

### Panel General
- Subida de archivos Excel con datos de promotores
- Agregar personas individuales
- Marcar votos como "listos"
- Estadísticas por promotor
- Vista genealógica por promotor

### Panel de Admin
- Vista en tiempo real de todas las seccionales
- Estadísticas globales
- Gestión completa de votos
- Supervisión de todos los promotores

## Configuración

### 1. Configurar variables de entorno

1. Copia el archivo `.env.example` como `.env`:
   ```bash
   cp .env.example .env
   ```

2. Si ya tienes tu proyecto de Firebase configurado, las variables ya están en el archivo `.env`

3. Si necesitas un nuevo proyecto Firebase:
   - Ve a [Firebase Console](https://console.firebase.google.com/)
   - Crea un nuevo proyecto
   - Habilita Authentication (Email/Password)
   - Habilita Firestore Database
   - Copia la configuración al archivo `.env`

### 2. Configurar Firebase Authentication

En Firebase Authentication, crea los siguientes usuarios:

- **Admin**: `admin@ixmicheck.com` / `admin123`
- **General**: `user@ixmicheck.com` / `user123`

### 3. Configurar reglas de Firestore

En Firestore Database > Rules, usa las siguientes reglas:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Permitir lectura y escritura solo a usuarios autenticados
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

## Formato del archivo Excel

El archivo Excel debe tener la siguiente estructura:

```
SECCIONAL 0591
No Total.	No. Promotor	Nombre Completo	CURP	Clave de Elector	Promotor
1	1	MENDOZA PEDRAZA ANAIN	MEPA840202MHGNDN09	MNPDAN84020213M200	ABDIEL
2	2	PEDRAZA CORONA BRIGIDA	PECB621015MHGDRR16	PDCRBR62101513M000	ABDIEL
...
```

## Credenciales de Prueba

- **Admin**: admin@ixmicheck.com / admin123
- **General**: user@ixmicheck.com / user123

## Tecnologías

- React 19
- Vite
- Firebase (Auth + Firestore)
- Tailwind CSS
- React Router DOM
- xlsx (para manejo de archivos Excel)

## Estructura del Proyecto

```
src/
├── components/
│   ├── Login.jsx
│   ├── AdminPanel.jsx
│   ├── GeneralPanel.jsx
│   └── PrivateRoute.jsx
├── contexts/
│   └── AuthContext.jsx
├── firebase.js
└── App.jsx
```+ Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
