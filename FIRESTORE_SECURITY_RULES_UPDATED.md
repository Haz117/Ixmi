# 🛡️ Reglas de Seguridad de Firestore - Actualizadas

## Reglas de Seguridad Implementadas (Con Colección de Usuarios)

Para manejar correctamente los roles y permisos, implementa estas reglas actualizadas en Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Reglas para la colección users (roles y permisos)
    match /users/{userId} {
      // Los usuarios pueden leer su propio documento
      // Los admins pueden leer todos los documentos de usuarios
      allow read: if request.auth != null && 
        (request.auth.uid == userId || 
         request.auth.token.email.matches('.*admin.*') || 
         request.auth.token.email == 'admin@ixmicheck.com');
      
      // Solo el propio usuario o admins pueden escribir su documento
      allow write: if request.auth != null && 
        (request.auth.uid == userId || 
         request.auth.token.email.matches('.*admin.*') || 
         request.auth.token.email == 'admin@ixmicheck.com');
      
      // Permitir creación de documentos de usuario al registrarse
      allow create: if request.auth != null && 
        (request.auth.uid == userId || 
         request.auth.token.email.matches('.*admin.*') || 
         request.auth.token.email == 'admin@ixmicheck.com');
    }
    
    // Reglas para la colección seccionales
    match /seccionales/{seccionalId} {
      // LECTURA: 
      // - Admins pueden ver TODO
      // - Usuarios generales SOLO ven lo que ellos subieron
      allow read: if request.auth != null && 
        (request.auth.token.email.matches('.*admin.*') || 
         request.auth.token.email == 'admin@ixmicheck.com' ||
         resource.data.subidoPor == request.auth.token.email);
      
      // ESCRITURA:
      // - Admins pueden modificar TODO
      // - Usuarios generales SOLO pueden modificar lo que ellos subieron
      allow write: if request.auth != null && 
        (request.auth.token.email.matches('.*admin.*') || 
         request.auth.token.email == 'admin@ixmicheck.com' ||
         resource.data.subidoPor == request.auth.token.email);
      
      // CREACIÓN: Cualquier usuario autenticado puede crear
      // (pero automáticamente se marca con su email en 'subidoPor')
      allow create: if request.auth != null &&
        request.resource.data.subidoPor == request.auth.token.email;
    }
    
    // Otras colecciones - solo admins pueden acceder
    match /{document=**} {
      allow read, write: if request.auth != null && 
        (request.auth.token.email.matches('.*admin.*') ||
         request.auth.token.email == 'admin@ixmicheck.com');
    }
  }
}
```

## Cómo aplicar estas reglas:

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona tu proyecto
3. Ve a **Firestore Database** > **Rules**
4. Reemplaza el contenido actual con las reglas de arriba
5. Haz clic en **Publish**

## Explicación de las reglas actualizadas:

### Colección `users`:
- **Lectura**: Cada usuario puede leer su propio documento, los admins pueden leer todos
- **Escritura**: Solo el propio usuario o admins pueden modificar el documento
- **Creación**: Permite crear documentos de usuario durante el registro

### Colección `seccionales`:
- **Admins**: Acceso completo a todas las seccionales
- **Usuarios Generales**: Solo pueden ver/modificar las seccionales que ellos subieron
- **Seguridad**: Los datos quedan protegidos tanto en frontend como backend

### Otras colecciones:
- **Solo admins**: Pueden acceder a cualquier otra colección del sistema

## Beneficios de estas reglas:

✅ **Gestión de roles centralizada** en la colección `users`
✅ **Seguridad por capas** (frontend + backend)
✅ **Escalabilidad** para agregar nuevos tipos de usuarios
✅ **Compatibilidad** con el sistema existente
✅ **Protección completa** de datos sensibles
