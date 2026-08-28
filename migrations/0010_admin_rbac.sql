-- Migration 0010: Admin RBAC (Ticket #22, ADR 0007, Spec 0001)
-- Add role column to user table, defaulting to 'user'.
ALTER TABLE user ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
