import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { VendorProfile } from './entities/vendor-profile.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { PasswordService } from '../../common/services/password.service';
import { UserRole } from './interfaces/user-role';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(VendorProfile)
    private readonly vendorProfileRepository: Repository<VendorProfile>,
    private readonly passwordService: PasswordService,
  ) { }

  async create(createUserDto: CreateUserDto): Promise<User> {
    await this.validateEmailNotExists(createUserDto.email);
    this.validateVendorProfile(createUserDto);

    const passwordHash = await this.passwordService.hash(createUserDto.password);

    const user = this.userRepository.create({
      email: createUserDto.email,
      passwordHash,
      role: createUserDto.role,
    });

    const savedUser = await this.userRepository.save(user);

    if (this.isVendor(createUserDto.role) && createUserDto.vendorProfile) {
      await this.createVendorProfile(savedUser.id, createUserDto.vendorProfile);
    }

    return this.findOne(savedUser.id);
  }

  async createVendor(createUserDto: CreateUserDto): Promise<User> {
    if (createUserDto.role !== UserRole.VENDOR) {
      throw new BadRequestException('Role must be vendor to create a vendor account');
    }

    if (!createUserDto.vendorProfile) {
      throw new BadRequestException('Vendor profile is required for vendor accounts');
    }

    return this.create(createUserDto);
  }

  async createConsumer(createUserDto: Omit<CreateUserDto, 'vendorProfile'>): Promise<User> {
    return this.create({
      ...createUserDto,
      role: UserRole.CONSUMER,
    });
  }

  async findOneByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      select: ['id', 'email', 'passwordHash', 'role'],
    });
  }

  async findAuthIdentityById(id: string): Promise<AuthenticatedUser | null> {
    const user = await this.userRepository.findOne({
      where: { id },
      select: ['id', 'email', 'role'],
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }

  async findOneByEmailWithProfile(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      select: ['id', 'email', 'passwordHash', 'role'],
      relations: ['vendorProfile'],
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['vendorProfile'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findAll(): Promise<User[]> {
    return this.userRepository.find({
      relations: ['vendorProfile'],
    });
  }

  async findOnePublic(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['vendorProfile'],
      select: ['id', 'role', 'createdAt', 'vendorProfile'], // Explicitly select safe fields
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    if (Object.keys(updateUserDto).length === 0) {
      throw new BadRequestException('At least one field must be provided for update');
    }

    const user = await this.findOne(id);

    const { vendorProfile, ...userData } = updateUserDto;
    this.userRepository.merge(user, userData);

    if (vendorProfile && this.isVendor(user.role)) {
      if (!user.vendorProfile) {

        user.vendorProfile = this.vendorProfileRepository.create({ userId: user.id, ...vendorProfile });
      } else {
        this.vendorProfileRepository.merge(user.vendorProfile, vendorProfile);
      }
    }

    await this.userRepository.save(user);
    return this.findOne(id);
  }

  async changePassword(id: string, changePasswordDto: ChangePasswordDto): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id },
      select: ['id', 'passwordHash'], // Explicitly select passwordHash
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const isPasswordValid = await this.passwordService.compare(
      changePasswordDto.currentPassword,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid current password');
    }

    user.passwordHash = await this.passwordService.hash(changePasswordDto.newPassword);
    await this.userRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
  }

  private async validateEmailNotExists(email: string): Promise<void> {
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Email has already been registered');
    }
  }

  private validateVendorProfile(dto: CreateUserDto): void {
    if (this.isVendor(dto.role) && !dto.vendorProfile) {
      throw new BadRequestException('Vendor profile is required for vendor accounts');
    }
  }

  private isVendor(role: UserRole): boolean {
    return role === UserRole.VENDOR;
  }

  private async createVendorProfile(
    userId: string,
    profileData: CreateUserDto['vendorProfile'],
  ): Promise<VendorProfile> {
    const vendorProfile = this.vendorProfileRepository.create({
      userId,
      ...profileData,
    });
    return this.vendorProfileRepository.save(vendorProfile);
  }

  private async updateVendorProfile(
    userId: string,
    profileData: UpdateUserDto['vendorProfile'],
  ): Promise<void> {
    if (profileData) {
      await this.vendorProfileRepository.update({ userId }, profileData);
    }
  }
}
