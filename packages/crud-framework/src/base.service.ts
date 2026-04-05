import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Model, Document, FilterQuery, UpdateQuery } from 'mongoose';

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sort?: Record<string, 1 | -1>;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Base Service for MongoDB/Mongoose CRUD operations
 * Provides standard create, read, update, delete operations with pagination
 */
@Injectable()
export abstract class BaseMongoService<T extends Document> {
  constructor(protected readonly model: Model<T>) {}

  /**
   * Create a new document
   */
  async create(createDto: Partial<T>): Promise<APIResponse<T>> {
    try {
      const created = new this.model(createDto);
      const saved = await created.save();
      return {
        success: true,
        data: saved,
        message: 'Resource created successfully'
      };
    } catch (error: any) {
      throw new BadRequestException({
        success: false,
        error: error?.message || 'Failed to create resource'
      });
    }
  }

  /**
   * Find all documents with optional filtering and pagination
   */
  async findAll(
    filter: FilterQuery<T> = {},
    options: PaginationOptions = {}
  ): Promise<APIResponse<PaginatedResult<T>>> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 10;
      const skip = (page - 1) * limit;
      const sort = options.sort || { createdAt: -1 };

      const [data, total] = await Promise.all([
        this.model.find(filter).skip(skip).limit(limit).sort(sort).exec(),
        this.model.countDocuments(filter).exec()
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        data: {
          data,
          total,
          page,
          limit,
          totalPages
        }
      };
    } catch (error: any) {
      throw new BadRequestException({
        success: false,
        error: error?.message || 'Failed to fetch resources'
      });
    }
  }

  /**
   * Find a single document by ID
   */
  async findById(id: string): Promise<APIResponse<T>> {
    try {
      const doc = await this.model.findById(id).exec();
      
      if (!doc) {
        throw new NotFoundException({
          success: false,
          error: `Resource with ID ${id} not found`
        });
      }

      return {
        success: true,
        data: doc
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException({
        success: false,
        error: error?.message || 'Failed to fetch resource'
      });
    }
  }

  /**
   * Find one document by filter
   */
  async findOne(filter: FilterQuery<T>): Promise<APIResponse<T | null>> {
    try {
      const doc = await this.model.findOne(filter).exec();
      return {
        success: true,
        data: doc
      };
    } catch (error: any) {
      throw new BadRequestException({
        success: false,
        error: error?.message || 'Failed to fetch resource'
      });
    }
  }

  /**
   * Update a document by ID
   */
  async updateById(id: string, updateDto: UpdateQuery<T>): Promise<APIResponse<T>> {
    try {
      const updated = await this.model
        .findByIdAndUpdate(id, updateDto, { new: true, runValidators: true })
        .exec();

      if (!updated) {
        throw new NotFoundException({
          success: false,
          error: `Resource with ID ${id} not found`
        });
      }

      return {
        success: true,
        data: updated,
        message: 'Resource updated successfully'
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException({
        success: false,
        error: error?.message || 'Failed to update resource'
      });
    }
  }

  /**
   * Delete a document by ID
   */
  async deleteById(id: string): Promise<APIResponse<T>> {
    try {
      const deleted = await this.model.findByIdAndDelete(id).exec();

      if (!deleted) {
        throw new NotFoundException({
          success: false,
          error: `Resource with ID ${id} not found`
        });
      }

      return {
        success: true,
        data: deleted,
        message: 'Resource deleted successfully'
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException({
        success: false,
        error: error?.message || 'Failed to delete resource'
      });
    }
  }

  /**
   * Count documents matching filter
   */
  async count(filter: FilterQuery<T> = {}): Promise<number> {
    return this.model.countDocuments(filter).exec();
  }

  /**
   * Check if document exists
   */
  async exists(filter: FilterQuery<T>): Promise<boolean> {
    const count = await this.model.countDocuments(filter).limit(1).exec();
    return count > 0;
  }

  /**
   * Bulk create documents
   */
  async bulkCreate(createDtos: Partial<T>[]): Promise<APIResponse<T[]>> {
    try {
      const created = await this.model.insertMany(createDtos);
      return {
        success: true,
        data: created as unknown as T[],
        message: `${created.length} resources created successfully`
      };
    } catch (error: any) {
      throw new BadRequestException({
        success: false,
        error: error?.message || 'Failed to bulk create resources'
      });
    }
  }
}
