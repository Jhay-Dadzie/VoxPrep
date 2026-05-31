/**
 * User Controller Tests
 */

import userController from '../users/user.controller.js';
import userService from '../users/user.service.js';
import userMapper from '../users/user.mapper.js';

jest.mock('../users/user.service.js');
jest.mock('../users/user.mapper.js');

describe('User Controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      user: {
        id: '123e4567-e89b-12d3-a456-426614174000',
      },
      token: 'mock-token',
      body: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn(),
    };

    jest.clearAllMocks();
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const profile = {
        id: req.user.id,
        email: 'test@example.com',
      };

      const mappedProfile = {
        id: req.user.id,
        email: 'test@example.com',
      };

      userService.getProfile.mockResolvedValue(profile);
      userMapper.toProfile.mockReturnValue(mappedProfile);

      await userController.getProfile(req, res);

      expect(userService.getProfile).toHaveBeenCalledWith(
        req.user.id,
        req.token
      );

      expect(userMapper.toProfile).toHaveBeenCalledWith(profile);

      expect(res.status).toHaveBeenCalledWith(200);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Profile retrieved successfully',
        data: mappedProfile,
      });
    });

    it('should return 404 when profile not found', async () => {
      userService.getProfile.mockRejectedValue(
        new Error('User profile not found')
      );

      await userController.getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('updateProfile', () => {
    it('should update profile successfully', async () => {
      req.body = {
        full_name: 'John Doe',
      };

      const updatedUser = {
        id: req.user.id,
        full_name: 'John Doe',
      };

      userService.updateProfile.mockResolvedValue(updatedUser);

      userMapper.toProfile.mockReturnValue(updatedUser);

      await userController.updateProfile(req, res);

      expect(userService.updateProfile).toHaveBeenCalled();

      expect(res.status).toHaveBeenCalledWith(200);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Profile updated successfully',
        data: updatedUser,
      });
    });

    it('should reject invalid payload', async () => {
      req.body = {};

      await userController.updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('updateStatus', () => {
    it('should activate account', async () => {
      req.body = {
        is_active: true,
      };

      const serviceResponse = {
        id: req.user.id,
        is_active: true,
      };

      userService.setActiveStatus.mockResolvedValue(serviceResponse);

      userMapper.toStatusView.mockReturnValue(serviceResponse);

      await userController.updateStatus(req, res);

      expect(userService.setActiveStatus).toHaveBeenCalledWith(
        req.user.id,
        req.token,
        true
      );

      expect(res.status).toHaveBeenCalledWith(200);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Account activated successfully',
        data: serviceResponse,
      });
    });

    it('should deactivate account', async () => {
      req.body = {
        is_active: false,
      };

      const serviceResponse = {
        id: req.user.id,
        is_active: false,
      };

      userService.setActiveStatus.mockResolvedValue(serviceResponse);

      userMapper.toStatusView.mockReturnValue(serviceResponse);

      await userController.updateStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(200);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Account deactivated successfully',
        data: serviceResponse,
      });
    });

    it('should reject invalid status payload', async () => {
      req.body = {};

      await userController.updateStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('completeProfile', () => {
    it('should mark profile as complete', async () => {
      const serviceResponse = {
        id: req.user.id,
        profile_completed: true,
      };

      userService.markProfileComplete.mockResolvedValue(serviceResponse);

      userMapper.toCompletionView.mockReturnValue(serviceResponse);

      await userController.completeProfile(req, res);

      expect(userService.markProfileComplete).toHaveBeenCalledWith(
        req.user.id,
        req.token
      );

      expect(res.status).toHaveBeenCalledWith(200);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Profile marked as complete',
        data: serviceResponse,
      });
    });

    it('should reject unexpected fields', async () => {
      req.body = {
        test: true,
      };

      await userController.completeProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('deleteAccount', () => {
    it('should delete account successfully', async () => {
      userService.deleteAccount.mockResolvedValue({
        deleted: true,
      });

      await userController.deleteAccount(req, res);

      expect(userService.deleteAccount).toHaveBeenCalledWith(
        req.user.id,
        req.token
      );

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should return 501 when secret key is missing', async () => {
      userService.deleteAccount.mockRejectedValue(
        new Error('SUPABASE_SECRET_KEY missing')
      );

      await userController.deleteAccount(req, res);

      expect(res.status).toHaveBeenCalledWith(501);

      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Account deletion is not available in this environment',
      });
    });
  });
});