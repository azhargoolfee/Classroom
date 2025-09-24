-- Supabase setup for Khadi's Classroom
-- Run this in Supabase SQL Editor

-- Enable Row Level Security
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create students table
CREATE TABLE IF NOT EXISTS students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE history ENABLE ROW LEVEL SECURITY;

-- Create policies for users table
CREATE POLICY "Users can view their own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own data" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Create policies for students table
CREATE POLICY "Users can view their own students" ON students
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert their own students" ON students
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own students" ON students
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own students" ON students
  FOR DELETE USING (auth.uid() = owner_id);

-- Create policies for history table
CREATE POLICY "Users can view history of their students" ON history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = history.student_id 
      AND students.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert history for their students" ON history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = history.student_id 
      AND students.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete history of their students" ON history
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = history.student_id 
      AND students.owner_id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_students_owner_id ON students(owner_id);
CREATE INDEX IF NOT EXISTS idx_history_student_id ON history(student_id);
CREATE INDEX IF NOT EXISTS idx_history_t ON history(t);
