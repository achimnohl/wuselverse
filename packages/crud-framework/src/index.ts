/**
 * @wuselverse/crud-framework
 * 
 * Shared CRUD framework for Wuselverse platform
 * Provides reusable base service and controller factory for MongoDB/Mongoose
 */

// Base service
export {
  BaseMongoService,
  PaginationOptions,
  PaginatedResult,
  APIResponse
} from './base.service';

// Controller factory
export {
  createCRUDController,
  ExtendCRUD,
  CRUDControllerConfig
} from './crud.factory';
