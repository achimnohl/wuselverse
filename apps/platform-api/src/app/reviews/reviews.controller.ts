import { Controller, Get, Param, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { createCRUDController } from '@wuselverse/crud-framework';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';

const ReviewsCRUDBase = createCRUDController({
  resourceName: 'reviews',
  createDto: CreateReviewDto,
  updateDto: CreateReviewDto, // Reviews are immutable, so update = create
  entityName: 'Review'
});

@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController extends ReviewsCRUDBase {
  private readonly logger = new Logger(ReviewsController.name);

  constructor(private readonly reviewsService: ReviewsService) {
    super(reviewsService);
  }

  @Get('agent/:agentId')
  @ApiOperation({ summary: 'Get all reviews for an agent' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  @ApiResponse({ status: 200, description: 'Reviews retrieved successfully' })
  async getAgentReviews(@Param('agentId') agentId: string) {
    this.logger.debug('GET /reviews/agent/:agentId - Fetching reviews', { agentId });
    const reviews = await this.reviewsService.findByAgent(agentId);
    this.logger.debug('GET /reviews/agent/:agentId - Found reviews', { count: reviews.length });
    return {
      success: true,
      data: reviews,
      message: `Found ${reviews.length} reviews for agent ${agentId}`
    };
  }

  @Get('reviewer/:reviewerId')
  @ApiOperation({ summary: 'Get all reviews submitted by an agent' })
  @ApiParam({ name: 'reviewerId', description: 'Reviewer agent ID' })
  @ApiResponse({ status: 200, description: 'Reviews retrieved successfully' })
  async getReviewerReviews(@Param('reviewerId') reviewerId: string) {
    const reviews = await this.reviewsService.findByReviewer(reviewerId);
    return {
      success: true,
      data: reviews,
      message: `Found ${reviews.length} reviews by agent ${reviewerId}`
    };
  }

  @Get('task/:taskId')
  @ApiOperation({ summary: 'Get review for a specific task' })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiResponse({ status: 200, description: 'Review retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async getTaskReview(@Param('taskId') taskId: string) {
    const review = await this.reviewsService.findByTask(taskId);
    
    if (!review) {
      throw new HttpException(
        'No review found for this task',
        HttpStatus.NOT_FOUND
      );
    }

    return {
      success: true,
      data: review
    };
  }

  @Get('agent/:agentId/stats')
  @ApiOperation({ summary: 'Get rating statistics for an agent' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getAgentStats(@Param('agentId') agentId: string) {
    this.logger.debug('GET /reviews/agent/:agentId/stats - Fetching stats', { agentId });
    const [reviews, averageRating, distribution] = await Promise.all([
      this.reviewsService.findByAgent(agentId),
      this.reviewsService.getAverageRating(agentId),
      this.reviewsService.getRatingDistribution(agentId)
    ]);

    this.logger.debug('GET /reviews/agent/:agentId/stats - Computed stats', {
      agentId,
      totalReviews: reviews.length,
      averageRating
    });

    return {
      success: true,
      data: {
        totalReviews: reviews.length,
        averageRating,
        distribution,
        recentReviews: reviews.slice(0, 5)
      }
    };
  }
}
