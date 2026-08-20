-- ==============================================================================
-- BARIRUTA - ESQUEMA DE BASE DE DATOS SUPABASE
-- Bariloche.Online - Módulo de Seguimiento en Tiempo Real y Administración
-- ==============================================================================

-- 1. TABLA DE EMPRESAS / PRESTADORES DE TRANSPORTE
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(50) DEFAULT '',
    category VARCHAR(50) DEFAULT 'combi', -- 'combi', 'micro', 'barco', 'excursion'
    mp_public_key TEXT DEFAULT '',        -- Credenciales Mercado Pago para cobro directo
    mp_access_token TEXT DEFAULT '',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Empresa por defecto inicial
INSERT INTO public.companies (name, phone, category) 
VALUES ('Empresa Oscar', '+5492944123456', 'combi')
ON CONFLICT (name) DO NOTHING;

-- 2. TABLA DE VEHÍCULOS / POSICIONES GPS (TRANSMITIDO DESDE LA APP ANDROID)
CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(255) NOT NULL DEFAULT 'Empresa Oscar',
    vehicle_code VARCHAR(100) NOT NULL DEFAULT 'Combi 01',
    driver_name VARCHAR(150) DEFAULT 'Chofer',
    excursion_name VARCHAR(255) DEFAULT 'Excursión Bariloche',
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    speed DOUBLE PRECISION DEFAULT 0.0,
    heading DOUBLE PRECISION DEFAULT 0.0,
    status VARCHAR(50) DEFAULT 'en_camino',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_vehicle_code UNIQUE (company_name, vehicle_code)
);

-- 3. HABILITAR REPLICA IDENTITY Y PUBLICACIÓN EN REALTIME
ALTER TABLE public.companies REPLICA IDENTITY FULL;
ALTER TABLE public.vehicles REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.companies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicles;

-- 4. POLÍTICAS DE SEGURIDAD (Row Level Security - RLS)
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- Permitir lectura y escritura pública para la web y la app móvil Android
CREATE POLICY "Permitir todo en companies" ON public.companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en vehicles" ON public.vehicles FOR ALL USING (true) WITH CHECK (true);
