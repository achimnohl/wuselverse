import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ValidationPipe,
  UsePipes,
  Type
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody
} from '@nestjs/swagger';
import { BaseMongoService, PaginationOptions } from './base.service';

export interface CRUDControllerConfig {
  /**
   * Resource name for API tags (e.g., 'agents', 'tasks')
   */
  resourceName: string;
  
  /**
   * DTO class for creating resources
   */
  createDto: Type<any>;
  
  /**
   * DTO class for updating resources
   */
  updateDto: Type<any>;
  
  /**
   * Optional: Entity name for documentation (singular, e.g., 'Agent', 'Task')
   */
  entityName?: string;
  
  /**
   * Optional: Additional route decorators
   */
  routePrefix?: string;
}

/**
 * Factory function to create a CRUD controller class
 * 
 * @example
 * ```typescript
 * const AgentsController = createCRUDController({
 *   resourceName: 'agents',
 *   createDto: CreateAgentDto,
 *   updateDto: UpdateAgentDto,
 *   entityName: 'Agent'
 * });
 * 
 * @Controller('agents')
 * export class AgentsControllerImpl extends AgentsController {
 *   constructor(private readonly agentsService: AgentsService) {
 *     super(agentsService);
 *   }
 * }
 * ```
 */
export function createCRUDController<T>(config: CRUDControllerConfig): Type<any> {
  const { resourceName, createDto, updateDto, entityName } = config;
  const entity = entityName || resourceName;

  @ApiTags(resourceName)
  @Controller(config.routePrefix || resourceName)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  class CRUDController {
    constructor(protected readonly service: BaseMongoService<any>) {}

    @Post()
    @ApiOperation({
      summary: `Create a new ${entity}`,
      description: `Create a new ${entity} resource`
    })
    @ApiBody({ type: createDto })
    @ApiResponse({ status: 201, description: `${entity} successfully created` })
    @ApiResponse({ status: 400, description: 'Invalid input data' })
    async create(@Body() dto: InstanceType<typeof createDto>) {
      return this.service.create(dto);
    }

    @Get()
    @ApiOperation({
      summary: `Get all ${resourceName}`,
      description: `Retrieve a paginated list of ${resourceName}`
    })
    @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10)' })
    @ApiResponse({ status: 200, description: `List of ${resourceName}` })
    async findAll(
      @Query('page') page?: number,
      @Query('limit') limit?: number,
      @Query() filters?: Record<string, any>
    ) {
      const { page: p, limit: l, ...filter } = filters || {};
      const options: PaginationOptions = {
        page: page || Number(p) || 1,
        limit: limit || Number(l) || 10
      };
      return this.service.findAll(filter, options);
    }

    @Get(':id')
    @ApiOperation({
      summary: `Get ${entity} by ID`,
      description: `Retrieve a single ${entity} by its ID`
    })
    @ApiParam({ name: 'id', description: `${entity} ID` })
    @ApiResponse({ status: 200, description: `${entity} found` })
    @ApiResponse({ status: 404, description: `${entity} not found` })
    async findById(@Param('id') id: string) {
      return this.service.findById(id);
    }

    @Put(':id')
    @ApiOperation({
      summary: `Update ${entity}`,
      description: `Update an existing ${entity} by ID`
    })
    @ApiParam({ name: 'id', description: `${entity} ID` })
    @ApiBody({ type: updateDto })
    @ApiResponse({ status: 200, description: `${entity} successfully updated` })
    @ApiResponse({ status: 404, description: `${entity} not found` })
    @ApiResponse({ status: 400, description: 'Invalid input data' })
    async update(
      @Param('id') id: string,
      @Body() dto: InstanceType<typeof updateDto>
    ) {
      return this.service.updateById(id, dto);
    }

    @Delete(':id')
    @ApiOperation({
      summary: `Delete ${entity}`,
      description: `Delete a ${entity} by ID`
    })
    @ApiParam({ name: 'id', description: `${entity} ID` })
    @ApiResponse({ status: 200, description: `${entity} successfully deleted` })
    @ApiResponse({ status: 404, description: `${entity} not found` })
    async delete(@Param('id') id: string) {
      return this.service.deleteById(id);
    }
  }

  return CRUDController as Type<any>;
}

/**
 * Decorator to extend CRUD controller with custom endpoints
 * Use this to add additional endpoints beyond standard CRUD
 * 
 * @example
 * ```typescript
 * @Controller('agents')
 * export class AgentsController extends createCRUDController(config) {
 *   constructor(private readonly agentsService: AgentsService) {
 *     super(agentsService);
 *   }
 * 
 *   @Get('search')
 *   @ApiOperation({ summary: 'Search agents' })
 *   async search(@Query('q') query: string) {
 *     return this.agentsService.search(query);
 *   }
 * }
 * ```
 */
export function ExtendCRUD() {
  return function (target: any) {
    return target;
  };
}
