# Funcionalidad Offline - IxmiCheck

## 🚀 Funcionalidades Implementadas

### ✅ Modo Offline
- **Funcionamiento sin internet**: Después del login inicial, la aplicación funciona completamente offline
- **Almacenamiento local**: Todos los datos se guardan en localStorage del navegador
- **Sincronización automática**: Cuando se restablece la conexión, todos los datos se sincronizan automáticamente con Firebase

### 🔄 Sincronización de Datos
- **Detección automática de conexión**: La app detecta cuando se pierde y restablece la conexión
- **Cola de operaciones pendientes**: Las acciones offline se almacenan y ejecutan al reconectarse
- **Indicador visual de estado**: Muestra el estado de conexión y operaciones pendientes
- **Botón de sincronización manual**: Opción para sincronizar manualmente cuando sea necesario

### 📱 Progressive Web App (PWA)
- **Instalable**: La aplicación se puede instalar como una app nativa
- **Cache inteligente**: Los archivos estáticos se almacenan en cache para funcionamiento offline
- **Service Worker**: Gestión automática del cache y sincronización

## 🎯 Operaciones Disponibles Offline

### Panel General
- ✅ **Toggle de votos**: Marcar/desmarcar votos como listos
- ✅ **Agregar personas**: Crear nuevos registros de votantes
- ✅ **Editar personas**: Modificar información de votantes existentes
- ✅ **Eliminar personas**: Borrar registros de votantes
- ✅ **Subir Excel**: Cargar nuevas seccionales desde archivos Excel

### Panel de Administrador
- ✅ **Todas las funciones del Panel General**
- ✅ **Gestión completa de seccionales**
- ✅ **Estadísticas en tiempo real** (calculadas localmente cuando está offline)

## 📊 Indicadores Visuales

### Estado de Conexión
- 🟢 **Conectado**: Verde con texto "Conectado"
- 🔴 **Sin conexión**: Rojo con texto "Sin conexión"
- 🔄 **Sincronizando**: Azul con animación "Sincronizando..."

### Operaciones Pendientes
- **Contador**: Muestra el número de operaciones esperando sincronización
- **Botón de sync**: Disponible cuando hay operaciones pendientes y conexión

## 🔧 Tecnologías Utilizadas

### Frontend Offline
- **localStorage**: Almacenamiento persistente en el navegador
- **React Context**: Gestión global del estado offline
- **Navigator API**: Detección del estado de conexión

### PWA
- **Vite PWA Plugin**: Generación automática del service worker
- **Workbox**: Estrategias de cache inteligentes
- **Web App Manifest**: Configuración para instalación como app

### Sincronización
- **Firebase Firestore**: Base de datos en tiempo real
- **Queue System**: Cola de operaciones para sincronización
- **Error Handling**: Manejo robusto de errores de sincronización

## 🚀 Cómo Usar

### Primera Vez
1. **Conexión requerida**: Necesitas internet para el login inicial
2. **Carga de datos**: La app descarga todos los datos y los guarda localmente
3. **Listo para offline**: Después del login, puedes desconectarte del internet

### Funcionamiento Offline
1. **Usa normalmente**: Todas las funciones están disponibles
2. **Cambios se guardan**: Todo se almacena localmente y se marca como pendiente
3. **Reconexión automática**: Al recuperar internet, todo se sincroniza automáticamente

### Sincronización
- **Automática**: Se ejecuta al detectar conexión
- **Manual**: Usa el botón "Sincronizar" si es necesario
- **Notificaciones**: Recibes confirmación cuando la sincronización termina

## 🔐 Datos Seguros

### Almacenamiento Local
- **Encriptación**: Los datos sensibles están protegidos
- **Persistencia**: Los datos se mantienen incluso si cierras el navegador
- **Limpieza**: Se limpian automáticamente después de la sincronización exitosa

### Validación
- **Integridad**: Se verifica que los datos locales sean válidos antes de sincronizar
- **Conflictos**: Sistema de resolución para cambios concurrentes
- **Backup**: Los datos se mantienen hasta confirmar la sincronización exitosa

## 📱 Instalación como App

### En Dispositivos Móviles
1. Abre la web en tu navegador
2. Busca "Agregar a pantalla de inicio" en el menú
3. La app se instalará como una aplicación nativa

### En Desktop
1. Busca el ícono de instalación en la barra de direcciones
2. Haz clic en "Instalar"
3. La app se abrirá en su propia ventana

## 🐛 Solución de Problemas

### Si no sincroniza
1. Verifica tu conexión a internet
2. Usa el botón "Sincronizar" manualmente
3. Recarga la página si persiste el problema

### Si pierdes datos
- Los datos están en localStorage - no se pierden al cerrar el navegador
- Solo se eliminan después de sincronización exitosa
- En caso extremo, exporta los datos antes de limpiar el cache

### Performance
- La app funciona más rápido offline (no espera respuestas de red)
- Los datos se cargan instantáneamente desde el almacenamiento local
- La sincronización en background no afecta la experiencia del usuario
