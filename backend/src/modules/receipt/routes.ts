import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { verifyAccessToken } from '../../lib/tokens.js';
import type { ReceiptService } from './service.js';

const reviewSchema = z.object({
  merchantName: z.string().optional(),
  receiptDate: z.string().optional(),
  items: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string().min(1, 'Nama item tidak boleh kosong'),
      qty: z.coerce.number().int().min(1),
      unitPrice: z.coerce.number().int().min(0),
      totalPrice: z.coerce.number().int().min(0),
      assignedTags: z
        .array(
          z.object({
            participantId: z.string(),
            shareRatio: z.number().min(0),
          }),
        )
        .optional(),
    }),
  ),
  adjustment: z.object({
    tax: z.coerce.number().int().default(0),
    serviceCharge: z.coerce.number().int().default(0),
    discount: z.coerce.number().int().default(0),
    rounding: z.coerce.number().int().default(0),
    grandTotal: z.coerce.number().int(),
    overheadStrategy: z.enum(['EQUAL', 'PROPORTIONAL']).optional(),
  }),
});

export const receiptRoutesPlugin = (receiptService: ReceiptService): FastifyPluginAsync => {
  return async (app) => {
    // 1. Upload Struk Shot (Multipart Form)
    app.post('/upload-shot', async (req, reply) => {
      const data = await req.file();
      if (!data) {
        throw new AppError(400, 'NO_FILE_UPLOADED', 'File foto struk harus dilampirkan.');
      }

      const buffer = await data.toBuffer();
      const fields = data.fields as Record<string, { value?: string }>;

      const shotIndexStr = fields.shotIndex?.value || '1';
      const shotIndex = parseInt(shotIndexStr, 10);
      const transactionId = fields.transactionId?.value || undefined;

      // Cek apakah ada otentikasi opsional
      let ownerId: string | undefined = undefined;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const claims = await verifyAccessToken(authHeader.slice(7).trim());
          ownerId = claims.sub;
        } catch {
          // ignore invalid token for optional auth
        }
      }

      const result = await receiptService.uploadShot({
        transactionId,
        ownerId,
        shotIndex,
        buffer,
        mimeType: data.mimetype,
      });

      return reply.status(201).send({
        status: 'success',
        data: result,
      });
    });

    // 2. Proses OCR via Gemini AI
    app.post('/:id/process-ocr', async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await receiptService.processOcr(id);
      return reply.send({
        status: 'success',
        data: result,
      });
    });

    // 3. Review & Koreksi Manual Struk
    app.put('/:id/review', async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = reviewSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Input tidak valid', parsed.error.errors);
      }

      const result = await receiptService.reviewReceipt(id, parsed.data);
      return reply.send({
        status: 'success',
        data: result,
      });
    });

    // 4. Get Transaksi Struk
    app.get('/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await receiptService.getTransaction(id);
      return reply.send({
        status: 'success',
        data: result,
      });
    });
  };
};
