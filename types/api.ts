import { UserResponse } from '@/lib/models/User';
import { EmployeeResponse } from '@/lib/models/Employee';
import { ProductResponse } from '@/lib/models/Product';
import { InvoiceResponse } from '@/lib/models/Invoice';
import { QuotationResponse } from '@/lib/models/Quotation';

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
    errors?: any;
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface InventoryStatusSummary {
    inStock: number;
    lowStock: number;
    outOfStock: number;
}

export interface InventoryPaginatedResponse extends PaginatedResponse<ProductResponse> {
    summary: InventoryStatusSummary;
}

export interface LoginResponse {
    user: UserResponse;
    token: string;
}

export interface DashboardStats {
    totalRevenue: string;
    totalInvoices: number;
    totalQuotations: number;
    totalInventoryItems: number;
    paidAmount: string;
    pendingAmount: string;
    overdueAmount: string;
    lowStockCount: number;
}

export interface Activity {
    id: string;
    type: 'invoice' | 'quotation' | 'inventory';
    action: string;
    description: string;
    timestamp: string; // ISO date string
    color: 'green' | 'blue' | 'orange' | 'red' | 'purple' | 'yellow';
    link?: string;
}

export type { InvoiceResponse, ProductResponse, EmployeeResponse, QuotationResponse };
