-- ============================================
-- LeonidaVice.com Database Schema
-- Run this in your Supabase SQL Editor (idempotent — safe to re-run)
-- ============================================

-- 1. User Profiles with Vice City Customizations
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  vehicle_badge TEXT DEFAULT 'muscle_car',
  badge_color TEXT DEFAULT '#ff007f',
  role TEXT DEFAULT 'viewer' CHECK (role IN ('viewer', 'moderator', 'admin')),
  is_shadowbanned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Chat Rooms (Drive-In Theaters)
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  current_video_id TEXT DEFAULT 'QdBZY2fkU-0',
  current_video_title TEXT DEFAULT 'GTA VI — Welcome to Leonida',
  is_active BOOLEAN DEFAULT TRUE,
  max_capacity INT DEFAULT 500,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Chat Messages
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL CHECK (char_length(content) <= 500),
  is_announcement BOOLEAN DEFAULT FALSE,
  is_flagged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_messages_room_created ON public.messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_user ON public.messages(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_rooms_slug ON public.rooms(slug);

-- 5. Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies — Profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);

-- Users may update their own profile, but never escalate their own role / shadowban state.
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND is_shadowbanned = (SELECT p.is_shadowbanned FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id AND role = 'viewer' AND is_shadowbanned = FALSE);

-- 7. RLS Policies — Messages
DROP POLICY IF EXISTS "Anyone can read messages" ON public.messages;
CREATE POLICY "Anyone can read messages"
  ON public.messages FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can post messages" ON public.messages;
CREATE POLICY "Authenticated users can post messages"
  ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 8. RLS Policies — Rooms
DROP POLICY IF EXISTS "Anyone can view rooms" ON public.rooms;
CREATE POLICY "Anyone can view rooms"
  ON public.rooms FOR SELECT USING (true);

-- 9. Default Room
INSERT INTO public.rooms (slug, title, description, current_video_id) VALUES
  ('main-theater', 'Main Theater', 'The main GTA VI drive-in experience', 'QdBZY2fkU-0')
ON CONFLICT (slug) DO NOTHING;

-- 10. Auto-create profile on signup (trigger function)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(regexp_replace(NEW.raw_user_meta_data ->> 'username', '[^a-zA-Z0-9_]', '', 'g'), ''),
      'driver_' || substr(NEW.id::text, 1, 8)
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN unique_violation THEN
  -- Username already taken: fall back to a guaranteed-unique handle instead of failing signup
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, 'driver_' || substr(NEW.id::text, 1, 8))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
