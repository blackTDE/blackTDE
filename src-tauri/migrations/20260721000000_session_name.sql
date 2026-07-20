-- Migration: Add name column to sessions table for customizable session labels
ALTER TABLE sessions ADD COLUMN name TEXT;
