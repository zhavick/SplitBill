import { FastifyPluginAsync } from 'fastify';
import { AdminService } from './service.js';
import { AppError } from '../../lib/errors.js';

export function adminRoutesPlugin(service: AdminService): FastifyPluginAsync {
  return async (app) => {
    // 1. Metrik Eksekutif
    app.get('/api/v1/admin/metrics/executive', async () => {
      const data = await service.getExecutiveMetrics();
      return { status: 'success', data };
    });

    // 2. Metrik Performa AI OCR
    app.get('/api/v1/admin/metrics/ai-performance', async () => {
      const data = await service.getAiPerformanceMetrics();
      return { status: 'success', data };
    });

    // 3. Konfigurasi Integrasi Pihak Ketiga
    app.get('/api/v1/admin/integrations', async () => {
      const data = await service.getIntegrationConfigs();
      return { status: 'success', data };
    });

    app.put<{ Params: { key: string }; Body: { configData: any } }>(
      '/api/v1/admin/integrations/:key',
      async (request) => {
        const result = await service.saveIntegrationConfig(
          request.params.key,
          request.body.configData
        );
        return { status: 'success', data: result };
      }
    );

    // 4. Uji Pengiriman OTP / Test Delivery
    app.post<{
      Body: { channel: 'EMAIL' | 'WHATSAPP'; destination: string };
    }>('/api/v1/admin/integrations/test-delivery', async (request) => {
      const { channel, destination } = request.body;
      if (!channel || !destination) {
        throw new AppError(400, 'INVALID_PAYLOAD', 'Channel dan alamat tujuan wajib diisi');
      }

      const result = await service.testIntegrationDelivery({ channel, destination });
      return { status: 'success', data: result };
    });

    // 5. Manajemen Pengguna & Kuota
    app.get<{ Querystring: { page?: string; limit?: string } }>(
      '/api/v1/admin/users',
      async (request) => {
        const page = parseInt(request.query.page || '1', 10);
        const limit = parseInt(request.query.limit || '20', 10);
        const data = await service.listUsers(page, limit);
        return { status: 'success', data };
      }
    );

    app.patch<{ Params: { id: string }; Body: { ocrQuota: number } }>(
      '/api/v1/admin/users/:id/quota',
      async (request) => {
        const quota = request.body.ocrQuota;
        if (typeof quota !== 'number' || quota < 0) {
          throw new AppError(400, 'INVALID_QUOTA', 'Kuota OCR harus angka positif');
        }

        const user = await service.updateUserQuota(request.params.id, quota);
        return { status: 'success', data: user };
      }
    );

    // 6. Maintenance & Kebijakan Retensi Data
    app.post<{ Body: { retentionDays?: number } }>(
      '/api/v1/admin/maintenance/cleanup',
      async (request) => {
        const days = request.body?.retentionDays || 30;
        const result = await service.cleanupRetentionData(days);
        return { status: 'success', data: result };
      }
    );
  };
}
