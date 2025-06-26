// Interfaz para un mensaje estándar de MCP
interface MCPMessage {
  id: string; // Identificador único del mensaje
  source: string; // Origen del mensaje (e.g., 'user', 'agent', 'system')
  conversationId: string; // Identificador de la conversación a la que pertenece
  timestamp: Date; // Fecha y hora del mensaje
  content: any; // Contenido del mensaje, puede ser de cualquier tipo (texto, JSON, etc.)
  metadata?: Record<string, any>; // Metadatos adicionales
}

// Interfaz para una solicitud de procesamiento a MCP
interface MCPRequest {
  message: MCPMessage;
  // Podría incluir otros campos como configuraciones específicas para esta solicitud
}

// Interfaz para una respuesta de MCP
interface MCPResponse {
  originalMessageId: string; // ID del mensaje original que generó esta respuesta
  responseMessage: MCPMessage; // El mensaje de respuesta generado por MCP
  success: boolean; // Indica si el procesamiento fue exitoso
  error?: {
    code: string;
    message: string;
  }; // Detalles del error si success es false
}

// Clase principal para el Message Control Plane (MCP)
class MessageControlPlane {
  private messageHandlers: Map<string, (message: MCPMessage) => Promise<MCPMessage | null>>;
  private requestValidators: Array<(request: MCPRequest) => Promise<void>>;
  private responseInterceptors: Array<(response: MCPResponse) => Promise<MCPResponse>>;

  constructor() {
    this.messageHandlers = new Map();
    this.requestValidators = [];
    this.responseInterceptors = [];
    console.log("MCP_TS: MessageControlPlane inicializado.");
  }

  /**
   * Registra un manejador para un tipo específico de mensaje.
   * @param messageType - El tipo de mensaje a manejar (e.g., 'text_message', 'user_command').
   * @param handler - La función que procesará el mensaje. Debe devolver el mensaje procesado o null.
   */
  registerMessageHandler(messageType: string, handler: (message: MCPMessage) => Promise<MCPMessage | null>): void {
    if (this.messageHandlers.has(messageType)) {
      console.warn(`MCP_TS: Ya existe un manejador para el tipo de mensaje '${messageType}'. Será sobrescrito.`);
    }
    this.messageHandlers.set(messageType, handler);
    console.log(`MCP_TS: Manejador registrado para el tipo de mensaje '${messageType}'.`);
  }

  /**
   * Añade un validador de solicitudes.
   * Los validadores se ejecutan en orden antes de procesar la solicitud.
   * Si algún validador lanza un error, el procesamiento se detiene.
   * @param validator - La función validadora.
   */
  addRequestValidator(validator: (request: MCPRequest) => Promise<void>): void {
    this.requestValidators.push(validator);
    console.log("MCP_TS: Validador de solicitud añadido.");
  }

  /**
   * Añade un interceptor de respuestas.
   * Los interceptores se ejecutan en orden después de generar una respuesta.
   * @param interceptor - La función interceptora.
   */
  addResponseInterceptor(interceptor: (response: MCPResponse) => Promise<MCPResponse>): void {
    this.responseInterceptors.push(interceptor);
    console.log("MCP_TS: Interceptor de respuesta añadido.");
  }

  /**
   * Procesa una solicitud entrante.
   * @param request - La solicitud MCP a procesar.
   * @returns Una promesa que se resuelve con la respuesta MCP.
   */
  async processRequest(request: MCPRequest): Promise<MCPResponse> {
    console.log(`MCP_TS: Procesando solicitud para mensaje ID: ${request.message.id}`);

    // 1. Validar la solicitud
    try {
      for (const validator of this.requestValidators) {
        await validator(request);
      }
      console.log(`MCP_TS: Solicitud validada para mensaje ID: ${request.message.id}`);
    } catch (error: any) {
      console.error(`MCP_TS: Error de validación para mensaje ID: ${request.message.id}`, error);
      return this.buildErrorResponse(request.message.id, "VALIDATION_ERROR", error.message || "Error de validación desconocido.");
    }

    // 2. Encontrar y ejecutar el manejador de mensajes apropiado
    const messageType = request.message.metadata?.type || 'default'; // Asumir un tipo 'default' o extraer de metadatos
    const handler = this.messageHandlers.get(messageType);

    if (!handler) {
      const errorMsg = `No se encontró un manejador para el tipo de mensaje '${messageType}' (ID: ${request.message.id}).`;
      console.error(`MCP_TS: ${errorMsg}`);
      return this.buildErrorResponse(request.message.id, "HANDLER_NOT_FOUND", errorMsg);
    }

    let processedMessage: MCPMessage | null = null;
    try {
      console.log(`MCP_TS: Ejecutando manejador '${messageType}' para mensaje ID: ${request.message.id}`);
      processedMessage = await handler(request.message);
    } catch (error: any) {
      console.error(`MCP_TS: Error en el manejador '${messageType}' para mensaje ID: ${request.message.id}`, error);
      return this.buildErrorResponse(request.message.id, "HANDLER_ERROR", error.message || "Error desconocido en el manejador.");
    }

    // 3. Construir la respuesta
    let mcpResponse: MCPResponse;
    if (processedMessage) {
      mcpResponse = {
        originalMessageId: request.message.id,
        responseMessage: processedMessage,
        success: true,
      };
      console.log(`MCP_TS: Mensaje ID: ${request.message.id} procesado exitosamente.`);
    } else {
      // Si el handler devuelve null, podría significar que el mensaje fue consumido pero no genera respuesta directa
      // o que no se debía procesar. Se considera un "éxito" en el sentido de que no hubo error,
      // pero la respuesta puede ser vacía o indicar que no se requiere acción.
      // Aquí generamos un mensaje de sistema indicando que no hubo respuesta directa.
      const noResponseSystemMessage: MCPMessage = {
        id: `system-response-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        source: 'mcp_system',
        conversationId: request.message.conversationId,
        timestamp: new Date(),
        content: `El mensaje ${request.message.id} fue procesado pero no generó una respuesta directa.`,
        metadata: { originalMessageId: request.message.id, status: 'PROCESSED_NO_REPLY' }
      };
      mcpResponse = {
        originalMessageId: request.message.id,
        responseMessage: noResponseSystemMessage,
        success: true, // Sigue siendo un éxito desde la perspectiva de MCP si el handler no falló
      };
      console.log(`MCP_TS: Mensaje ID: ${request.message.id} procesado, handler devolvió null.`);
    }

    // 4. Ejecutar interceptores de respuesta
    try {
      for (const interceptor of this.responseInterceptors) {
        mcpResponse = await interceptor(mcpResponse);
      }
      console.log(`MCP_TS: Interceptores de respuesta ejecutados para mensaje ID: ${request.message.id}`);
    } catch (error: any) {
      console.error(`MCP_TS: Error en interceptor de respuesta para mensaje ID: ${request.message.id}`, error);
      // Aquí podríamos decidir si el error del interceptor debe cambiar la respuesta a un error general
      // Por simplicidad, por ahora solo logueamos el error del interceptor pero mantenemos la respuesta original.
      // En un caso real, podría ser necesario modificar mcpResponse para reflejar este error.
    }

    return mcpResponse;
  }

  /**
   * Construye una respuesta de error estándar.
   */
  private buildErrorResponse(originalMessageId: string, errorCode: string, errorMessage: string): MCPResponse {
    const errorResponseMessage: MCPMessage = {
      id: `error-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      source: 'mcp_error_handler',
      // La conversationId puede no estar disponible si el error es muy temprano.
      // Aquí asumimos que originalMessageId implica una conversación existente,
      // pero en un sistema real, necesitaríamos obtenerla de forma más robusta.
      conversationId: `conv-for-${originalMessageId}`,
      timestamp: new Date(),
      content: {
        error: errorCode,
        message: errorMessage,
      },
      metadata: { originalMessageId },
    };

    return {
      originalMessageId,
      responseMessage: errorResponseMessage,
      success: false,
      error: {
        code: errorCode,
        message: errorMessage,
      },
    };
  }

  /**
   * Método de ejemplo para simular el envío de un mensaje a través de MCP.
   * En un sistema real, esto estaría conectado a colas de mensajes, APIs, etc.
   */
  async sendMessage(message: MCPMessage): Promise<MCPResponse> {
    console.log(`MCP_TS: sendMessage llamado para mensaje ID: ${message.id} desde ${message.source}`);
    const request: MCPRequest = { message };
    return this.processRequest(request);
  }
}

// Ejemplo de uso (esto podría estar en otro archivo o en una sección de prueba)
async function exampleUsage() {
  const mcp = new MessageControlPlane();

  // Registrar un validador de ejemplo
  mcp.addRequestValidator(async (request: MCPRequest) => {
    console.log(`MCP_TS_VALIDATOR: Validando mensaje ID: ${request.message.id}`);
    if (!request.message.content) {
      throw new Error("El contenido del mensaje no puede estar vacío.");
    }
    // Simular validación asíncrona
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  // Registrar un manejador de mensajes de texto de ejemplo
  mcp.registerMessageHandler('text_message', async (message: MCPMessage): Promise<MCPMessage | null> => {
    console.log(`MCP_TS_HANDLER (text_message): Procesando mensaje de texto: "${message.content}"`);
    // Simular procesamiento asíncrono (e.g., llamar a un LLM, una API, etc.)
    await new Promise(resolve => setTimeout(resolve, 100));

    const replyContent = `Respuesta procesada para: "${message.content}"`;
    return {
      id: `response-${message.id}-${Date.now()}`,
      source: 'agent_text_processor',
      conversationId: message.conversationId,
      timestamp: new Date(),
      content: replyContent,
      metadata: {
        processedBy: 'text_message_handler_v1'
      }
    };
  });

  // Registrar un manejador para comandos de sistema
  mcp.registerMessageHandler('system_command', async (message: MCPMessage): Promise<MCPMessage | null> => {
    console.log(`MCP_TS_HANDLER (system_command): Procesando comando:`, message.content);
    if (message.content.command === 'PING') {
      return {
        id: `pong-${message.id}`,
        source: 'system_core',
        conversationId: message.conversationId,
        timestamp: new Date(),
        content: { status: 'PONG', details: 'System is responsive' },
        metadata: { processedBy: 'system_command_handler_v1' }
      };
    }
    // Si el comando no es reconocido por este handler, podría devolver null
    // para que otro handler (si estuviera registrado para un tipo más genérico) lo intente.
    // O, si este es el único handler para 'system_command', devolver null resultará
    // en la respuesta "procesado pero no generó una respuesta directa".
    return null;
  });


  // Registrar un interceptor de respuesta de ejemplo
  mcp.addResponseInterceptor(async (response: MCPResponse): Promise<MCPResponse> => {
    console.log(`MCP_TS_INTERCEPTOR: Interceptando respuesta para mensaje original ID: ${response.originalMessageId}`);
    if (response.responseMessage.metadata) {
      response.responseMessage.metadata.interceptedAt = new Date().toISOString();
    } else {
      response.responseMessage.metadata = { interceptedAt: new Date().toISOString() };
    }
    // Simular modificación asíncrona
    await new Promise(resolve => setTimeout(resolve, 30));
    return response;
  });

  // Simular la recepción de un mensaje de texto
  const userTextMessage: MCPMessage = {
    id: `user-msg-${Date.now()}`,
    source: 'user_client_A',
    conversationId: 'conv-123',
    timestamp: new Date(),
    content: "Hola, ¿cómo estás?",
    metadata: { type: 'text_message', priority: 'high' }
  };

  console.log("\n--- Ejemplo 1: Mensaje de texto ---");
  const response1 = await mcp.sendMessage(userTextMessage);
  console.log("MCP_TS_EXAMPLE: Respuesta final recibida:", JSON.stringify(response1, null, 2));

  // Simular la recepción de un comando del sistema
  const systemCommandMessage: MCPMessage = {
    id: `cmd-msg-${Date.now()}`,
    source: 'admin_tool',
    conversationId: 'conv-system-ops',
    timestamp: new Date(),
    content: { command: 'PING' },
    metadata: { type: 'system_command' }
  };

  console.log("\n--- Ejemplo 2: Comando del sistema PING ---");
  const response2 = await mcp.sendMessage(systemCommandMessage);
  console.log("MCP_TS_EXAMPLE: Respuesta final recibida:", JSON.stringify(response2, null, 2));

  // Simular un mensaje que no tiene un handler específico (usará 'default' si existe, o fallará)
  const unknownTypeMessage: MCPMessage = {
    id: `unknown-msg-${Date.now()}`,
    source: 'external_service',
    conversationId: 'conv-456',
    timestamp: new Date(),
    content: { data: "Algún dato estructurado" },
    metadata: { type: 'special_data_v3' } // Suponiendo que 'special_data_v3' no tiene handler
  };

  console.log("\n--- Ejemplo 3: Mensaje de tipo desconocido ---");
  const response3 = await mcp.sendMessage(unknownTypeMessage);
  console.log("MCP_TS_EXAMPLE: Respuesta final recibida:", JSON.stringify(response3, null, 2));

  // Simular un mensaje que falla la validación
   const invalidMessage: MCPMessage = {
    id: `invalid-msg-${Date.now()}`,
    source: 'user_client_B',
    conversationId: 'conv-789',
    timestamp: new Date(),
    content: null, // Esto debería fallar la validación
    metadata: { type: 'text_message' }
  };

  console.log("\n--- Ejemplo 4: Mensaje inválido ---");
  const response4 = await mcp.sendMessage(invalidMessage);
  console.log("MCP_TS_EXAMPLE: Respuesta final recibida:", JSON.stringify(response4, null, 2));

}

// Descomentar para ejecutar el ejemplo si este archivo se ejecuta directamente
// (e.g., con `ts-node mcp.ts`)
// exampleUsage().catch(error => {
//   console.error("MCP_TS_EXAMPLE: Error en la ejecución del ejemplo:", error);
// });

export { MessageControlPlane, MCPMessage, MCPRequest, MCPResponse };
// También podríamos exportar las interfaces si se usan externamente
// export type { MCPMessage, MCPRequest, MCPResponse };
