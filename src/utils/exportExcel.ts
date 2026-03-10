import * as XLSX from 'xlsx';
import { Merchant } from '../types';

export function exportMerchantsToExcel(merchants: Merchant[]) {
  const data = merchants.map((m) => ({
    'Business Name': m.businessName,
    'Category': m.category || 'N/A',
    'Sub-Category': m.subCategory || 'N/A',
    'Website URL': m.website || 'N/A',
    'Instagram Handle': m.instagramHandle || 'N/A',
    'Email': m.email || 'N/A',
    'Phone': m.phone || 'N/A',
    'WhatsApp': m.whatsapp || 'N/A',
    'Followers': m.followers,
    'Fit Score': m.fitScore || 0,
    'Contact Score': m.contactScore || 0,
    'Confidence Score': m.confidenceScore || 0,
    'Risk Category': m.risk?.category || 'N/A',
    'Setup Fee Min (AED)': m.pricing?.setupFee || 0,
    'Setup Fee Max (AED)': (m.pricing?.setupFee || 0) + 1000,
    'Transaction Rate (%)': m.pricing?.transactionRate || 'N/A',
    'Settlement Cycle': m.pricing?.settlementCycle || 'N/A',
    'Payment Methods Detected': (m.paymentMethods || []).join(', '),
    'Contact Validation Status': m.contactValidation?.status || 'N/A',
    'Data Sources': (m.contactValidation?.sources || []).join(', '),
    'First Found Date': m.foundDate ? new Date(m.foundDate).toLocaleDateString('en-GB') : 'N/A',
    'Direct Profile Link': m.url
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'SmileyWizardLeads');

  // Auto-size columns
  const colWidths = Object.keys(data[0] || {}).map(key => ({ wch: Math.max(key.length, 15) }));
  ws['!cols'] = colWidths;

  // Header styling is limited in standard xlsx, but we can bold it conceptually
  // In real production we might use exceljs for better styling

  XLSX.writeFile(wb, `SmileyWizard_Leads_${new Date().toISOString().split('T')[0]}.xlsx`);
}
