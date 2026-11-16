import PDFDocument from 'pdfkit';

export interface ReimbursementReportData {
  documentNumber: string;
  applicantName: string;
  applicantEmail?: string;
  department?: string;
  merchantName: string;
  merchantAddress?: string;
  transactionDate: string;
  items: Array<{
    itemName: string;
    quantity: number;
    itemPrice: number;
    totalPrice: number;
  }>;
  taxAmount: number;
  serviceCharge: number;
  discountAmount: number;
  roundingAmount: number;
  finalTotal: number;
}

function formatRupiahPdf(val: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

/**
 * Menghasilkan berkas PDF formal untuk klaim reimbursement kantor
 */
export async function generateReimbursementPdf(data: ReimbursementReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        info: {
          Title: `Laporan Reimbursement - ${data.documentNumber}`,
          Author: 'SplitBill Expense System',
        },
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // 1. Header / Kop Surat
      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .fillColor('#1e3a8a')
        .text('LAPORAN KLAIM REIMBURSEMENT KANTOR', { align: 'center' });

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#64748b')
        .text('EXPENSE CLAIM & BUSINESS REIMBURSEMENT FORM', { align: 'center' });

      doc.moveDown(1);
      doc
        .strokeColor('#cbd5e1')
        .lineWidth(1.5)
        .moveTo(50, doc.y)
        .lineTo(545, doc.y)
        .stroke();

      doc.moveDown(1);

      // 2. Metadata Section (2 Kolom)
      const startMetaY = doc.y;

      // Kolom Kiri
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor('#334155')
        .text('DATA PEMOHON (CLAIMANT):', 50, startMetaY);

      doc
        .font('Helvetica')
        .fillColor('#0f172a')
        .text(`Nama Lengkap   : ${data.applicantName}`, 50, startMetaY + 16)
        .text(`Email           : ${data.applicantEmail || 'karyawan@perusahaan.com'}`, 50, startMetaY + 28)
        .text(`Departemen / Div: ${data.department || 'Operasional / Umum'}`, 50, startMetaY + 40);

      // Kolom Kanan
      doc
        .font('Helvetica-Bold')
        .fillColor('#334155')
        .text('DETAIL TRANSAKSI:', 320, startMetaY);

      doc
        .font('Helvetica')
        .fillColor('#0f172a')
        .text(`No. Referensi   : ${data.documentNumber}`, 320, startMetaY + 16)
        .text(`Tanggal Struk   : ${data.transactionDate.slice(0, 10)}`, 320, startMetaY + 28)
        .text(`Merchant / Toko : ${data.merchantName}`, 320, startMetaY + 40);

      doc.y = startMetaY + 65;
      doc.moveDown(0.5);

      // 3. Tabel Rincian Menu / Pengeluaran
      const tableTop = doc.y;
      doc
        .rect(50, tableTop, 495, 20)
        .fill('#f1f5f9');

      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor('#1e293b')
        .text('NO', 55, tableTop + 5, { width: 25, align: 'center' })
        .text('DESKRIPSI MENU / BARANG', 85, tableTop + 5, { width: 220 })
        .text('QTY', 310, tableTop + 5, { width: 40, align: 'center' })
        .text('HARGA SATUAN', 355, tableTop + 5, { width: 85, align: 'right' })
        .text('TOTAL', 445, tableTop + 5, { width: 95, align: 'right' });

      let currentY = tableTop + 24;
      doc.font('Helvetica').fontSize(9).fillColor('#1e293b');

      data.items.forEach((it, index) => {
        // Zebra striping
        if (index % 2 === 1) {
          doc.rect(50, currentY - 2, 495, 18).fill('#f8fafc');
        }

        doc
          .fillColor('#1e293b')
          .text((index + 1).toString(), 55, currentY, { width: 25, align: 'center' })
          .text(it.itemName, 85, currentY, { width: 220 })
          .text(it.quantity.toString(), 310, currentY, { width: 40, align: 'center' })
          .text(formatRupiahPdf(it.itemPrice), 355, currentY, { width: 85, align: 'right' })
          .text(formatRupiahPdf(it.totalPrice), 445, currentY, { width: 95, align: 'right' });

        currentY += 18;
      });

      // Garis penutup tabel
      doc.moveTo(50, currentY).lineTo(545, currentY).strokeColor('#cbd5e1').stroke();
      currentY += 8;

      // 4. Financial Summary Breakdown (Sebelah Kanan)
      const subtotal = data.items.reduce((acc, it) => acc + it.totalPrice, 0);

      doc.fontSize(9);
      doc.text('Subtotal Menu:', 320, currentY, { width: 120, align: 'right' });
      doc.text(formatRupiahPdf(subtotal), 445, currentY, { width: 95, align: 'right' });
      currentY += 14;

      if (data.taxAmount > 0) {
        doc.text('Pajak Restoran (PB1 / PPN):', 300, currentY, { width: 140, align: 'right' });
        doc.text(formatRupiahPdf(data.taxAmount), 445, currentY, { width: 95, align: 'right' });
        currentY += 14;
      }

      if (data.serviceCharge > 0) {
        doc.text('Service Charge:', 320, currentY, { width: 120, align: 'right' });
        doc.text(formatRupiahPdf(data.serviceCharge), 445, currentY, { width: 95, align: 'right' });
        currentY += 14;
      }

      if (data.discountAmount > 0) {
        doc.text('Potongan Diskon Promo (-):', 300, currentY, { width: 140, align: 'right' });
        doc.text(`-${formatRupiahPdf(data.discountAmount)}`, 445, currentY, { width: 95, align: 'right' });
        currentY += 14;
      }

      // Grand Total Highlight Box
      doc.rect(300, currentY, 245, 24).fill('#1e3a8a');
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#ffffff')
        .text('TOTAL REIMBURSEMENT:', 305, currentY + 7, { width: 135 })
        .text(formatRupiahPdf(data.finalTotal || subtotal), 440, currentY + 7, { width: 100, align: 'right' });

      currentY += 45;

      // 5. Signature Authorization Box (3 Kolom Tanda Tangan)
      const sigTop = Math.max(currentY, 650);

      doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');

      // Box 1: Pemohon
      doc.text('DIAJUKAN OLEH,', 60, sigTop, { width: 130, align: 'center' });
      doc.rect(60, sigTop + 14, 130, 48).strokeColor('#cbd5e1').stroke();
      doc.text(`( ${data.applicantName} )`, 60, sigTop + 68, { width: 130, align: 'center' });
      doc.font('Helvetica').text('Karyawan / Pemohon', 60, sigTop + 78, { width: 130, align: 'center' });

      // Box 2: Atasan Langsung
      doc.font('Helvetica-Bold');
      doc.text('DIPERIKSA OLEH,', 215, sigTop, { width: 130, align: 'center' });
      doc.rect(215, sigTop + 14, 130, 48).strokeColor('#cbd5e1').stroke();
      doc.text('( ................................. )', 215, sigTop + 68, { width: 130, align: 'center' });
      doc.font('Helvetica').text('Manager / Atasan Langsung', 215, sigTop + 78, { width: 130, align: 'center' });

      // Box 3: Finance & Accounting
      doc.font('Helvetica-Bold');
      doc.text('DISETUJUI OLEH,', 370, sigTop, { width: 130, align: 'center' });
      doc.rect(370, sigTop + 14, 130, 48).strokeColor('#cbd5e1').stroke();
      doc.text('( ................................. )', 370, sigTop + 68, { width: 130, align: 'center' });
      doc.font('Helvetica').text('Finance & Treasury Dept.', 370, sigTop + 78, { width: 130, align: 'center' });

      // Footer Catatan Hukum
      doc
        .fontSize(7)
        .font('Helvetica')
        .fillColor('#94a3b8')
        .text(
          `Dokumen ini dihasilkan secara otomatis oleh SplitBill Enterprise pada ${new Date().toLocaleString('id-ID')} dan sah untuk keperluan internal audit perusahaan.`,
          50,
          770,
          { align: 'center', width: 495 }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
