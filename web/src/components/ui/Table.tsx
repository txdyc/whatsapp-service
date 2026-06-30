import { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export function Table(props: TableHTMLAttributes<HTMLTableElement>) {
  return <table className="w-full text-left text-sm" {...props} />;
}
export function Thead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="border-b border-gray-200 text-xs uppercase text-gray-500" {...props} />;
}
export function Th({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('px-3 py-2 font-medium', className)} {...props} />;
}
export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2', className)} {...props} />;
}
export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b border-gray-100 hover:bg-gray-50', className)} {...props} />;
}
