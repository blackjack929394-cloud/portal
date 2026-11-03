-- Add blocked flag to SSO employees table.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_emp_blocked ON employees(blocked);
