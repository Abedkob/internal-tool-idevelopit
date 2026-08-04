import { InvoiceDetailsClient } from "@/components/billing/invoices/InvoiceDetailsClient";
export const metadata={title:"Invoice"};
export default async function InvoicePage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <InvoiceDetailsClient id={id}/>}
