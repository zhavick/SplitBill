import { FastifyPluginAsync } from 'fastify';
import { TableSessionService } from './service.js';
import { subscribeToTableEvents } from './redis-pubsub.js';

export const tableSessionRoutes: FastifyPluginAsync = async (app) => {
  // 1. POST /api/v1/receipts/:id/live-session (Buka sesi meja & generate QR Code)
  app.post<{ Params: { id: string }; Body: { hostName?: string } }>(
    '/api/v1/receipts/:id/live-session',
    async (request, reply) => {
      const res = await TableSessionService.createLiveSession({
        transactionId: request.params.id,
        hostName: request.body?.hostName,
        userId: (request as any).user?.id,
      });
      return reply.code(201).send({ status: 'success', data: res });
    }
  );

  // 2. GET /api/v1/table-session/:code (Detail sesi publik meja untuk tamu)
  app.get<{ Params: { code: string } }>(
    '/api/v1/table-session/:code',
    async (request, reply) => {
      const state = await TableSessionService.getLiveSession(request.params.code);
      return reply.send({ status: 'success', data: state });
    }
  );

  // 3. POST /api/v1/table-session/:code/join (Tamu bergabung memasukkan nama)
  app.post<{ Params: { code: string }; Body: { fullName: string } }>(
    '/api/v1/table-session/:code/join',
    async (request, reply) => {
      const res = await TableSessionService.joinParticipant(
        request.params.code,
        request.body.fullName
      );
      return reply.send({ status: 'success', data: res });
    }
  );

  // 4. POST /api/v1/table-session/:code/toggle-item (Tamu/Host mencentang item)
  app.post<{ Params: { code: string }; Body: { participantId: string; itemId: string } }>(
    '/api/v1/table-session/:code/toggle-item',
    async (request, reply) => {
      const state = await TableSessionService.toggleItemAssignment(
        request.params.code,
        request.body.participantId,
        request.body.itemId
      );
      return reply.send({ status: 'success', data: state });
    }
  );

  // 5. WebSocket Route: /ws/table/:code
  app.get<{ Params: { code: string } }>(
    '/ws/table/:code',
    { websocket: true },
    async (socket, request) => {
      const tableCode = request.params.code.trim().toUpperCase();

      // Subscribe ke Redis Pub/Sub untuk tableCode ini
      const unsubscribe = await subscribeToTableEvents(tableCode, (event) => {
        if (socket.readyState === 1) { // 1 = OPEN
          socket.send(JSON.stringify(event));
        }
      });

      // Kirim snapshot state awal seketika setelah koneksi terbentuk
      try {
        const state = await TableSessionService.getLiveSession(tableCode);
        socket.send(
          JSON.stringify({
            type: 'table:state-update',
            tableCode,
            data: state,
            timestamp: new Date().toISOString(),
          })
        );
      } catch (err) {
        console.error('Failed to send initial table state via websocket:', err);
      }

      // Terima pesan event dua arah dari klien
      socket.on('message', async (rawMessage: any) => {
        try {
          const payload = JSON.parse(rawMessage.toString());
          if (payload.type === 'table:join' && payload.fullName) {
            await TableSessionService.joinParticipant(tableCode, payload.fullName);
          } else if (payload.type === 'table:item-toggle' && payload.participantId && payload.itemId) {
            await TableSessionService.toggleItemAssignment(
              tableCode,
              payload.participantId,
              payload.itemId
            );
          }
        } catch (err: any) {
          console.error('Error handling websocket message:', err);
          if (socket.readyState === 1) {
            socket.send(
              JSON.stringify({
                type: 'error',
                message: err.message || 'Gagal memproses pesan websocket',
              })
            );
          }
        }
      });

      socket.on('close', () => {
        unsubscribe();
      });

      socket.on('error', () => {
        unsubscribe();
      });
    }
  );
};
