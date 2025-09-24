-- Supabase setup for Khadi's Classroom
-- Run this in Supabase SQL Editor

-- Create app_users table (to avoid conflict with auth.users)
CREATE TABLE IF NOT EXISTS app_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create students table
CREATE TABLE IF NOT EXISTS students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  rewards INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create history table
CREATE TABLE IF NOT EXISTS history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  t BIGINT NOT NULL,
  points INTEGER NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE history ENABLE ROW LEVEL SECURITY;

-- Create policies for app_users table
CREATE POLICY "Users can view their own data" ON app_users
  FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update their own data" ON app_users
  FOR UPDATE USING (auth.uid()::text = id::text);

CREATE POLICY "Users can insert their own data" ON app_users
  FOR INSERT WITH CHECK (auth.uid()::text = id::text);

-- Create policies for students table
CREATE POLICY "Users can view their own students" ON students
  FOR SELECT USING (auth.uid()::text = owner_id::text);

CREATE POLICY "Users can insert their own students" ON students
  FOR INSERT WITH CHECK (auth.uid()::text = owner_id::text);

CREATE POLICY "Users can update their own students" ON students
  FOR UPDATE USING (auth.uid()::text = owner_id::text);

CREATE POLICY "Users can delete their own students" ON students
  FOR DELETE USING (auth.uid()::text = owner_id::text);

-- Create policies for history table
CREATE POLICY "Users can view history of their students" ON history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = history.student_id 
      AND students.owner_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert history for their students" ON history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = history.student_id 
      AND students.owner_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete history of their students" ON history
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = history.student_id 
      AND students.owner_id::text = auth.uid()::text
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_students_owner_id ON students(owner_id);
CREATE INDEX IF NOT EXISTS idx_history_student_id ON history(student_id);
CREATE INDEX IF NOT EXISTS idx_history_t ON history(t);
