# MCP (Message Control Plane) - Implementación en TypeScript

Esta es una implementación en TypeScript de un Message Control Plane (MCP).
El MCP es responsable de recibir mensajes, validarlos, enrutarlos al manejador apropiado,
y permitir la intercepción o modificación de solicitudes y respuestas.

## Estructura del Proyecto

- `mcp.ts`: Contiene la lógica principal de la clase `MessageControlPlane` y las interfaces relacionadas (`MCPMessage`, `MCPRequest`, `MCPResponse`).
- `package.json`: Define los metadatos del proyecto, scripts y dependencias.
- `tsconfig.json`: Archivo de configuración para el compilador de TypeScript.
- `__tests__/`: Directorio que contiene las pruebas unitarias.
  - `mcp.test.ts`: Pruebas para la clase `MessageControlPlane`.
- `dist/`: Directorio donde se guardará el código JavaScript compilado (generado por `npm run build`).

## Requisitos Previos

- [Node.js](https://nodejs.org/) (versión 18.x o superior recomendada)
- [npm](https://www.npmjs.com/) (generalmente viene con Node.js) o [Yarn](https://yarnpkg.com/)

## Instalación

1. Clona el repositorio (o asegúrate de estar en el directorio raíz del proyecto si ya lo tienes).
2. Navega al directorio de esta implementación:
   ```bash
   cd src/typescript/mcp
   ```
3. Instala las dependencias:
   ```bash
   npm install
   ```
   o si usas Yarn:
   ```bash
   yarn install
   ```

## Scripts Disponibles

En el directorio `src/typescript/mcp`, puedes ejecutar los siguientes scripts definidos en `package.json`:

- **`npm run build`**: Compila el código TypeScript a JavaScript. Los archivos de salida se guardarán en el directorio `dist/`.
  ```bash
  npm run build
  ```

- **`npm run test`**: Ejecuta las pruebas unitarias utilizando Jest.
  ```bash
  npm run test
  ```

- **`npm run dev`**: Ejecuta el archivo `mcp.ts` directamente usando `ts-node`. Esto es útil para desarrollo y para probar el script de ejemplo si se descomenta la llamada a `exampleUsage()` en `mcp.ts`.
  ```bash
  npm run dev
  ```
  *Nota: Para que `npm run dev` ejecute el ejemplo, deberás descomentar la línea `// exampleUsage().catch(...)` al final de `src/typescript/mcp/mcp.ts`.*

- **`npm run lint`**: Analiza el código TypeScript en busca de problemas de estilo y errores potenciales usando ESLint.
  ```bash
  npm run lint
  ```

- **`npm run lint:fix`**: Intenta corregir automáticamente los problemas encontrados por ESLint.
  ```bash
  npm run lint:fix
  ```

## Uso Básico

La clase principal es `MessageControlPlane`. Para usarla:

1. Importa la clase:
   ```typescript
   import { MessageControlPlane, MCPMessage, MCPRequest } from './mcp'; // Ajusta la ruta según sea necesario
   ```

2. Crea una instancia de MCP:
   ```typescript
   const mcp = new MessageControlPlane();
   ```

3. Registra manejadores de mensajes para diferentes tipos de mensajes:
   ```typescript
   mcp.registerMessageHandler('tipo_de_mensaje', async (message: MCPMessage) => {
     // Lógica para procesar el mensaje
     // Devuelve un nuevo MCPMessage como respuesta, o null si no hay respuesta directa
     console.log(`Procesando: ${message.content}`);
     return {
       id: `response-${message.id}`,
       source: 'mi-manejador',
       conversationId: message.conversationId,
       timestamp: new Date(),
       content: `Respuesta a '${message.content}'`,
     };
   });
   ```

4. (Opcional) Añade validadores de solicitudes:
   ```typescript
   mcp.addRequestValidator(async (request: MCPRequest) => {
     if (!request.message.source) {
       throw new Error("El origen del mensaje es obligatorio.");
     }
   });
   ```

5. (Opcional) Añade interceptores de respuestas:
   ```typescript
   mcp.addResponseInterceptor(async (response: MCPResponse) => {
     console.log(`Respuesta interceptada para ${response.originalMessageId}`);
     // Modificar la respuesta si es necesario
     return response;
   });
   ```

6. Envía mensajes a través de MCP:
   ```typescript
   const miMensaje: MCPMessage = {
     id: 'msg-001',
     source: 'cliente-web',
     conversationId: 'conv-abc',
     timestamp: new Date(),
     content: 'Hola Mundo',
     metadata: { type: 'tipo_de_mensaje' }
   };

   async function enviarYProcesar() {
     const respuesta = await mcp.sendMessage(miMensaje);
     if (respuesta.success) {
       console.log('Respuesta de MCP:', respuesta.responseMessage.content);
     } else {
       console.error('Error de MCP:', respuesta.error);
     }
   }

   enviarYProcesar();
   ```

Consulta el método `exampleUsage()` (comentado por defecto) en `mcp.ts` para ver un ejemplo más detallado.

## Pruebas

Las pruebas están escritas con [Jest](https://jestjs.io/). Para ejecutarlas:

```bash
npm test
```

Esto ejecutará todos los archivos `*.test.ts` dentro del directorio `__tests__`.

## Contribuir

Si deseas contribuir, por favor:

1. Haz un fork del repositorio.
2. Crea una nueva rama para tus cambios.
3. Asegúrate de que las pruebas pasen (`npm test`).
4. Asegúrate de que el linter no muestre errores (`npm run lint`).
5. Envía un Pull Request.

## Licencia

Este proyecto está bajo la licencia ISC (o la que se haya especificado en `package.json`).
