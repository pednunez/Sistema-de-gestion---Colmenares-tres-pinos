# Sistema de Gestión — Colmenares Tres Pinos

Sistema web y móvil desarrollado como proyecto Capstone para apoyar el control operativo y la trazabilidad de las colmenas de **Colmenares Tres Pinos**.

El sistema permitirá centralizar la información de los apiarios, colmenas, inspecciones, tratamientos y transferencias de marcos, facilitando el seguimiento histórico de cada colmena y apoyando la toma de decisiones del apicultor.

## Objetivo

Desarrollar un sistema web y móvil para el control operativo y la trazabilidad de las colmenas de los tres apiarios de Colmenares Tres Pinos, permitiendo registrar, consultar y centralizar información relacionada con:

- Apiarios
- Colmenas
- Inspecciones
- Tratamientos
- Transferencias de marcos
- Historial de colmenas
- Usuarios
- Auditoría
- Identificación mediante códigos QR

## Apiarios

Actualmente el proyecto considera tres apiarios:

- Mandinga
- Culiprán
- Popeta

## Arquitectura

El sistema utiliza una arquitectura por capas.

```text
Frontend
React
   ↓
API REST
   ↓
Backend
FastAPI / Python
   ↓
SQLAlchemy + Psycopg
   ↓
PostgreSQL
```

## Tecnologías