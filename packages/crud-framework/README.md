# @wuselverse/crud-framework

Shared CRUD framework for Wuselverse platform providing reusable base service and controller factory for MongoDB/Mongoose operations.

## Features

- **BaseMongoService**: Abstract service class with standard CRUD operations
- **createCRUDController**: Factory function to generate NestJS controllers
- Automatic Swagger/OpenAPI documentation
- Pagination support
- Type-safe with TypeScript generics
- Validation with class-validator
- Standardized API responses

## Installation

```bash
npm install @wuselverse/crud-framework
```

## Usage

### 1. Create a Mongoose Schema and Model

```typescript
import { Schema, model, Document } from 'mongoose';

export interface IAgent extends Document {
  name: string;
  description: string;
  owner: string;
  createdAt: Date;
  updatedAt: Date;
}

const AgentSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  owner: { type: String, required: true }
}, { timestamps: true });

export const AgentModel = model<IAgent>('Agent', AgentSchema);
```

### 2. Create DTOs

```typescript
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAgentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  owner: string;
}

export class UpdateAgentDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;
}
```

### 3. Create a Service extending BaseMongoService

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoService } from '@wuselverse/crud-framework';
import { IAgent } from './agent.schema';

@Injectable()
export class AgentsService extends BaseMongoService<IAgent> {
  constructor(
    @InjectModel('Agent') private agentModel: Model<IAgent>
  ) {
    super(agentModel);
  }

  // Add custom methods here
  async findByOwner(owner: string) {
    return this.findAll({ owner });
  }
}
```

### 4. Create a Controller using the Factory

```typescript
import { Controller } from '@nestjs/common';
import { createCRUDController } from '@wuselverse/crud-framework';
import { AgentsService } from './agents.service';
import { CreateAgentDto, UpdateAgentDto } from './dto';

const AgentsCRUD = createCRUDController({
  resourceName: 'agents',
  createDto: CreateAgentDto,
  updateDto: UpdateAgentDto,
  entityName: 'Agent'
});

@Controller('agents')
export class AgentsController extends AgentsCRUD {
  constructor(private readonly agentsService: AgentsService) {
    super(agentsService);
  }

  // Add custom endpoints here
  @Get('owner/:owner')
  @ApiOperation({ summary: 'Get agents by owner' })
  async findByOwner(@Param('owner') owner: string) {
    return this.agentsService.findByOwner(owner);
  }
}
```

### 5. Register in Module

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AgentSchema } from './agent.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Agent', schema: AgentSchema }])
  ],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService]
})
export class AgentsModule {}
```

## API Endpoints

The factory automatically generates these endpoints:

- `POST /{resource}` - Create new resource
- `GET /{resource}` - Get all resources (with pagination)
- `GET /{resource}/:id` - Get resource by ID
- `PUT /{resource}/:id` - Update resource by ID
- `DELETE /{resource}/:id` - Delete resource by ID

### Pagination

Query parameters for listing endpoints:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)

### Response Format

All endpoints return standardized responses:

```typescript
{
  success: boolean;
  data?: T | PaginatedResult<T>;
  error?: string;
  message?: string;
}
```

## BaseMongoService Methods

- `create(dto)` - Create a document
- `findAll(filter, options)` - Find all with pagination
- `findById(id)` - Find by ID
- `findOne(filter)` - Find one by filter
- `updateById(id, dto)` - Update by ID
- `deleteById(id)` - Delete by ID
- `count(filter)` - Count documents
- `exists(filter)` - Check existence
- `bulkCreate(dtos)` - Bulk insert

## License

Apache-2.0
