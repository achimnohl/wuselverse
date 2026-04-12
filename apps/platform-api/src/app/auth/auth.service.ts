import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'crypto';
import { UserDocument } from './user.schema';
import { UserSessionDocument } from './user-session.schema';
import { UserApiKeyDocument } from './user-api-key.schema';
import { LoginDto, RegisterUserDto } from './auth.dto';
import { CreateUserApiKeyDto, UserApiKeyResponseDto, CreatedUserApiKeyDto } from './user-api-key.dto';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
}

interface SessionMetadata {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly sessionCookieName = process.env.SESSION_COOKIE_NAME || 'wuselverse_session';
  private readonly csrfCookieName = process.env.CSRF_COOKIE_NAME || 'wuselverse_csrf';
  private readonly sessionTtlMs = Number(process.env.SESSION_TTL_MS || 1000 * 60 * 60 * 24 * 7);

  constructor(
    @InjectModel('User') private readonly userModel: Model<UserDocument>,
    @InjectModel('UserSession') private readonly userSessionModel: Model<UserSessionDocument>,
    @InjectModel('UserApiKey') private readonly userApiKeyModel: Model<UserApiKeyDocument>
  ) {}

  async register(dto: RegisterUserDto, metadata?: SessionMetadata) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.userModel.findOne({ email }).exec();
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const displayName = dto.displayName?.trim() || email.split('@')[0];
    const passwordHash = this.hashPassword(dto.password);

    const user = await new this.userModel({
      email,
      displayName,
      passwordHash,
      roles: ['user'],
      isActive: true,
    }).save();

    this.logger.log(`Registered user ${email}`);

    return this.createSessionForUser(user, metadata);
  }

  async login(dto: LoginDto, metadata?: SessionMetadata) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.userModel.findOne({ email, isActive: true }).exec();

    if (!user || !this.verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    this.logger.log(`User login succeeded for ${email}`);
    return this.createSessionForUser(user, metadata);
  }

  async validateSession(sessionToken: string): Promise<SessionUser | null> {
    if (!sessionToken) {
      return null;
    }

    const sessionHash = this.hashSessionToken(sessionToken);
    const session = await this.userSessionModel
      .findOne({ sessionHash, expiresAt: { $gt: new Date() } })
      .exec();

    if (!session) {
      return null;
    }

    const user = await this.userModel.findById(session.userId).exec();
    if (!user || !user.isActive) {
      await this.userSessionModel.deleteOne({ _id: session._id }).exec();
      return null;
    }

    this.userSessionModel
      .updateOne({ _id: session._id }, { lastUsedAt: new Date() })
      .exec()
      .catch(() => null);

    return this.toSessionUser(user);
  }

  async logout(sessionToken: string | null): Promise<void> {
    if (!sessionToken) {
      return;
    }

    const sessionHash = this.hashSessionToken(sessionToken);
    await this.userSessionModel.deleteOne({ sessionHash }).exec();
  }

  async getUserFromRequest(request: any): Promise<SessionUser | null> {
    const sessionToken = this.getSessionTokenFromRequest(request);
    if (!sessionToken) {
      return null;
    }

    return this.validateSession(sessionToken);
  }

  getSessionTokenFromRequest(request: any): string | null {
    return this.getCookieValueFromRequest(request, this.sessionCookieName);
  }

  getCsrfTokenFromRequest(request: any): string | null {
    return this.getCookieValueFromRequest(request, this.csrfCookieName);
  }

  getCsrfHeaderFromRequest(request: any): string | null {
    const headerValue = request?.headers?.['x-csrf-token'] ?? request?.headers?.['x-xsrf-token'];
    if (Array.isArray(headerValue)) {
      return headerValue[0] || null;
    }

    return typeof headerValue === 'string' ? headerValue : null;
  }

  issueCsrfToken(): string {
    return randomBytes(24).toString('hex');
  }

  getCsrfCookieName(): string {
    return this.csrfCookieName;
  }

  attachSessionCookie(response: any, sessionToken: string, csrfToken?: string): void {
    response.cookie(this.sessionCookieName, sessionToken, this.getCookieOptions());
    this.attachCsrfCookie(response, csrfToken);
  }

  attachCsrfCookie(response: any, csrfToken?: string): string {
    const csrfValue = csrfToken || this.issueCsrfToken();
    response.cookie(this.csrfCookieName, csrfValue, {
      httpOnly: false,
      sameSite: 'lax',
      secure: this.isSecureCookie(),
      path: '/',
      maxAge: this.sessionTtlMs,
    });

    return csrfValue;
  }

  clearSessionCookie(response: any): void {
    response.clearCookie(this.sessionCookieName, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.isSecureCookie(),
      path: '/',
    });
    response.clearCookie(this.csrfCookieName, {
      httpOnly: false,
      sameSite: 'lax',
      secure: this.isSecureCookie(),
      path: '/',
    });
  }

  private async createSessionForUser(user: UserDocument, metadata?: SessionMetadata) {
    const rawSessionToken = `sess_${randomUUID().replace(/-/g, '')}`;
    const csrfToken = this.issueCsrfToken();
    const sessionHash = this.hashSessionToken(rawSessionToken);
    const expiresAt = new Date(Date.now() + this.sessionTtlMs);

    await new this.userSessionModel({
      userId: user._id.toString(),
      sessionHash,
      expiresAt,
      lastUsedAt: new Date(),
      userAgent: metadata?.userAgent || null,
      ipAddress: metadata?.ipAddress || null,
    }).save();

    return {
      user: this.toSessionUser(user),
      sessionToken: rawSessionToken,
      csrfToken,
      expiresAt,
    };
  }

  private toSessionUser(user: UserDocument): SessionUser {
    return {
      id: user._id.toString(),
      email: user.email,
      displayName: user.displayName,
      roles: Array.isArray(user.roles) ? user.roles : ['user'],
    };
  }

  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${derivedKey}`;
  }

  private verifyPassword(password: string, storedHash: string): boolean {
    const [salt, expectedHash] = storedHash.split(':');
    if (!salt || !expectedHash) {
      return false;
    }

    const derivedBuffer = scryptSync(password, salt, 64);
    const expectedBuffer = Buffer.from(expectedHash, 'hex');

    if (derivedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(derivedBuffer, expectedBuffer);
  }

  // ========================================
  // User API Key Management
  // ========================================

  /**
   * Create a new API key for a user
   */
  async createUserApiKey(userId: string, dto: CreateUserApiKeyDto): Promise<CreatedUserApiKeyDto> {
    this.logger.log(`Creating API key for user ${userId}`, { name: dto.name });

    // Generate unique API key: wusu_<userId-first-8>_<32-char-uuid>
    const userIdPrefix = userId.substring(0, 8);
    const uniquePart = randomUUID().replace(/-/g, '');
    const rawKey = `wusu_${userIdPrefix}_${uniquePart}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const prefix = rawKey.substring(0, 20) + '...'; // First 20 chars for display

    // Calculate expiration
    let expiresAt: Date | null = null;
    if (dto.expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + dto.expiresInDays);
    }

    const apiKey = await this.userApiKeyModel.create({
      userId,
      name: dto.name,
      keyHash,
      prefix,
      expiresAt,
      lastUsedAt: null,
      revokedAt: null,
    });

    this.logger.log(`API key created: ${apiKey._id}`, { userId, name: dto.name });

    return {
      id: apiKey._id.toString(),
      name: apiKey.name,
      prefix: apiKey.prefix,
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
      expiresAt: apiKey.expiresAt,
      isRevoked: false,
      apiKey: rawKey, // ONLY returned once!
    };
  }

  /**
   * List all API keys for a user (without actual key values)
   */
  async listUserApiKeys(userId: string): Promise<UserApiKeyResponseDto[]> {
    const keys = await this.userApiKeyModel
      .find({ userId, revokedAt: null })
      .sort({ createdAt: -1 })
      .exec();

    return keys.map((key) => ({
      id: key._id.toString(),
      name: key.name,
      prefix: key.prefix,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      isRevoked: !!key.revokedAt,
    }));
  }

  /**
   * Revoke an API key
   */
  async revokeUserApiKey(userId: string, keyId: string): Promise<void> {
    const key = await this.userApiKeyModel.findById(keyId).exec();

    if (!key) {
      throw new NotFoundException('API key not found');
    }

    if (key.userId !== userId) {
      throw new UnauthorizedException('You can only revoke your own API keys');
    }

    if (key.revokedAt) {
      throw new BadRequestException('API key is already revoked');
    }

    key.revokedAt = new Date();
    await key.save();

    this.logger.log(`API key revoked: ${keyId}`, { userId });
  }

  /**
   * Validate a user API key and return user info
   */
  async validateUserApiKey(rawKey: string): Promise<SessionUser | null> {
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.userApiKeyModel
      .findOne({ keyHash, revokedAt: null })
      .exec();

    if (!apiKey) {
      return null; // Invalid or revoked key
    }

    // Check expiration
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      this.logger.warn(`Expired API key used: ${apiKey._id}`);
      return null;
    }

    // Update last used timestamp (async, don't wait)
    this.userApiKeyModel
      .updateOne({ _id: apiKey._id }, { lastUsedAt: new Date() })
      .exec()
      .catch(() => null);

    // Get user details
    const user = await this.userModel.findById(apiKey.userId).exec();
    if (!user) {
      this.logger.error(`API key ${apiKey._id} references non-existent user ${apiKey.userId}`);
      return null;
    }

    return this.toSessionUser(user);
  }

  private hashSessionToken(sessionToken: string): string {
    return createHash('sha256').update(sessionToken).digest('hex');
  }

  private getCookieValueFromRequest(request: any, cookieName: string): string | null {
    const cookieHeader = request?.headers?.cookie as string | undefined;
    if (!cookieHeader) {
      return null;
    }

    const cookies = cookieHeader.split(';').map((part) => part.trim());
    const match = cookies.find((cookie) => cookie.startsWith(`${cookieName}=`));
    if (!match) {
      return null;
    }

    const value = match.substring(cookieName.length + 1);
    return decodeURIComponent(value);
  }

  private getCookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.isSecureCookie(),
      path: '/',
      maxAge: this.sessionTtlMs,
    };
  }

  private isSecureCookie(): boolean {
    return (process.env.NODE_ENV || '').toLowerCase() === 'production';
  }
}
