export function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCurrencyDetailed(amount) {
  if (amount === null || amount === undefined) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const CATEGORIES = [
  'PF',
  'PPF',
  'Mutual Fund',
  'Stocks/Share',
  'NPS',
  'LIC',
  'Fixed Deposit',
  'Recurring Deposit',
  'Gold',
  'Real Estate',
  'Insurance',
  'Savings Account',
  'Bonds',
  'Crypto',
  'Personal Loan (Debt)',
  'Others'
];

export function getMonthName(month) {
  return MONTHS[month - 1] || '';
}

export function getCurrentMonth() {
  return new Date().getMonth() + 1;
}

export function getCurrentYear() {
  return new Date().getFullYear();
}
