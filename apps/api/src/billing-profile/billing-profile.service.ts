import { Injectable } from '@nestjs/common';
import { BillingProfileRepository } from './billing-profile.repository';

@Injectable()
export class BillingProfileService {
  constructor(private readonly profileRepo: BillingProfileRepository) {}

  async getProfile(userId: string) {
    const profile = await this.profileRepo.findByUser(userId);
    return profile ?? null;
  }

  async upsertProfile(userId: string, data: {
    fullName?: string;
    companyName?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    countryCode?: string;
    vatId?: string;
    phone?: string;
  }) {
    return this.profileRepo.upsert(userId, data);
  }
}
