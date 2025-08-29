# 🛡️ Reglas de Seguridad de Firestore

## Reglas de Seguridad Implementadas

Para evitar que los usuarios generales vean datos de otros usuarios, implementa estas reglas en Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
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
    
    // Otras colecciones (si las hay) - solo admins
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

## Explicación de las reglas:

- **Usuarios Admin**: Pueden ver y modificar todo
- **Usuarios Generales**: Solo pueden ver y modificar las seccionales que ellos subieron
- **Seguridad**: Los datos quedan protegidos tanto en frontend como backend
