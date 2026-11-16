export interface ParticipantRef {
  id: string;
  name: string;
}

export interface TripExpense {
  id: string;
  description: string;
  totalAmount: number;
  paidBy: ParticipantRef;
  splitAmong: Array<{
    participant: ParticipantRef;
    shareAmount: number;
  }>;
}

export interface SimplifiedTransfer {
  from: ParticipantRef;
  to: ParticipantRef;
  amount: number;
}

export interface DebtSimplificationResult {
  totalGroupSpending: number;
  netBalances: Array<{
    participant: ParticipantRef;
    balance: number; // Positif: Kreditur (menerima), Negatif: Debitur (membayar)
  }>;
  transfers: SimplifiedTransfer[];
  originalTransactionCount: number;
  optimizedTransactionCount: number;
}

/**
 * Algoritma Penyederhanaan Utang Silang (Debt Simplification)
 * Menggunakan Greedy Matching pada Net Balance untuk meminimalkan jumlah transaksi transfer.
 */
export function simplifyTripDebts(expenses: TripExpense[]): DebtSimplificationResult {
  const balanceMap = new Map<string, { participant: ParticipantRef; net: number }>();

  let totalGroupSpending = 0;

  for (const exp of expenses) {
    totalGroupSpending += exp.totalAmount;

    // Kreditkan ke pembayar
    const payerId = exp.paidBy.id;
    if (!balanceMap.has(payerId)) {
      balanceMap.set(payerId, { participant: exp.paidBy, net: 0 });
    }
    balanceMap.get(payerId)!.net += exp.totalAmount;

    // Debetkan dari yang mengonsumsi
    for (const split of exp.splitAmong) {
      const partId = split.participant.id;
      if (!balanceMap.has(partId)) {
        balanceMap.set(partId, { participant: split.participant, net: 0 });
      }
      balanceMap.get(partId)!.net -= split.shareAmount;
    }
  }

  // Pisahkan Kreditur (net > 0) dan Debitur (net < 0)
  const creditors: Array<{ participant: ParticipantRef; amount: number }> = [];
  const debtors: Array<{ participant: ParticipantRef; amount: number }> = [];

  const netBalances = Array.from(balanceMap.values()).map((entry) => {
    const roundedNet = Math.round(entry.net);
    if (roundedNet > 0) {
      creditors.push({ participant: entry.participant, amount: roundedNet });
    } else if (roundedNet < 0) {
      debtors.push({ participant: entry.participant, amount: -roundedNet });
    }
    return {
      participant: entry.participant,
      balance: roundedNet,
    };
  });

  // Urutkan menurun berdasarkan nominal terbesar untuk matching optimal
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transfers: SimplifiedTransfer[] = [];

  let cIdx = 0;
  let dIdx = 0;

  while (cIdx < creditors.length && dIdx < debtors.length) {
    const creditor = creditors[cIdx];
    const debtor = debtors[dIdx];

    const settleAmount = Math.min(creditor.amount, debtor.amount);
    if (settleAmount > 0) {
      transfers.push({
        from: debtor.participant,
        to: creditor.participant,
        amount: settleAmount,
      });

      creditor.amount -= settleAmount;
      debtor.amount -= settleAmount;
    }

    if (creditor.amount === 0) {
      cIdx++;
    }
    if (debtor.amount === 0) {
      dIdx++;
    }
  }

  return {
    totalGroupSpending,
    netBalances,
    transfers,
    originalTransactionCount: expenses.reduce((acc, e) => acc + e.splitAmong.length, 0),
    optimizedTransactionCount: transfers.length,
  };
}
