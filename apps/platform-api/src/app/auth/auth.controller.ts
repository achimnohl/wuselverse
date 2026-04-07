import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './api-key.guard';
import { AuthService } from './auth.service';
import { LoginDto, RegisterUserDto } from './auth.dto';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionCsrfGuard } from './session-csrf.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
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
}
