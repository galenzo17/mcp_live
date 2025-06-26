import { MessageControlPlane, MCPMessage, MCPRequest, MCPResponse } from '../mcp';

describe('MessageControlPlane', () => {
  let mcp: MessageControlPlane;

  beforeEach(() => {
    mcp = new MessageControlPlane();
    // Silenciar console.log/warn/error durante las pruebas para mantener la salida limpia
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createSampleMessage = (id: string, content: any, type?: string, conversationId: string = 'conv-test'): MCPMessage => ({
    id,
    source: 'test-source',
    conversationId,
    timestamp: new Date(),
    content,
    metadata: type ? { type } : undefined,
  });

  test('should initialize correctly', () => {
    expect(mcp).toBeInstanceOf(MessageControlPlane);
  });

  describe('Message Handling', () => {
    test('should register and use a message handler', async () => {
      const messageType = 'test_message';
      const mockHandler = jest.fn(async (message: MCPMessage): Promise<MCPMessage | null> => {
        return { ...message, content: `handled: ${message.content}` };
      });
      mcp.registerMessageHandler(messageType, mockHandler);

      const incomingMessage = createSampleMessage('msg-1', 'hello', messageType);
      const request: MCPRequest = { message: incomingMessage };
      const response = await mcp.processRequest(request);

      expect(mockHandler).toHaveBeenCalledWith(incomingMessage);
      expect(response.success).toBe(true);
      expect(response.responseMessage.content).toBe('handled: hello');
      expect(response.originalMessageId).toBe('msg-1');
    });

    test('should return error if no handler is found for message type', async () => {
      const incomingMessage = createSampleMessage('msg-2', 'test content', 'unknown_type');
      const request: MCPRequest = { message: incomingMessage };
      const response = await mcp.processRequest(request);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('HANDLER_NOT_FOUND');
      expect(response.error?.message).toContain("No se encontró un manejador para el tipo de mensaje 'unknown_type'");
    });

    test('should use "default" handler if message type is not in metadata', async () => {
        const mockDefaultHandler = jest.fn(async (message: MCPMessage): Promise<MCPMessage | null> => {
          return { ...message, content: `default handled: ${message.content}` };
        });
        mcp.registerMessageHandler('default', mockDefaultHandler);

        const incomingMessage = createSampleMessage('msg-default', 'default test'); // No type in metadata
        const request: MCPRequest = { message: incomingMessage };
        const response = await mcp.processRequest(request);

        expect(mockDefaultHandler).toHaveBeenCalledWith(incomingMessage);
        expect(response.success).toBe(true);
        expect(response.responseMessage.content).toBe('default handled: default test');
      });

    test('should handle errors thrown by message handlers', async () => {
      const messageType = 'error_message';
      const errorHandler = jest.fn(async (message: MCPMessage): Promise<MCPMessage | null> => {
        throw new Error('Handler failed');
      });
      mcp.registerMessageHandler(messageType, errorHandler);

      const incomingMessage = createSampleMessage('msg-err', 'error test', messageType);
      const request: MCPRequest = { message: incomingMessage };
      const response = await mcp.processRequest(request);

      expect(errorHandler).toHaveBeenCalledWith(incomingMessage);
      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('HANDLER_ERROR');
      expect(response.error?.message).toBe('Handler failed');
    });

    test('should handle handler returning null (processed, no direct reply)', async () => {
        const messageType = 'null_handler_message';
        const nullReturningHandler = jest.fn(async (message: MCPMessage): Promise<MCPMessage | null> => {
          return null;
        });
        mcp.registerMessageHandler(messageType, nullReturningHandler);

        const incomingMessage = createSampleMessage('msg-null', 'null test', messageType);
        const request: MCPRequest = { message: incomingMessage };
        const response = await mcp.processRequest(request);

        expect(nullReturningHandler).toHaveBeenCalledWith(incomingMessage);
        expect(response.success).toBe(true);
        expect(response.responseMessage.source).toBe('mcp_system');
        expect(response.responseMessage.metadata?.status).toBe('PROCESSED_NO_REPLY');
        expect(response.responseMessage.content).toContain('procesado pero no generó una respuesta directa');
      });
  });

  describe('Request Validation', () => {
    test('should run request validators before processing', async () => {
      const mockValidator = jest.fn(async (req: MCPRequest) => {
        if (req.message.content === 'invalid') {
          throw new Error('Validation failed');
        }
      });
      mcp.addRequestValidator(mockValidator);

      const validMessage = createSampleMessage('msg-valid', 'valid content', 'typeA');
      const mockHandler = jest.fn().mockResolvedValue({ ...validMessage, content: 'handled' });
      mcp.registerMessageHandler('typeA', mockHandler);

      await mcp.processRequest({ message: validMessage });
      expect(mockValidator).toHaveBeenCalledWith({ message: validMessage });
      expect(mockHandler).toHaveBeenCalled();

      const invalidMessage = createSampleMessage('msg-invalid', 'invalid', 'typeA');
      const response = await mcp.processRequest({ message: invalidMessage });

      expect(mockValidator).toHaveBeenCalledWith({ message: invalidMessage });
      expect(mockHandler).not.toHaveBeenCalled(); // Handler should not be called
      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('VALIDATION_ERROR');
      expect(response.error?.message).toBe('Validation failed');
    });

    test('should run multiple request validators in order', async () => {
        const callOrder: string[] = [];
        const validator1 = jest.fn(async () => { callOrder.push('validator1'); });
        const validator2 = jest.fn(async () => { callOrder.push('validator2'); });

        mcp.addRequestValidator(validator1);
        mcp.addRequestValidator(validator2);

        const message = createSampleMessage('msg-multi-valid', 'content', 'type');
        mcp.registerMessageHandler('type', jest.fn().mockResolvedValue(message));
        await mcp.processRequest({ message });

        expect(validator1).toHaveBeenCalled();
        expect(validator2).toHaveBeenCalled();
        expect(callOrder).toEqual(['validator1', 'validator2']);
    });
  });

  describe('Response Interception', () => {
    test('should run response interceptors after processing', async () => {
      const mockInterceptor = jest.fn(async (res: MCPResponse): Promise<MCPResponse> => {
        return {
          ...res,
          responseMessage: {
            ...res.responseMessage,
            metadata: { ...(res.responseMessage.metadata || {}), intercepted: true },
          },
        };
      });
      mcp.addResponseInterceptor(mockInterceptor);

      const message = createSampleMessage('msg-intercept', 'intercept content', 'typeB');
      mcp.registerMessageHandler('typeB', async (msg) => ({ ...msg, content: 'handled' }));

      const response = await mcp.processRequest({ message });

      expect(mockInterceptor).toHaveBeenCalled();
      expect(response.success).toBe(true);
      expect(response.responseMessage.metadata?.intercepted).toBe(true);
    });

    test('should run multiple response interceptors in order', async () => {
        const callOrder: string[] = [];
        const interceptor1 = jest.fn(async (res: MCPResponse) => {
            callOrder.push('interceptor1');
            return res;
        });
        const interceptor2 = jest.fn(async (res: MCPResponse) => {
            callOrder.push('interceptor2');
            return res;
        });

        mcp.addResponseInterceptor(interceptor1);
        mcp.addResponseInterceptor(interceptor2);

        const message = createSampleMessage('msg-multi-intercept', 'content', 'type');
        mcp.registerMessageHandler('type', jest.fn().mockResolvedValue(message));
        await mcp.processRequest({ message });

        expect(interceptor1).toHaveBeenCalled();
        expect(interceptor2).toHaveBeenCalled();
        expect(callOrder).toEqual(['interceptor1', 'interceptor2']);
    });

    test('should still return response if interceptor throws (logs error)', async () => {
        const faultyInterceptor = jest.fn(async (res: MCPResponse): Promise<MCPResponse> => {
          throw new Error('Interceptor failed');
        });
        mcp.addResponseInterceptor(faultyInterceptor);

        const message = createSampleMessage('msg-faulty-intercept', 'content', 'typeC');
        const originalContent = 'original handled content';
        mcp.registerMessageHandler('typeC', async (msg) => ({ ...msg, content: originalContent }));

        const response = await mcp.processRequest({ message });

        expect(faultyInterceptor).toHaveBeenCalled();
        expect(response.success).toBe(true); // Success is determined by handler, not interceptor for now
        expect(response.responseMessage.content).toBe(originalContent); // Original response content
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('Error en interceptor de respuesta'),
            expect.any(Error)
        );
      });
  });

  describe('sendMessage method', () => {
    test('sendMessage should wrap message in a request and call processRequest', async () => {
      const processRequestSpy = jest.spyOn(mcp, 'processRequest');
      const message = createSampleMessage('msg-send', 'send test', 'typeD');

      // Need a handler for processRequest to succeed
      mcp.registerMessageHandler('typeD', async (msg) => ({ ...msg, content: 'handled by send' }));

      await mcp.sendMessage(message);

      expect(processRequestSpy).toHaveBeenCalledWith({ message });
    });
  });
});
