# Gestión Manual - Nuevas Funcionalidades

## Resumen
Se han agregado nuevas funcionalidades al panel general que permiten a las cuentas de tipo general crear y gestionar seccionales y personas sin necesidad de archivos Excel.

## Funcionalidades Implementadas

### 1. Crear Nueva Seccional
- **Ubicación**: Panel General > Gestión Manual > "Crear Nueva Seccional"
- **Funcionalidad**: Permite crear una nueva seccional especificando:
  - Número de seccional (requerido)
  - Nombre del promotor inicial (requerido)
- **Restricciones**: 
  - Solo usuarios de tipo general pueden crear seccionales para su propio uso
  - No se puede crear una seccional con un número que ya existe
  - La seccional se asigna automáticamente al usuario que la crea

### 2. Agregar Promotor a Seccional Existente
- **Ubicación**: Panel General > Gestión Manual > "Agregar Promotor"
- **Funcionalidad**: Permite agregar un nuevo promotor a una seccional existente
- **Restricciones**: 
  - Solo se pueden agregar promotores a seccionales creadas por el usuario actual
  - No se puede duplicar nombres de promotores dentro de la misma seccional
  - El botón está deshabilitado si no hay seccionales disponibles

### 3. Agregar Persona Individual
- **Ubicación**: Panel General > Gestión Manual > "Agregar Persona"
- **Funcionalidad**: Permite agregar personas individuales con los mismos campos que el Excel:
  - Seccional (selector)
  - Promotor (selector)
  - Nombre completo (requerido)
  - CURP (opcional)
  - Clave de elector (opcional)
- **Características**:
  - CURP y clave de elector se convierten automáticamente a mayúsculas
  - CURP tiene límite de 18 caracteres
  - Se asigna automáticamente número de persona secuencial
  - Estado de voto se inicializa en "Pendiente"

## Campos de Datos

### Estructura igual al Excel
Los campos requeridos son exactamente los mismos que se solicitan en el archivo Excel:
- **Número de Seccional**: Identificador único de la seccional
- **Promotor**: Nombre del promotor responsable
- **Nombre Completo**: Nombre completo de la persona
- **CURP**: Clave Única de Registro de Población (opcional)
- **Clave de Elector**: Clave de elector del INE (opcional)

### Datos adicionales generados automáticamente
- **Número de persona**: Se asigna secuencialmente dentro de cada promotor
- **Estado de voto**: Se inicializa como "Pendiente" (false)
- **Fecha de creación**: Se registra automáticamente
- **Usuario creador**: Se asocia automáticamente al usuario actual

## Funcionamiento Offline

### Soporte completo offline
- ✅ Crear seccionales offline
- ✅ Agregar promotores offline  
- ✅ Agregar personas offline
- ✅ Sincronización automática cuando regresa la conexión

### Persistencia local
- Todos los datos se guardan en localStorage
- Las operaciones se almacenan en cola para sincronización
- Los datos persisten aunque se cierre el navegador

## Seguridad y Aislamiento

### Aislamiento por usuario
- Cada usuario solo puede ver y gestionar sus propias seccionales
- No pueden ver datos de otros usuarios (ni siquiera administradores)
- Las seccionales se marcan automáticamente con el email del creador

### Validaciones
- Verificación de duplicados (seccionales y promotores)
- Validación de campos requeridos
- Verificación de permisos antes de cada operación

## Interfaz de Usuario

### Modales intuitivos
- Formularios modales para cada operación
- Campos claramente etiquetados con asteriscos para campos requeridos
- Botones de cancelar y confirmar en cada modal

### Indicadores visuales
- Botones deshabilitados cuando no hay datos suficientes
- Colores distintivos para cada tipo de operación:
  - 🔵 Azul: Crear seccional
  - 🟢 Verde: Agregar promotor  
  - 🟣 Morado: Agregar persona

### Selectores dependientes
- El selector de promotor se actualiza automáticamente según la seccional seleccionada
- Se resetea la selección cuando cambia la seccional padre

## Compatibilidad

### Mantiene toda la funcionalidad existente
- ✅ Carga de archivos Excel sigue funcionando
- ✅ Todas las estadísticas se calculan correctamente
- ✅ Funcionalidad de votación sigue igual
- ✅ Sincronización y offline funcionan igual

### Estructura de datos idéntica
- Los datos creados manualmente son idénticos a los del Excel
- No hay diferencia en el formato de almacenamiento
- Totalmente compatible con el sistema existente
