import { Body, Controller, Delete, Get, Param, Post, Request, UseGuards, HttpException, HttpStatus, Logger, UnauthorizedException } from '@nestjs/common';
import { ApiBody, ApiSecurity, ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { createCRUDController } from '@wuselverse/crud-framework';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { AuthService } from '../auth/auth.service';
import { AdminKeyGuard } from '../auth/admin-key.guard';

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

  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly authService: AuthService
  ) {
    super(reviewsService);
  }

  @Post()
  @ApiOperation({ summary: 'Create a review', description: 'Creates a review. When review session auth is enabled, the reviewer identity is bound to the signed-in user.' })
  @ApiBody({ type: CreateReviewDto })
  async create(@Body() dto: CreateReviewDto, @Request() req: any) {
    const requireUserSession = process.env.REQUIRE_USER_SESSION_FOR_REVIEW_POSTING === 'true';
    const sessionUser = await this.authService.getUserFromRequest(req);

    if (requireUserSession && !sessionUser) {
      throw new UnauthorizedException('A signed-in user session is required to create reviews.');
    }

    const payload = {
      ...dto,
      from: sessionUser?.id || dto.from,
    };

    return this.reviewsService.create(payload as any);
  }

  @Delete(':id')
  @UseGuards(AdminKeyGuard)
  @ApiSecurity('adminKey')
  @ApiOperation({ summary: 'Delete a review (admin only)' })
  @ApiParam({ name: 'id', description: 'Review ID' })
  async delete(@Param('id') id: string) {
    return this.reviewsService.deleteById(id);
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
