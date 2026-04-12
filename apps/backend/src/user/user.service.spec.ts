import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UserService } from './user.service';

jest.mock('bcryptjs');

describe('UserService', () => {
  let service: UserService;
  let mockUserRepo: {
    findById: jest.Mock;
    updateUsername: jest.Mock;
    updateDisplayName: jest.Mock;
    updateColorPreference: jest.Mock;
    searchByUsername: jest.Mock;
    softDelete: jest.Mock;
  };
  let mockCredentialRepo: { findCredentialByUserId: jest.Mock };
  let mockRoomRepo: { findIdsByOwner: jest.Mock };

  const now = new Date();
  const user = {
    id: 1,
    username: 'alice',
    displayName: 'Alice',
    email: 'alice@example.com',
    createdAt: now,
    updatedAt: now,
    preferredHue: null as number | null,
  };

  beforeEach(() => {
    mockUserRepo = {
      findById: jest.fn(),
      updateUsername: jest.fn(),
      updateDisplayName: jest.fn(),
      updateColorPreference: jest.fn(),
      searchByUsername: jest.fn(),
      softDelete: jest.fn().mockResolvedValue(undefined),
    };
    mockCredentialRepo = { findCredentialByUserId: jest.fn() };
    mockRoomRepo = { findIdsByOwner: jest.fn() };

    service = new UserService(mockUserRepo as any, mockCredentialRepo as any, mockRoomRepo as any);
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      mockUserRepo.findById.mockResolvedValue(user);

      const result = await service.getProfile(1);

      expect(result).toEqual({
        userId: 1,
        username: 'alice',
        displayName: 'Alice',
        email: 'alice@example.com',
        createdAt: now.toISOString(),
        colorPreference: null,
      });
    });

    it('should return null when user not found', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      const result = await service.getProfile(999);

      expect(result).toBeNull();
    });
  });

  describe('updateUsername', () => {
    it('should trim and update username', async () => {
      const updated = { ...user, username: 'bob' };
      mockUserRepo.updateUsername.mockResolvedValue(updated);

      const result = await service.updateUsername(1, '  bob  ');

      expect(mockUserRepo.updateUsername).toHaveBeenCalledWith(1, 'bob');
      expect(result.username).toBe('bob');
    });

    it('should throw on invalid username', async () => {
      await expect(service.updateUsername(1, 'ab')).rejects.toThrow('Username must be');
    });

    it('should throw on reserved prefix user_', async () => {
      await expect(service.updateUsername(1, 'user_test')).rejects.toThrow('Username must be');
    });

    it('should throw when user not found', async () => {
      mockUserRepo.updateUsername.mockResolvedValue(null);

      await expect(service.updateUsername(999, 'validname')).rejects.toThrow('User not found');
    });
  });

  describe('updateDisplayName', () => {
    it('should trim and update display name', async () => {
      const updated = { ...user, displayName: 'Alicia' };
      mockUserRepo.updateDisplayName.mockResolvedValue(updated);

      const result = await service.updateDisplayName(1, '  Alicia  ');

      expect(mockUserRepo.updateDisplayName).toHaveBeenCalledWith(1, 'Alicia');
      expect(result).toBeTruthy();
    });

    it('should throw on blank-after-trim input', async () => {
      await expect(service.updateDisplayName(1, '   ')).rejects.toThrow();
    });

    it('should throw on too-long input after trim', async () => {
      const longName = 'a'.repeat(51);
      await expect(service.updateDisplayName(1, longName)).rejects.toThrow();
    });

    it('should allow setting displayName to null', async () => {
      const updated = { ...user, displayName: null };
      mockUserRepo.updateDisplayName.mockResolvedValue(updated);

      const result = await service.updateDisplayName(1, null);

      expect(mockUserRepo.updateDisplayName).toHaveBeenCalledWith(1, null);
      expect(result.displayName).toBeNull();
    });
  });

  describe('searchUsers', () => {
    it('should return search results', async () => {
      const results = [{ id: 2, username: 'bob', displayName: 'Bob' }];
      mockUserRepo.searchByUsername.mockResolvedValue(results);

      const result = await service.searchUsers('bo', 1);

      expect(result).toEqual([{ userId: 2, username: 'bob', displayName: 'Bob' }]);
      expect(mockUserRepo.searchByUsername).toHaveBeenCalledWith('bo', 1, 20, []);
    });
  });

  describe('deleteAccount (basic)', () => {
    beforeEach(() => {
      mockUserRepo.findById.mockResolvedValue(user);
      mockCredentialRepo.findCredentialByUserId.mockResolvedValue('hashed');
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockRoomRepo.findIdsByOwner.mockResolvedValue([]);
    });

    it('should verify password then call softDelete', async () => {
      await service.deleteAccount(1, 'basic', new Date(), 'correct-password');

      expect(mockCredentialRepo.findCredentialByUserId).toHaveBeenCalledWith(1, 'basic');
      expect(bcrypt.compare).toHaveBeenCalledWith('correct-password', 'hashed');
      expect(mockUserRepo.softDelete).toHaveBeenCalledWith(1, 'deleted_1', []);
    });

    it('should throw when password missing for basic auth', async () => {
      await expect(service.deleteAccount(1, 'basic', new Date())).rejects.toThrow();
    });

    it('should throw on wrong password', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.deleteAccount(1, 'basic', new Date(), 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when no credentials exist', async () => {
      mockCredentialRepo.findCredentialByUserId.mockResolvedValue(null);

      await expect(service.deleteAccount(1, 'basic', new Date(), 'any')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw NotFoundException when user not found', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(service.deleteAccount(999, 'basic', new Date(), 'any')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return owned room IDs for WS cleanup', async () => {
      mockRoomRepo.findIdsByOwner.mockResolvedValue([10, 20]);

      const result = await service.deleteAccount(1, 'basic', new Date(), 'correct-password');

      expect(result).toEqual({ ownedRoomIds: [10, 20] });
      expect(mockUserRepo.softDelete).toHaveBeenCalledWith(1, 'deleted_1', [10, 20]);
    });
  });

  describe('deleteAccount (oidc)', () => {
    beforeEach(() => {
      mockUserRepo.findById.mockResolvedValue(user);
      mockRoomRepo.findIdsByOwner.mockResolvedValue([]);
    });

    it('should delete when session is fresh (within 5 min)', async () => {
      const freshDate = new Date(Date.now() - 2 * 60 * 1000);
      const result = await service.deleteAccount(1, 'oidc', freshDate);

      expect(mockUserRepo.softDelete).toHaveBeenCalledWith(1, 'deleted_1', []);
      expect(result).toEqual({ ownedRoomIds: [] });
    });

    it('should throw ForbiddenException when session is stale', async () => {
      const staleDate = new Date(Date.now() - 10 * 60 * 1000);
      await expect(service.deleteAccount(1, 'oidc', staleDate)).rejects.toThrow(ForbiddenException);
    });

    it('should not require password for oidc', async () => {
      const freshDate = new Date(Date.now() - 1 * 60 * 1000);
      await service.deleteAccount(1, 'oidc', freshDate);
      expect(mockCredentialRepo.findCredentialByUserId).not.toHaveBeenCalled();
    });
  });

  describe('updateColorPreference', () => {
    it('should accept a valid palette hue and return profile with colorPreference', async () => {
      const updated = { ...user, preferredHue: 60 };
      mockUserRepo.updateColorPreference.mockResolvedValue(updated);

      const result = await service.updateColorPreference(1, 60);

      expect(result.colorPreference).toBe(60);
      expect(mockUserRepo.updateColorPreference).toHaveBeenCalledWith(1, 60);
    });

    it('should reject a non-palette hue with BadRequestException', async () => {
      await expect(service.updateColorPreference(1, 15)).rejects.toThrow(BadRequestException);
    });
  });

  describe('clearColorPreference', () => {
    it('should clear the preference and return profile with null colorPreference', async () => {
      const updated = { ...user, preferredHue: null };
      mockUserRepo.updateColorPreference.mockResolvedValue(updated);

      const result = await service.clearColorPreference(1);

      expect(result.colorPreference).toBeNull();
      expect(mockUserRepo.updateColorPreference).toHaveBeenCalledWith(1, null);
    });
  });

  describe('getProfile with color preference', () => {
    it('should return colorPreference from the user preferredHue field', async () => {
      mockUserRepo.findById.mockResolvedValue({ ...user, preferredHue: 200 });

      const result = await service.getProfile(1);

      expect(result?.colorPreference).toBe(200);
    });
  });
});
