'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import { ArrowLeft, FileText } from 'lucide-react';
import { formatCents, formatDateTime } from '@/lib/utils';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

const statusBadge = (status: string) => {
  const colors: Record<string, string> = {
    paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    overdue: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
  };
  return colors[status] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400';
};

export default function InvoiceDetailPage() {
  const params = useParams();
  const { data: invoice, error, isLoading } = useSWR(`/billing/invoices/${params.id}`, fetcher);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin h-8 w-8 border-2 border-blue-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="text-center py-16">
        <FileText className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">Invoice not found</h3>
        <p className="text-sm text-slate-500 mb-4">This invoice does not exist or you don't have access to it.</p>
        <Link href="/dashboard/billing/invoices" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
          &larr; Back to invoices
        </Link>
      </div>
    );
  }

  const lineItems = invoice.lineItems ?? [];
  const subtotal = lineItems.reduce((s: number, i: any) => s + i.total, 0);

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/dashboard/billing/invoices"
          className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Invoice {invoice.id.slice(0, 8)}...</h1>
          <p className="text-sm text-slate-500">Created {formatDateTime(invoice.createdAt)}</p>
        </div>
        <span className={`ml-auto inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusBadge(invoice.status)}`}>
          {invoice.status}
        </span>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Line items</h2>
          {lineItems.length === 0 ? (
            <p className="text-slate-500 text-sm">No line items.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  <th className="pb-3 pr-4">Description</th>
                  <th className="pb-3 pr-4">Qty</th>
                  <th className="pb-3 pr-4">Unit price</th>
                  <th className="pb-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {lineItems.map((item: any, i: number) => (
                  <tr key={item.id || i}>
                    <td className="py-3 pr-4 text-sm text-slate-900 dark:text-white">{item.description}</td>
                    <td className="py-3 pr-4 text-sm text-slate-600 dark:text-slate-400">{item.quantity}</td>
                    <td className="py-3 pr-4 text-sm text-slate-600 dark:text-slate-400">{formatCents(item.unitPrice)}</td>
                    <td className="py-3 text-sm text-right font-medium text-slate-900 dark:text-white">{formatCents(item.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                  <td colSpan={3} className="pt-3 text-sm font-semibold text-slate-900 dark:text-white text-right pr-4">Total</td>
                  <td className="pt-3 text-sm font-bold text-slate-900 dark:text-white text-right">{formatCents(subtotal)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
            <h3 className="text-sm font-medium text-slate-500 mb-3">Details</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge(invoice.status)}`}>
                    {invoice.status}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Created</dt>
                <dd className="text-slate-900 dark:text-white">{formatDateTime(invoice.createdAt)}</dd>
              </div>
              {invoice.paidAt && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Paid</dt>
                  <dd className="text-slate-900 dark:text-white">{formatDateTime(invoice.paidAt)}</dd>
                </div>
              )}
              {invoice.dueDate && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Due date</dt>
                  <dd className="text-slate-900 dark:text-white">{formatDateTime(invoice.dueDate)}</dd>
                </div>
              )}
            </dl>
          </div>

          {invoice.transaction && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
              <h3 className="text-sm font-medium text-slate-500 mb-3">Transaction</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">ID</dt>
                  <dd className="text-slate-900 dark:text-white font-mono text-xs">{invoice.transaction.id.slice(0, 12)}...</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Type</dt>
                  <dd className="text-slate-900 dark:text-white">{invoice.transaction.type}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Amount</dt>
                  <dd className="text-slate-900 dark:text-white">{formatCents(invoice.transaction.amount)}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
