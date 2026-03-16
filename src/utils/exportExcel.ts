import * as XLSX from 'xlsx';
import { Merchant } from '../types';

export function exportMerchantsToExcel(merchants: Merchant[]) {
  const data = merchants.map((m) => ({
    'Business Name': m.businessName || 'N/A',
    'Category': m.category || 'N/A',
    'Sub-Category': m.subCategory || 'N/A',
    'Platform': m.platform || 'N/A',
    'Website URL': m.website || m.url || 'N/A',
    'Instagram Handle': m.instagramHandle || 'N/A',
    'Email': m.email || 'N/A',
    'Phone': m.phone || 'N/A',
    'WhatsApp': m.whatsapp || 'N/A',
    'Fit Score': m.fitScore || 0,
    'Contact Score': m.contactScore || 0,
    'Confidence Score': m.confidenceScore || 0,
    'Contact Quality': m.contactConfidence?.overall || 'UNKNOWN',
    'Phone Confidence': m.contactConfidence?.phone || 'N/A',
    'WhatsApp Confidence': m.contactConfidence?.whatsapp || 'N/A',
    'Email Confidence': m.contactConfidence?.email || 'N/A',
    'Instagram Confidence': m.contactConfidence?.instagram || 'N/A',
    'Revenue Tier': m.revenueEstimate?.tier || 'N/A',
    'Est. Monthly Revenue (AED)': m.revenueEstimate?.monthlyRevenue || 0,
    'Setup Fee Min ($)': m.revenueEstimate?.setupFeeMin || 0,
    'Setup Fee Max ($)': m.revenueEstimate?.setupFeeMax || 0,
    'Transaction Rate': m.revenueEstimate?.transactionRate || 'N/A',
    'Detected Gateways': (m.detectedGateways || []).join(', ') || 'None',
    'Has Payment Gateway': m.hasPaymentGateway ? 'Yes' : 'No',
    'Discovery Sources': m.discoverySource || 'scraper',
    'Risk Category': m.risk?.category || 'N/A',
    'Status': m.status || 'N/A',
    'First Found Date': m.foundDate ? new Date(m.foundDate).toLocaleDateString('en-GB') : 'N/A',
    'Direct Profile Link': m.url || 'N/A'
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'MerchantLeads');

  const newLeads = merchants.filter(m => m.status !== 'DUPLICATE');
  const duplicates = merchants.filter(m => m.status === 'DUPLICATE');

  const platformBreakdown: Record<string, number> = {};
  const sourceBreakdown: Record<string, number> = {};
  for (const m of newLeads) {
    platformBreakdown[m.platform || 'unknown'] = (platformBreakdown[m.platform || 'unknown'] || 0) + 1;
    sourceBreakdown[m.discoverySource || 'scraper'] = (sourceBreakdown[m.discoverySource || 'scraper'] || 0) + 1;
  }

  const summaryData = [
    { Metric: 'Total New Leads', Value: newLeads.length },
    { Metric: 'Total Duplicates', Value: duplicates.length },
    { Metric: 'Export Date', Value: new Date().toLocaleDateString('en-GB') },
    { Metric: '', Value: '' },
    { Metric: '--- Platform Breakdown ---', Value: '' },
    ...Object.entries(platformBreakdown).map(([k, v]) => ({ Metric: k, Value: v })),
    { Metric: '', Value: '' },
    { Metric: '--- AI Source Breakdown ---', Value: '' },
    ...Object.entries(sourceBreakdown).map(([k, v]) => ({ Metric: k, Value: v })),
  ];

  const summaryWs = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  const colWidths = Object.keys(data[0] || {}).map(key => ({ wch: Math.max(key.length, 15) }));
  ws['!cols'] = colWidths;

  XLSX.writeFile(wb, `MyFatoorah_Leads_${new Date().toISOString().split('T')[0]}.xlsx`);
}
