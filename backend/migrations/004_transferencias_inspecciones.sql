
-- ==========================================================
-- MIGRACIÓN 004
-- COLMENARES TRES PINOS
-- VINCULACIÓN DE TRANSFERENCIAS CON INSPECCIONES
-- ==========================================================
--
-- Agrega información detallada sobre los marcos
-- transferidos durante una inspección.
--
-- Los campos son opcionales para conservar
-- las transferencias históricas.
-- ==========================================================

BEGIN;

-- ==========================================================
-- 1. AGREGAR INSPECCIÓN DE ORIGEN
-- ==========================================================

ALTER TABLE public.transferencias_marcos
ADD COLUMN IF NOT EXISTS inspeccion_id BIGINT;

-- ==========================================================
-- 2. AGREGAR UBICACIÓN DEL MARCO
-- ==========================================================

ALTER TABLE public.transferencias_marcos
ADD COLUMN IF NOT EXISTS ubicacion VARCHAR(20);

-- ==========================================================
-- 3. AGREGAR NÚMERO DE MARCO
-- ==========================================================

ALTER TABLE public.transferencias_marcos
ADD COLUMN IF NOT EXISTS numero_marco INTEGER;

-- ==========================================================
-- 4. AGREGAR CONTENIDO DEL MARCO
-- ==========================================================

ALTER TABLE public.transferencias_marcos
ADD COLUMN IF NOT EXISTS contenido VARCHAR(30);

-- ==========================================================
-- 5. CLAVE FORÁNEA DE INSPECCIÓN
-- ==========================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_transferencia_inspeccion'
          AND conrelid = 'public.transferencias_marcos'::regclass
    ) THEN
        ALTER TABLE public.transferencias_marcos
        ADD CONSTRAINT fk_transferencia_inspeccion
        FOREIGN KEY (inspeccion_id)
        REFERENCES public.inspecciones(id);
    END IF;
END $$;

-- ==========================================================
-- 6. VALIDAR UBICACIÓN
-- ==========================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_transferencia_ubicacion'
          AND conrelid = 'public.transferencias_marcos'::regclass
    ) THEN
        ALTER TABLE public.transferencias_marcos
        ADD CONSTRAINT ck_transferencia_ubicacion
        CHECK (
            ubicacion IS NULL
            OR ubicacion IN ('CAMARA_CRIA', 'ALZA')
        );
    END IF;
END $$;

-- ==========================================================
-- 7. VALIDAR NÚMERO DEL MARCO
-- ==========================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_transferencia_numero_marco'
          AND conrelid = 'public.transferencias_marcos'::regclass
    ) THEN
        ALTER TABLE public.transferencias_marcos
        ADD CONSTRAINT ck_transferencia_numero_marco
        CHECK (
            numero_marco IS NULL
            OR numero_marco BETWEEN 1 AND 10
        );
    END IF;
END $$;

-- ==========================================================
-- 8. VALIDAR CONTENIDO
-- ==========================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_transferencia_contenido'
          AND conrelid = 'public.transferencias_marcos'::regclass
    ) THEN
        ALTER TABLE public.transferencias_marcos
        ADD CONSTRAINT ck_transferencia_contenido
        CHECK (
            contenido IS NULL
            OR contenido IN (
                'MIEL_Y_CRIA',
                'SOLO_CRIA',
                'SOLO_MIEL',
                'CERA_ESTIRADA',
                'CERA_ESTAMPADA',
                'CERA_UNTADA',
                'SIN_MARCO'
            )
        );
    END IF;
END $$;

-- ==========================================================
-- 9. ÍNDICE PARA CONSULTAR POR INSPECCIÓN
-- ==========================================================

CREATE INDEX IF NOT EXISTS
ix_transferencias_marcos_inspeccion_id
ON public.transferencias_marcos (inspeccion_id);

COMMIT;
