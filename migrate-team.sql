-- Migration script to add status column to users table
-- Run this if you have an existing database without the status column

-- Add status column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'status') THEN
        ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive'));
    END IF;
END $$;

-- Update role constraints if they don't exist
DO $$ 
BEGIN
    -- Drop existing role column and recreate with constraint
    ALTER TABLE users DROP COLUMN IF EXISTS role;
    ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'sales' CHECK (role IN ('admin', 'sales', 'manager', 'developer'));
    
    -- Update existing admin user to have active status
    UPDATE users SET status = 'active' WHERE email = 'admin@crm.com';
    
EXCEPTION
    WHEN duplicate_column THEN
        -- Column already exists, do nothing
        NULL;
END $$; 