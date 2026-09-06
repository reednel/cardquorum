import { BadRequestException, NotFoundException } from '@nestjs/common';
import { type SheepsheadReportRepository } from '@cardquorum/sheepshead/reporting';
import { ReportService } from './report.service';

describe('ReportService', () => {
  let service: ReportService;
  let mockSheepsheadRepo: jest.Mocked<
    Pick<SheepsheadReportRepository, 'computeReport' | 'getAvailableReports'>
  >;

  beforeEach(() => {
    mockSheepsheadRepo = {
      computeReport: jest.fn().mockResolvedValue({ totalSessions: 5 }),
      getAvailableReports: jest
        .fn()
        .mockReturnValue([{ key: 'default', label: 'Sheepshead Report', description: 'desc' }]),
    };

    service = new ReportService(mockSheepsheadRepo as unknown as SheepsheadReportRepository);
  });

  describe('repository resolution', () => {
    it('should delegate to the sheepshead repository for known game type', async () => {
      const filters = {
        variants: ['called-ace-5p'],
        startDate: '2024-01-01',
        endDate: '2024-06-30',
      };

      const result = await service.getReport('sheepshead', 42, filters);

      expect(mockSheepsheadRepo.computeReport).toHaveBeenCalledWith('default', 42, filters);
      expect(result).toEqual({ totalSessions: 5 });
    });

    it('should throw NotFoundException for unknown game type', async () => {
      await expect(service.getReport('chess', 1, {})).rejects.toThrow(NotFoundException);
      await expect(service.getReport('chess', 1, {})).rejects.toThrow(
        "Game type 'chess' not supported",
      );
    });
  });

  describe('date validation', () => {
    it('should throw BadRequestException for invalid startDate format', async () => {
      await expect(service.getReport('sheepshead', 1, { startDate: 'not-a-date' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for startDate with invalid month', async () => {
      await expect(service.getReport('sheepshead', 1, { startDate: '2024-13-01' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for startDate with invalid day', async () => {
      await expect(service.getReport('sheepshead', 1, { startDate: '2024-02-30' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid endDate format', async () => {
      await expect(service.getReport('sheepshead', 1, { endDate: 'xyz' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when startDate is after endDate', async () => {
      await expect(
        service.getReport('sheepshead', 1, { startDate: '2024-06-01', endDate: '2024-01-01' }),
      ).rejects.toThrow('startDate must not be after endDate');
    });

    it('should pass valid dates through without error', async () => {
      await expect(
        service.getReport('sheepshead', 1, { startDate: '2024-01-01', endDate: '2024-12-31' }),
      ).resolves.toBeDefined();

      expect(mockSheepsheadRepo.computeReport).toHaveBeenCalledWith('default', 1, {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });
    });

    it('should allow omitted dates (undefined) without error', async () => {
      await expect(service.getReport('sheepshead', 1, {})).resolves.toBeDefined();

      expect(mockSheepsheadRepo.computeReport).toHaveBeenCalledWith('default', 1, {});
    });

    it('should allow only startDate without endDate', async () => {
      await expect(
        service.getReport('sheepshead', 1, { startDate: '2024-03-15' }),
      ).resolves.toBeDefined();
    });

    it('should allow only endDate without startDate', async () => {
      await expect(
        service.getReport('sheepshead', 1, { endDate: '2024-09-30' }),
      ).resolves.toBeDefined();
    });
  });

  describe('parameter parsing', () => {
    it('should pass variants array through to the repository', async () => {
      await service.getReport('sheepshead', 1, { variants: ['called-ace-5p', 'jack-of-diamonds'] });

      expect(mockSheepsheadRepo.computeReport).toHaveBeenCalledWith('default', 1, {
        variants: ['called-ace-5p', 'jack-of-diamonds'],
      });
    });

    it('should pass undefined variants (all) through to the repository', async () => {
      await service.getReport('sheepshead', 1, {});

      expect(mockSheepsheadRepo.computeReport).toHaveBeenCalledWith('default', 1, {});
    });
  });
});
