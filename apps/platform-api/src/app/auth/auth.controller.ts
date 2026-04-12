import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from './api-key.guard';
import { AuthService } from './auth.service';
import { LoginDto, RegisterUserDto } from './auth.dto';
import { CreateUserApiKeyDto, UserApiKeyResponseDto, CreatedUserApiKeyDto } from './user-api-key.dto';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionCsrfGuard } from './session-csrf.guard';

const REGISTER_THROTTLE = { default: { limit: 5, ttl: 900 } };
const LOGIN_THROTTLE = { default: { limit: 10, ttl: 900 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @Throttle(REGISTER_THROTTLE)
  @ApiOperation({ summary: 'Register a new human user session for the web UI' })
  @ApiBody({ type: RegisterUserDto })
  async register(
    @Body() dto: RegisterUserDto,
    @Request() req: any,
    @Res({ passthrough: true }) res: any
  ) {
    const result = await this.authService.register(dto, {
      userAgent: req.headers['user-agent'] as string | undefined,
      ipAddress: req.ip,
    });

    this.authService.attachSessionCookie(res, result.sessionToken, result.csrfToken);

    return {
      success: true,
      data: {
        user: result.user,
        expiresAt: result.expiresAt,
        csrfToken: result.csrfToken,
      },
      message: 'User registered and signed in successfully',
    };
  }

  @Post('login')
  @Public()
  @Throttle(LOGIN_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in and create a session cookie for the web UI' })
  @ApiBody({ type: LoginDto })
  async login(
    @Body() dto: LoginDto,
    @Request() req: any,
    @Res({ passthrough: true }) res: any
  ) {
    const result = await this.authService.login(dto, {
      userAgent: req.headers['user-agent'] as string | undefined,
      ipAddress: req.ip,
    });

    this.authService.attachSessionCookie(res, result.sessionToken, result.csrfToken);

    return {
      success: true,
      data: {
        user: result.user,
        expiresAt: result.expiresAt,
        csrfToken: result.csrfToken,
      },
      message: 'Signed in successfully',
    };
  }

  @Post('logout')
  @UseGuards(SessionAuthGuard, SessionCsrfGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out and clear the current session cookie' })
  async logout(@Request() req: any, @Res({ passthrough: true }) res: any) {
    await this.authService.logout(this.authService.getSessionTokenFromRequest(req));
    this.authService.clearSessionCookie(res);

    return {
      success: true,
      message: 'Signed out successfully',
    };
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Get the currently signed-in UI user' })
  async me(@Request() req: any, @Res({ passthrough: true }) res: any) {
    let csrfToken = this.authService.getCsrfTokenFromRequest(req);

    if (!csrfToken) {
      csrfToken = this.authService.attachCsrfCookie(res);
    }

    return {
      success: true,
      data: {
        user: req.user,
        csrfToken,
      },
    };
  }

  // ========================================
  // User API Key Management
  // ========================================

  @Post('keys')
  @UseGuards(SessionAuthGuard, SessionCsrfGuard)
  @ApiOperation({ 
    summary: 'Create a new API key',
    description: 'Creates a new API key for script/programmatic access. The full key is returned ONCE and cannot be retrieved again. Store it securely!'
  })
  @ApiBody({ type: CreateUserApiKeyDto })
  async createApiKey(
    @Body() dto: CreateUserApiKeyDto,
    @Request() req: any
  ): Promise<{ success: boolean; data: CreatedUserApiKeyDto }> {
    const userId = req.user.id;
    const apiKey = await this.authService.createUserApiKey(userId, dto);

    return {
      success: true,
      data: apiKey,
    };
  }

  @Get('keys')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ 
    summary: 'List your API keys',
    description: 'Returns all active API keys for the current user. Does not return the actual key values.'
  })
  async listApiKeys(@Request() req: any): Promise<{ success: boolean; data: UserApiKeyResponseDto[] }> {
    const userId = req.user.id;
    const keys = await this.authService.listUserApiKeys(userId);

    return {
      success: true,
      data: keys,
    };
  }

  @Delete('keys/:id')
  @UseGuards(SessionAuthGuard, SessionCsrfGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Revoke an API key',
    description: 'Revokes an API key. This action cannot be undone. The key will no longer be usable for authentication.'
  })
  @ApiParam({ name: 'id', description: 'API key ID' })
  async revokeApiKey(
    @Param('id') id: string,
    @Request() req: any
  ): Promise<{ success: boolean; message: string }> {
    const userId = req.user.id;
    await this.authService.revokeUserApiKey(userId, id);

    return {
      success: true,
      message: 'API key revoked successfully',
    };
  }
}
