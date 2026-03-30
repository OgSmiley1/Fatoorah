import * as XLSX from 'xlsx';
import { Merchant } from '../types';

export function exportMerchantsToExcel(merchants: Merchant[]) {
  const data = merchants.map((m) => ({
    'Lead ID': m.leadId || 'N/A',
    'Business Name': m.businessName,
    'Category': m.category || 'N/A',
    'Sub-Category': m.subCategory || 'N/A',
    'Website URL': m.website || 'N/A',
    'Instagram Handle': m.instagramHandle || 'N/A',
    'Email': m.email || 'N/A',
    'Phone': m.phone || 'N/A',
    'WhatsApp': m.whatsapp || 'N/A',
    'Followers': m.followers ?? 'Unknown',
    'Quality Score': m.qualityScore ?? 0,
    'Reliability Score': m.reliabilityScore ?? 0,
    'Compliance Score': m.complianceScore ?? 0,
    'Fit Score': m.fitScore ?? 0,
    'Contact Score': m.contactScore ?? 0,
    'Confidence Score': m.confidenceScore ?? 0,
    'Risk Category': m.risk?.category || 'N/A',
    'Risk Factors': (m.risk?.factors || []).join(', '),
    'Payment Gateway': m.paymentGateway || 'None detected',
    'Est. Monthly Revenue (AED)': m.revenue?.monthly ?? 'Unknown',
    'Revenue Basis': m.revenue?.basis || 'N/A',
    'Setup Fee (AED)': m.pricing?.setupFee ?? 'N/A',
    'Transaction Rate (%)': m.pricing?.transactionRate || 'N/A',
    'Settlement Cycle': m.pricing?.settlementCycle || 'N/A',
    'Offer Reason': m.pricing?.offerReason || 'N/A',
    'Contact Validation Status': m.contactValidation?.status || 'N/A',
    'DUL Number': m.dulNumber || 'N/A',
    'Direct Profile Link': m.url
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'MyFatoorahLeads');

  const colWidths = Object.keys(data[0] || {}).map(key => ({ wch: Math.max(key.length, 15) }));
  ws['!cols'] = colWidths;

  XLSX.writeFile(wb, `MyFatoorah_Leads_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export function exportVendorShortlist(merchants: Merchant[]) {
  const data = merchants.filter(m => (m.qualityScore || 0) > 70).map((m) => ({
    'VENDOR NAME': m.businessName.toUpperCase(),
    'EVALUATION SCORE': `${m.qualityScore}%`,
    'RELIABILITY': `${m.reliabilityScore}%`,
    'COMPLIANCE': `${m.complianceScore}%`,
    'RISK LEVEL': m.risk?.category || 'LOW',
    'EST. REVENUE': `AED ${m.revenue?.monthly?.toLocaleString()}`,
    'CONTACT': m.phone || m.email || 'N/A',
    'PLATFORM': m.platform.toUpperCase(),
    'DUL NUMBER': m.dulNumber || 'NOT VERIFIED'
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'VendorShortlist');

  const colWidths = Object.keys(data[0] || {}).map(key => ({ wch: Math.max(key.length, 20) }));
  ws['!cols'] = colWidths;

  XLSX.writeFile(wb, `Vendor_Shortlist_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
}
