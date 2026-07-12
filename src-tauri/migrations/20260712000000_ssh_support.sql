-- Add ssh_host to sessions table for SSH session tracking
ALTER TABLE sessions ADD COLUMN ssh_host TEXT;
