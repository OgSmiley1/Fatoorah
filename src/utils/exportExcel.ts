import * as XLSX from 'xlsx';

export function exportMerchantsToExcel(merchants: any[]) {
  const data = merchants.map((m) => ({
    'Business Name': m.businessName || m.business_name || '',
    'Category': m.category || 'N/A',
    'Sub-Category': m.subCategory || m.sub_category || 'N/A',
    'Website URL': m.website || 'N/A',
    'Instagram Handle': m.instagramHandle || m.instagram_handle || 'N/A',
    'Email': m.email || 'N/A',
    'Phone': m.phone || 'N/A',
    'WhatsApp': m.whatsapp || 'N/A',
    'Followers': m.followers || 0,
    'Risk Category': m.risk?.category ?? m.risk_category ?? 'N/A',
    'Fit Score': m.fit_score || 0,
    'Contact Score': m.contact_score || 0,
    'Setup Fee (AED)': m.pricing?.setupFee ?? m.setup_fee ?? 0,
    'Transaction Rate': m.pricing?.transactionRate ?? m.transaction_rate ?? '',
    'Settlement Cycle': m.pricing?.settlementCycle ?? m.settlement_cycle ?? '',
    'Payment Methods': (() => {
      const methods = m.paymentMethods || m.payment_methods;
      if (Array.isArray(methods)) return methods.join(', ');
      try { return JSON.parse(methods || '[]').join(', '); } catch { return ''; }
    })(),
    'Est. Monthly Loss (AED)': m.leakage?.estimatedMonthlyLoss ?? m.leakage_monthly_loss ?? 0,
    'Contact Route': m.contact_best_route || 'N/A',
    'First Found': m.foundDate || m.first_found_date || '',
    'Direct Profile Link': m.url || ''
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'MerchantLeads');

  const colWidths = Object.keys(data[0] || {}).map(key => ({ wch: Math.max(key.length, 15) }));
  ws['!cols'] = colWidths;

  XLSX.writeFile(wb, `Merchant_Leads_${new Date().toISOString().split('T')[0]}.xlsx`);
}
