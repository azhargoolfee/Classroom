# Supabase Setup Guide

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up
2. Create a new project:
   - Project name: `khadi-classroom`
   - Database password: (choose a strong password)
   - Region: Choose closest to you
3. Wait for setup (takes 2-3 minutes)

## 2. Get Your Credentials

1. Go to Settings → API
2. Copy these values:
   - **Project URL**: `https://your-project.supabase.co`
   - **Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

## 3. Set Up Database Tables

1. Go to SQL Editor in Supabase
2. Run the SQL from `supabase-setup.sql` file
3. This creates all necessary tables and security policies

## 4. Set Environment Variables

Create a `.env` file with:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
JWT_SECRET=your-super-secret-jwt-key-change-me
PORT=3000
```

## 5. Deploy to Render

1. Connect your GitHub repo to Render
2. Set environment variables in Render dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` 
   - `JWT_SECRET`
3. Deploy!

## Benefits

✅ **Data persists across all devices**
✅ **Works on free Render tier**
✅ **Real-time updates**
✅ **Secure with Row Level Security**
✅ **Scalable PostgreSQL database**
