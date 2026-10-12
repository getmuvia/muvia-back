import type { User } from '../entities/user.entity';
import type { VendorProfile } from '../entities/vendor-profile.entity';

export interface PublicVendorResponse {
  id: string;
  role: User['role'];
  createdAt: Date;
  vendorProfile: Pick<
    VendorProfile,
    | 'id'
    | 'businessName'
    | 'description'
    | 'logoUrl'
    | 'coverImage'
    | 'aboutMe'
    | 'socialLinks'
    | 'businessHours'
    | 'isVerified'
    | 'offersRepairs'
    | 'repairScope'
    | 'repairDetails'
    | 'repairsExternalProducts'
  >;
}
