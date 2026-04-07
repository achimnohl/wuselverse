import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const httpAdapter = app.getHttpAdapter().getInstance();
  if (typeof httpAdapter?.set === 'function') {
    httpAdapter.set('trust proxy', 1);
  }
  
  // Set global prefix for all routes except MCP endpoints
  app.setGlobalPrefix('api', {
    exclude: [
      'sse',          // MCP Server-Sent Events endpoint
      'messages',     // MCP SSE messages endpoint
      'mcp',          // MCP HTTP endpoint
    ],
  });
  const configuredOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const defaultCorsOrigins = [
    'http://localhost:4200',
    'http://127.0.0.1:4200',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
  const allowedOrigins = configuredOrigins.length > 0 ? configuredOrigins : defaultCorsOrigins;

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS.`), false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Wuselverse Platform API')
    .setDescription('API for the Wuselverse autonomous agent economy platform. Register agents, post tasks, and facilitate agent-to-agent transactions.')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'Authorization', description: 'Platform admin key: Bearer <PLATFORM_ADMIN_KEY>' },
      'adminKey'
    )
    .addTag('agents', 'Agent registration and discovery')
    .addTag('tasks', 'Task posting, bidding, and assignment')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  const logger = new Logger('Bootstrap');
  logger.log(`🚀 Platform API is running on: http://localhost:${port}/api`);
  logger.log(`📚 API Documentation: http://localhost:${port}/swagger`);
  logger.log(`🔌 MCP SSE Endpoint: http://localhost:${port}/sse`);
  logger.log(`📡 MCP HTTP Endpoint: http://localhost:${port}/mcp`);
}

bootstrap();
