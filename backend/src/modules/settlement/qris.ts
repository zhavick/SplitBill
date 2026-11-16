import QRCode from 'qrcode';

/**
 * Menghitung Checksum CRC16-CCITT (0x1021) sesuai spesifikasi EMVCo QRIS
 */
export function calculateCrc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Format tag-length-value (TLV) helper
 */
function formatTlv(tag: string, value: string): string {
  const length = value.length.toString().padStart(2, '0');
  return `${tag}${length}${value}`;
}

export interface DynamicQrisParams {
  merchantName?: string;
  merchantCity?: string;
  amount: number;
  billNumber?: string;
}

/**
 * Menghasilkan string payload QRIS Dinamis standar EMVCo dengan nominal terkunci (Tag 54)
 */
export function generateDynamicQrisPayload(params: DynamicQrisParams): string {
  const cleanName = (params.merchantName || 'SPLITBILL RESTO')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .slice(0, 25);

  const cleanCity = (params.merchantCity || 'JAKARTA')
    .toUpperCase()
    .replace(/[^A-Z ]/g, '')
    .slice(0, 15);

  const roundedAmount = Math.max(1, Math.round(params.amount));
  const amountStr = roundedAmount.toString();

  // EMVCo Tags
  let payload = '';
  payload += formatTlv('00', '01'); // Payload Format Indicator
  payload += formatTlv('01', '12'); // 12 = Dynamic QR (Nominal terkunci)
  
  // Merchant Account Info (Contoh Dummy NNS QRIS Nasional)
  const mai26 = formatTlv('00', 'ID.CO.QRIS.WWW') + formatTlv('01', '936009990000000001');
  payload += formatTlv('26', mai26);

  payload += formatTlv('52', '5812'); // MCC: Eating Places & Restaurants
  payload += formatTlv('53', '360');  // Currency: 360 (IDR)
  payload += formatTlv('54', amountStr); // Transaction Amount (Nominal Terkunci)
  payload += formatTlv('58', 'ID');   // Country: ID
  payload += formatTlv('59', cleanName); // Merchant Name
  payload += formatTlv('60', cleanCity); // Merchant City
  payload += formatTlv('61', '12340');   // Postal Code

  // Additional Data Field (Tag 62)
  if (params.billNumber) {
    const addData = formatTlv('01', params.billNumber.slice(0, 25));
    payload += formatTlv('62', addData);
  }

  // Checksum Tag 63 (tanpa nilai checksum)
  const payloadForChecksum = payload + '6304';
  const checksum = calculateCrc16(payloadForChecksum);

  return `${payloadForChecksum}${checksum}`;
}

/**
 * Menghasilkan Data URL gambar QR Code PNG dari payload QRIS
 */
export async function generateDynamicQrisImage(params: DynamicQrisParams): Promise<{
  payload: string;
  qrCodeDataUrl: string;
  amount: number;
}> {
  const payload = generateDynamicQrisPayload(params);
  const qrCodeDataUrl = await QRCode.toDataURL(payload, {
    margin: 2,
    scale: 8,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });

  return {
    payload,
    qrCodeDataUrl,
    amount: Math.round(params.amount),
  };
}
