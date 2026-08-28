export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: number;
  creditBalance: number;
}

export interface AdminPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminUsersData {
  users: AdminUser[];
  pagination: AdminPagination;
}

export interface AdminTask {
  id: string;
  scene: string;
  provider: string;
  model: string;
  prompt: string;
  status: string;
  created_at: number;
  updated_at: number;
  cost_credits: number;
  error_code: string | null;
  duration: number;
  durationMs: number;
}

export interface AdminTasksData {
  tasks: AdminTask[];
  pagination?: AdminPagination;
}

export interface HealthCheckResult {
  status: "healthy" | "unhealthy";
  latencyMs: number;
  models: string[];
  endpoint: string;
  checkedAt?: number;
  error?: string;
}

export interface AdminCreditAdjustmentData {
  userId: string;
  creditBalance: number;
  balance: number;
  amount: number;
  reason: string;
}

export interface AdminApiResponse<T> {
  code: number;
  data: T;
}

export interface AdminApiErrorResponse {
  error: string;
}
