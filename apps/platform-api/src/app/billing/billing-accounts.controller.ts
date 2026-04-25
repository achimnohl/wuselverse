import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { BillingAccountsService } from './billing-accounts.service';
import { AnyAuthGuard } from '../auth/any-auth.guard';
import { AuthService } from '../auth/auth.service';

@Controller('billing-accounts')
@UseGuards(AnyAuthGuard)
export class BillingAccountsController {
  constructor(
    private readonly billingAccountsService: BillingAccountsService,
    private readonly authService: AuthService
  ) {}

  /**
   * Get current user's billing account
   */
  @Get('me')
  async getMyBillingAccount(@Request() req: any) {
    const user = await this.authService.getUserFromRequest(req);
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }
    
    let account = await this.billingAccountsService.findByOwner(user.id);
    
    // Auto-create billing account if it doesn't exist
    if (!account) {
      account = await this.billingAccountsService.createPersonalAccount(
        user.id,
        user.displayName || user.email || 'User'
      );
    }
    
    return {
      success: true,
      data: account
    };
  }

  /**
   * Get billing account by ID
   */
  @Get(':id')
  async getBillingAccount(@Param('id') id: string) {
    const result = await this.billingAccountsService.findById(id);
    
    return result;
  }

  /**
   * Get billing account balance
   */
  @Get(':id/balance')
  async getBalance(@Param('id') id: string) {
    const balance = await this.billingAccountsService.getBalance(id);
    
    return {
      success: true,
      data: { balance }
    };
  }
}
