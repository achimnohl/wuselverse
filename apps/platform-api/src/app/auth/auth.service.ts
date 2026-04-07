import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
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
import { LoginDto, RegisterUserDto } from './auth.dto';

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
  private readonly sessionTtlMs = Number(process.env.SESSION_TTL_MS || 1000 * 60 * 60 * 24 * 7);

  constructor(
    @InjectModel('User') private readonly userModel: Model<UserDocument>,
    @InjectModel('UserSession') private readonly userSessionModel: Model<UserSessionDocument>
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
    const cookieHeader = request?.headers?.cookie as string | undefined;
    if (!cookieHeader) {
      return null;
    }

    const cookies = cookieHeader.split(';').map((part) => part.trim());
    const match = cookies.find((cookie) => cookie.startsWith(`${this.sessionCookieName}=`));
    if (!match) {
      return null;
    }

    const value = match.substring(this.sessionCookieName.length + 1);
    return decodeURIComponent(value);
  }

  attachSessionCookie(response: any, sessionToken: string): void {
    response.cookie(this.sessionCookieName, sessionToken, this.getCookieOptions());
  }

  clearSessionCookie(response: any): void {
    response.clearCookie(this.sessionCookieName, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.isSecureCookie(),
      path: '/',
    });
  }

  private async createSessionForUser(user: UserDocument, metadata?: SessionMetadata) {
    const rawSessionToken = `sess_${randomUUID().replace(/-/g, '')}`;
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

  private hashSessionToken(sessionToken: string): string {
    return createHash('sha256').update(sessionToken).digest('hex');
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
