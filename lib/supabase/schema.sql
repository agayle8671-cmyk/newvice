-- ============================================
-- LeonidaVice.com Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. User Profiles with Vice City Customizations
CREATE TABLE public.profiles (
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
CREATE TABLE public.rooms (
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
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL CHECK (char_length(content) <= 500),
  is_announcement BOOLEAN DEFAULT FALSE,
  is_flagged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Indexes for Performance
CREATE INDEX idx_messages_room_created ON public.messages(room_id, created_at DESC);
CREATE INDEX idx_messages_user ON public.messages(user_id);
CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_rooms_slug ON public.rooms(slug);

-- 5. Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies — Profiles
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 7. RLS Policies — Messages
CREATE POLICY "Anyone can read messages"
  ON public.messages FOR SELECT USING (true);

CREATE POLICY "Authenticated users can post messages"
  ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 8. RLS Policies — Rooms
CREATE POLICY "Anyone can view rooms"
  ON public.rooms FOR SELECT USING (true);

-- 9. Default Room
INSERT INTO public.rooms (slug, title, description, current_video_id) VALUES
  ('main-theater', 'Main Theater', 'The main GTA VI drive-in experience', 'QdBZY2fkU-0');

-- 10. Auto-create profile on signup (trigger function)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'username',
      'driver_' || substr(NEW.id::text, 1, 8)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
